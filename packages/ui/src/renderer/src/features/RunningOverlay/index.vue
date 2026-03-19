<template>
  <el-dialog
    modal-class="running-overlay__modal"
    :model-value="isDialogVisible"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    width="400px"
    @closed="handleClosed"
  >
    <div flex flex-col flex-items-center>
      <div class="dialog-header" w-full>
        <div
          h160px
          w-full
          :style="{
            backgroundImage: 'linear-gradient(#666, #666)'
          }"
        ></div>
      </div>
      <div class="dialog-main" w-full mt--20px>
        <!-- v-if="stepsForRender.some(it => ['todo', 'pending', 'rejected'].includes(it.status))" -->
        <div>
          <ul m0 pl0>
            <li
              v-for="(item, index) in stepsForRender"
              :key="index"
              list-style-none
              flex
              justify-start
              pt4px
              pb4px
            >
              <div>
                <span v-if="item.status === 'todo'">🕐</span>
                <span v-if="item.status === 'pending'">👉</span>
                <span v-if="item.status === 'fulfilled'">✅</span>
                <span v-if="item.status === 'rejected'">⛔️</span>
              </div>
              <span ml8px>{{ item.describe }}</span>
            </li>
          </ul>
        </div>
        <div flex justify-between items-center w-full>
          <div>
            {{ runningStatusTextMapByCode[currentRunningStatus] }}
          </div>
          <div>
            <slot name="op-buttons" :current-running-status="currentRunningStatus" />
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
import { useRunningStepsStore } from '@renderer/store'
import { getAutoStartChatSteps } from '../../../../common/prerequisite-step-by-step-check'
import { computed, onUnmounted, ref, watch, onMounted } from 'vue'
import {
  AUTO_CHAT_ERROR_EXIT_CODE,
  RUNNING_STATUS_ENUM
} from '../../../../common/enums/auto-start-chat'
import { gtagRenderer } from '@renderer/utils/gtag'

const props = defineProps({
  workerId: {
    type: String
  },
  runRecordId: {
    type: Number
  }
})

// 从 store 恢复或保存 runRecordId
const effectiveRunRecordId = computed(() => {
  return props.runRecordId ?? runningStepsStore.getRunRecordId(props.workerId || '')
})

const runningStepsStore = useRunningStepsStore()
const steps = ref<any[]>([])

const stepsForRender = computed(() => {
  const clonedSteps = JSON.parse(JSON.stringify(steps.value))
  if (clonedSteps.some((it) => it.status === 'rejected')) {
    return clonedSteps
  }
  const lastFulfilledIndex = clonedSteps.findLastIndex((it) => it.status === 'fulfilled')
  if (lastFulfilledIndex + 1 < clonedSteps.length) {
    clonedSteps[lastFulfilledIndex + 1].status = 'pending'
  }
  return clonedSteps
})

const runningStatusTextMapByCode = {
  [RUNNING_STATUS_ENUM.RUNNING]: '正在运行中',
  [RUNNING_STATUS_ENUM.NORMAL_EXITED]: '程序已正常退出',
  [RUNNING_STATUS_ENUM.ERROR_EXITED]: '程序异常退出'
}

const currentRunningStatus = ref(RUNNING_STATUS_ENUM.RUNNING)

function initSteps() {
  if (!props.workerId) return
  
  // 先从 store 中读取之前保存的状态
  const savedSteps = runningStepsStore.getSteps(props.workerId)
  if (savedSteps && savedSteps.length > 0) {
    steps.value = JSON.parse(JSON.stringify(savedSteps))
    currentRunningStatus.value = runningStepsStore.getRunningStatus(props.workerId) || RUNNING_STATUS_ENUM.RUNNING
  } else {
    // 如果没有保存的状态，则初始化
    const arr = getAutoStartChatSteps()
    arr.forEach((it) => (it.status = 'todo'))
    steps.value = arr
    currentRunningStatus.value = RUNNING_STATUS_ENUM.RUNNING
    // 保存到 store
    runningStepsStore.setSteps(props.workerId, JSON.parse(JSON.stringify(arr)))
    runningStepsStore.setRunningStatus(props.workerId, RUNNING_STATUS_ENUM.RUNNING)
  }
}

function handleClosed() {
  // 关闭时保存当前状态
  if (props.workerId) {
    runningStepsStore.setSteps(props.workerId, JSON.parse(JSON.stringify(steps.value)))
    runningStepsStore.setRunningStatus(props.workerId, currentRunningStatus.value)
  }
}

// 监听 runRecordId 变化，新任务启动时重置
watch(() => props.runRecordId, (newVal, oldVal) => {
  if (newVal !== oldVal && props.workerId) {
    // 保存 runRecordId 到 store
    runningStepsStore.setRunRecordId(props.workerId, newVal || null)
    // 只有当 oldVal 有值（即不是从 null 恢复）且 newVal 有值时，才是新任务
    if (newVal && oldVal) {
      // 新任务，清除之前的状态
      runningStepsStore.clearWorkerState(props.workerId)
      const arr = getAutoStartChatSteps()
      arr.forEach((it) => (it.status = 'todo'))
      steps.value = arr
      currentRunningStatus.value = RUNNING_STATUS_ENUM.RUNNING
      runningStepsStore.setSteps(props.workerId, JSON.parse(JSON.stringify(arr)))
      runningStepsStore.setRunningStatus(props.workerId, RUNNING_STATUS_ENUM.RUNNING)
    }
  }
}, { immediate: true })

// 组件挂载时初始化
onMounted(() => {
  initSteps()
})

watch(
  () => stepsForRender.value,
  (v) => {
    // 保存状态到 store
    if (props.workerId) {
      runningStepsStore.setSteps(props.workerId, JSON.parse(JSON.stringify(steps.value)))
    }
    
    const rejectedItems = v?.filter((it) => it.status === 'rejected')
    if (!rejectedItems.length) {
      return
    }
    gtagRenderer('running_overlay_rejected', {
      stepId: rejectedItems.map((it) => it.id).join(','),
      workerId: props.workerId
    })
  },
  { deep: true }
)

const { ipcRenderer } = electron
function messageHandler(ev, { data }) {
  if (
    data.type !== 'prerequisite-step-by-step-checkstep-by-step-check' ||
    data.runRecordId !== effectiveRunRecordId.value
  ) {
    return
  }
  const { id: stepId, status: stepStatus } = data.step
  const targetStep = steps.value.find((it) => it.id === stepId)
  if (!targetStep) {
    return
  }
  targetStep.status = stepStatus
  // 更新 store 中的状态
  if (props.workerId) {
    runningStepsStore.updateStepStatus(props.workerId, stepId, stepStatus)
  }
}
const unListenMessage = ipcRenderer.on('worker-to-gui-message', messageHandler)
onUnmounted(unListenMessage)

const isDialogVisible = ref(false)
const show = () => {
  isDialogVisible.value = true
  // 显示时重新初始化步骤（用于恢复状态）
  initSteps()
}
const hide = () => {
  isDialogVisible.value = false
}
watch(
  () => isDialogVisible.value,
  (newVal) => {
    if (!newVal) {
      gtagRenderer('running_overlay_shown')
    } else {
      gtagRenderer('running_overlay_hidden')
    }
  }
)
defineExpose({
  show,
  hide
})
ipcRenderer.on('worker-exited', (ev, payload) => {
  const { workerId, code } = payload
  if (
    workerId !== props.workerId
    // || runRecordId !== props.runRecordId
  ) {
    return
  }
  if (code !== AUTO_CHAT_ERROR_EXIT_CODE.NORMAL) {
    currentRunningStatus.value = RUNNING_STATUS_ENUM.ERROR_EXITED
    gtagRenderer('running_overlay_error_exited', {
      exitCode: code,
      workerId: props.workerId
    })
  } else {
    currentRunningStatus.value = RUNNING_STATUS_ENUM.NORMAL_EXITED
    gtagRenderer('running_overlay_normal_exited', {
      exitCode: code,
      workerId: props.workerId
    })
  }
  // 保存最终状态到 store
  if (props.workerId) {
    runningStepsStore.setRunningStatus(props.workerId, currentRunningStatus.value)
  }
})
</script>

<style lang="scss">
.el-overlay.running-overlay__modal {
  position: absolute;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(3px);

  background-color: transparent;
  background-image: radial-gradient(transparent 1px, #fff 1px);
  background-size: 4px 4px;

  .el-overlay-dialog {
    position: absolute;
    pointer-events: all;
  }
  .el-dialog {
    margin: 0;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    .el-dialog__header {
      display: none;
    }
    .el-dialog__body {
      // overflow: hidden;
    }
    .dialog-header {
      display: none;
      // display: flex;
      // justify-content: center;
      // border-radius: 20px 20px 0 0;
      // overflow: hidden;
    }
    background-color: transparent;
    box-shadow: none;
    padding: 0;
    border-radius: 0;
    .dialog-main {
      box-sizing: border-box;
      background: var(--el-dialog-bg-color);
      box-shadow: var(--el-dialog-box-shadow);
      padding: var(--el-dialog-padding-primary);
      //border-radius: 0 0 20px 20px;
      border-radius: 20px;
    }
  }
}
</style>

<template>
  <div class="geek-auto-start-chat-with-boss__running-status">
    <FlyingCompanyLogoList class="flying-company-logo-list" />
    <div class="tip">
      <!-- 等待状态 -->
      <template v-if="isWaiting">
        <article>
          <h1 class="main-title">⏰ 任务已启动，等待中...</h1>
          <p>已开启<b>自动运行时间</b>设置，任务将在设定时间自动开始</p>
          <p>📅 预计开始时间：<b>{{ waitUntilTime }}</b></p>
          <p>⏳ 还需等待约：<b>{{ waitMinutes }} 分钟</b></p>
          <p>🍀 到达设定时间后将自动开始帮你找工作！</p>
        </article>
        <el-button type="danger" size="large" :disabled="isStopping" @click="handleStopButtonClick">取消等待</el-button>
      </template>
      
      <!-- 正常运行状态 -->
      <template v-else-if="!hasError">
        <article>
          <h1 class="main-title">AI正在帮你找工作中</h1>
          <p>💬 正在为你开聊BOSS，请静候佳音</p>
          <p>📱 你可以在<b>手机</b> / <b>平板电脑</b>上，使用BOSS直聘App与为你开聊的BOSS聊天</p>
          <p>🍀 祝你求职顺利！</p>
        </article>
        <el-button type="danger" size="large" :disabled="isStopping" @click="handleStopButtonClick">结束任务</el-button>
      </template>
      
      <!-- 错误状态 -->
      <template v-else>
        <article class="error-state">
          <h1 class="error-title">⚠️ 任务异常退出</h1>
          <div class="error-details">
            <p><b>退出码：</b>{{ exitCode ?? '未知' }}</p>
            <p v-if="errorMessage"><b>错误信息：</b>{{ errorMessage }}</p>
            <p class="error-hint">可能原因：</p>
            <ul>
              <li>浏览器被关闭或崩溃</li>
              <li>网络连接中断</li>
              <li>BOSS直聘页面加载失败</li>
              <li>Cookie 已过期</li>
            </ul>
          </div>
        </article>
        <div class="error-actions">
          <el-button type="primary" @click="handleBack">返回首页</el-button>
          <el-button @click="handleRetry">重试</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FlyingCompanyLogoList from '../../features/FlyingCompanyLogoList/index.vue'
import { ElMessage } from 'element-plus';
import { gtagRenderer } from '@renderer/utils/gtag'
import { useRunningStepsStore } from '@renderer/store'

const { ipcRenderer } = electron
const router = useRouter()
const runningStepsStore = useRunningStepsStore()

const isStopping = ref(false)
const hasError = ref(false)
const exitCode = ref<number | null>(null)
const errorMessage = ref('')
const isWaiting = ref(false)
const waitUntilTime = ref('')
const waitMinutes = ref(0)

const handleStopButtonClick = async () => {
  gtagRenderer('gascwb_stop_button_clicked')
  ipcRenderer.invoke('stop-geek-auto-start-chat-with-boss')
}

const handleBack = () => {
  router.replace('/main-layout/GeekAutoStartChatWithBoss')
}

const handleRetry = () => {
  hasError.value = false
  exitCode.value = null
  errorMessage.value = ''
  // 重新启动
  onMountedHandler()
}

const handleStopping = () => {
  gtagRenderer('gascwb_become_stopping')
  isStopping.value = true
}

const handleStopped = () => {
  gtagRenderer('gascwb_become_stopped')
  router.replace('/main-layout/GeekAutoStartChatWithBoss')
}

const handleWorkerExited = (_: any, message: any) => {
  console.log('[RunningStatus] Worker exited:', message)
  if (message.exitCode !== 0) {
    hasError.value = true
    exitCode.value = message.exitCode
    errorMessage.value = message.error || ''
    gtagRenderer('gascwb_worker_exited_with_error', { 
      exitCode: message.exitCode,
      error: message.error 
    })
  }
}

const handleAutoRunWaiting = (_: any, data: any) => {
  if (data.workerId === 'geekAutoStartWithBossMain') {
    isWaiting.value = true
    waitUntilTime.value = data.waitUntilTime
    waitMinutes.value = data.waitMinutes
    // 保存等待状态到 store
    runningStepsStore.setWaitingState('geekAutoStartWithBossMain', {
      isWaiting: true,
      waitUntilTime: data.waitUntilTime,
      waitMinutes: data.waitMinutes
    })
    ElMessage.info({
      message: `任务将在 ${data.waitUntilTime} 自动开始，预计等待 ${data.waitMinutes} 分钟`,
      duration: 5000
    })
  }
}

ipcRenderer.once('geek-auto-start-chat-with-boss-stopping', handleStopping)
ipcRenderer.once('geek-auto-start-chat-with-boss-stopped', handleStopped)
ipcRenderer.on('worker-exited', handleWorkerExited)
ipcRenderer.on('auto-run-waiting', handleAutoRunWaiting)

onUnmounted(() => {
  ipcRenderer.removeListener('geek-auto-start-chat-with-boss-stopped', handleStopped)
  ipcRenderer.removeListener('geek-auto-start-chat-with-boss-stopping', handleStopping)
  ipcRenderer.removeListener('worker-exited', handleWorkerExited)
  ipcRenderer.removeListener('auto-run-waiting', handleAutoRunWaiting)
})

const onMountedHandler = async () => {
  // 先尝试从 store 恢复等待状态（页面切换时）
  const savedWaitingState = runningStepsStore.getWaitingState('geekAutoStartWithBossMain')
  if (savedWaitingState.isWaiting) {
    isWaiting.value = true
    waitUntilTime.value = savedWaitingState.waitUntilTime
    waitMinutes.value = savedWaitingState.waitMinutes
  }
  
  try {
    const result = await electron.ipcRenderer.invoke('run-geek-auto-start-chat-with-boss')
    console.log('[RunningStatus] Task started:', result)
    // 如果返回的是等待状态，更新UI
    if (result?.isWaiting) {
      isWaiting.value = true
      waitUntilTime.value = result.waitUntilTime
      waitMinutes.value = Math.round(result.waitMs / 1000 / 60)
      // 保存到 store
      runningStepsStore.setWaitingState('geekAutoStartWithBossMain', {
        isWaiting: true,
        waitUntilTime: result.waitUntilTime,
        waitMinutes: Math.round(result.waitMs / 1000 / 60)
      })
    }
  } catch (err) {
    console.error('[RunningStatus] Failed to start:', err)
    hasError.value = true
    errorMessage.value = err instanceof Error ? err.message : '启动失败'
    if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
      gtagRenderer('gascwb_cannot_run_for_corrupt')
      ElMessage.error({
        message: `核心组件损坏，正在尝试修复`
      })
      router.replace('/')
    }
    gtagRenderer('gascwb_cannot_run_for_unknown_error', { err })
  }
}

onMounted(onMountedHandler)
</script>

<style scoped lang="scss">
.geek-auto-start-chat-with-boss__running-status {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  .tip {
    margin: 0 auto;
    margin-top: -15vh;
    max-width: 640px;
    padding: 40px 50px;
    border-radius: 24px;
    // 毛玻璃效果
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.5);
    
    // 深色模式适配
    @media (prefers-color-scheme: dark) {
      background: rgba(30, 30, 30, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    
    article {
      h1 {
        margin-top: 0;
        font-size: 1.8rem;
        margin-bottom: 1.5rem;
        
        &.main-title {
          font-size: 3.5rem;
          font-weight: 700;
          text-align: center;
          color: var(--primary-color, #00b2b2);
          margin-bottom: 2rem;
          letter-spacing: 2px;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
          animation: pulse 2s ease-in-out infinite;
        }
        
        &.error-title {
          font-size: 2.5rem;
          font-weight: 700;
          text-align: center;
          color: #f56c6c;
          margin-bottom: 2rem;
        }
      }
      
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.85;
          transform: scale(1.02);
        }
      }
      
      &.error-state {
        .error-details {
          background: rgba(245, 108, 108, 0.1);
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
          
          p {
            margin: 10px 0;
            font-size: 1.1rem;
            
            &.error-hint {
              margin-top: 20px;
              font-weight: 600;
              color: #666;
            }
          }
          
          ul {
            margin: 10px 0;
            padding-left: 20px;
            
            li {
              margin: 8px 0;
              color: #666;
            }
          }
        }
      }
      
      p {
        margin: 0.8rem 0;
        line-height: 1.6;
        font-size: 1.05rem;
      }
    }
    
    .el-button {
      margin-top: 2rem;
      width: 100%;
      height: 50px;
      font-size: 1.1rem;
      border-radius: 12px;
      font-weight: 500;
    }
    
    .error-actions {
      display: flex;
      gap: 16px;
      margin-top: 2rem;
      
      .el-button {
        flex: 1;
        margin-top: 0;
      }
    }
  }
  .flying-company-logo-list {
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0.35;
  }
}
</style>

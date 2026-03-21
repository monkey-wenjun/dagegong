<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="700px"
    class="chat-history-dialog"
    destroy-on-close
  >
    <div class="chat-history-container">
      <!-- 头部信息 -->
      <div v-if="bossInfo" class="chat-header">
        <div class="boss-info">
          <el-avatar :size="40" :src="bossInfo.bossAvatar" />
          <div class="boss-detail">
            <div class="boss-name">{{ bossInfo.bossName }}</div>
            <div class="boss-title">{{ bossInfo.bossTitle || '-' }}</div>
          </div>
        </div>
        <div v-if="bossInfo.jobName" class="job-info">
          <div class="job-name">{{ bossInfo.jobName }}</div>
          <div class="brand-name">{{ bossInfo.brandName }}</div>
        </div>
      </div>

      <!-- 消息列表 -->
      <div ref="messageContainer" class="chat-messages">
        <div v-if="loading" class="loading-wrapper">
          <el-skeleton :rows="5" animated />
        </div>
        <div v-else-if="messages.length === 0" class="empty-wrapper">
          <el-empty :description="syncFailedReason || '暂无聊天记录'">
            <template #default>
              <div class="sync-actions">
                <p v-if="syncFailedReason" class="sync-error">{{ syncFailedReason }}</p>
                <p v-else>本地没有找到聊天记录，可以尝试从 BOSS 直聘同步</p>
                <el-button
                  type="primary"
                  size="small"
                  :loading="isSyncing"
                  :disabled="!bossInfo?.encryptBossId"
                  @click="handleSyncChatHistory"
                >
                  <template #icon>
                    <i class="i-mdi-sync" />
                  </template>
                  {{ isSyncing ? '同步中...' : '同步聊天记录' }}
                </el-button>
                <p v-if="!bossInfo?.encryptBossId" class="sync-hint">缺少 BOSS ID，无法同步</p>
              </div>
            </template>
          </el-empty>
        </div>
        <template v-else>
          <div
            v-for="(msg, index) in messages"
            :key="msg.mid || index"
            :class="['message-item', msg.style]"
          >
            <div v-if="shouldShowTime(msg, index)" class="message-time">
              {{ formatMessageTime(msg.time) }}
            </div>
            <div class="message-content">
              <div class="message-bubble">
                <!-- 文本消息 -->
                <template v-if="msg.type === 'text' || !msg.type">
                  <div class="text-content">{{ msg.text }}</div>
                </template>
                <!-- 图片消息 -->
                <template v-else-if="msg.type === 'image'">
                  <el-image
                    :src="msg.imageUrl"
                    :preview-src-list="[msg.imageUrl]"
                    fit="contain"
                    class="message-image"
                  />
                </template>
                <!-- 简历消息 -->
                <template v-else-if="msg.type === 'resume'">
                  <div class="resume-content">
                    <i class="i-mdi-file-document-outline" />
                    <span>简历</span>
                  </div>
                </template>
                <!-- 其他类型 -->
                <template v-else>
                  <div class="text-content">{{ msg.text || '[不支持的消息类型]' }}</div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 底部操作栏 -->
      <div class="chat-footer">
        <el-button type="primary" size="small" @click="handleOpenBossChat">
          <template #icon>
            <i class="i-mdi-open-in-new" />
          </template>
          在 BOSS 中打开
        </el-button>
        <el-button v-if="bossInfo?.encryptJobId" type="success" size="small" @click="handleViewJob">
          <template #icon>
            <i class="i-mdi-briefcase-outline" />
          </template>
          查看职位
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElDialog, ElAvatar, ElEmpty, ElSkeleton, ElImage, ElButton, ElMessage } from 'element-plus'
import { ChatMessageRecord } from '@dagegong/sqlite-plugin/dist/entity/ChatMessageRecord'
import dayjs from 'dayjs'

interface Props {
  modelValue: boolean
  bossInfo?: BossInfo
  encryptUserId?: string
  canSync?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canSync: true
})

interface BossInfo {
  encryptBossId: string
  bossName: string
  bossTitle?: string
  bossAvatar?: string
  encryptJobId?: string
  jobName?: string
  brandName?: string
}

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'open-boss-chat': [encryptBossId: string, encryptJobId?: string]
  'view-job': [encryptJobId: string]
  sync: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const dialogTitle = computed(() => {
  if (props.bossInfo?.bossName) {
    return `与 ${props.bossInfo.bossName} 的聊天记录`
  }
  return '聊天记录'
})

const messages = ref<ChatMessageRecord[]>([])
const loading = ref(false)
const isSyncing = ref(false)
const syncFailedReason = ref('')
const messageContainer = ref<HTMLElement>()

// 加载聊天记录
async function loadChatMessages() {
  if (!props.bossInfo?.encryptBossId || !props.encryptUserId) {
    messages.value = []
    return
  }

  loading.value = true
  syncFailedReason.value = ''
  try {
    const result = await electron.ipcRenderer.invoke('get-chat-message-list', {
      encryptBossId: props.bossInfo.encryptBossId,
      encryptUserId: props.encryptUserId
    })
    messages.value = result.data || []

    // 滚动到底部
    nextTick(() => {
      scrollToBottom()
    })
  } catch (err) {
    console.error('加载聊天记录失败:', err)
    ElMessage.error('加载聊天记录失败')
    messages.value = []
  } finally {
    loading.value = false
  }
}

// 同步聊天记录
async function handleSyncChatHistory() {
  console.log('[ChatHistory] Sync called with:', {
    bossInfo: props.bossInfo,
    encryptUserId: props.encryptUserId
  })

  // 检查必要信息
  if (!props.bossInfo?.encryptBossId) {
    ElMessage.warning('缺少 BOSS ID，无法同步')
    return
  }

  isSyncing.value = true
  syncFailedReason.value = ''
  try {
    // 调用同步接口，encryptUserId 可以为空，后端会自动获取
    const result = await electron.ipcRenderer.invoke('sync-boss-chat-history', {
      encryptBossId: props.bossInfo.encryptBossId,
      encryptJobId: props.bossInfo.encryptJobId,
      encryptUserId: props.encryptUserId || ''
    })

    if (result.success) {
      ElMessage.success(`同步成功，共 ${result.data.syncedCount} 条消息`)
      // 重新加载聊天记录
      await loadChatMessages()
      emit('sync')
    } else {
      syncFailedReason.value = result.error || '同步失败'
      ElMessage.error(result.error || '同步失败')
    }
  } catch (err) {
    console.error('同步聊天记录失败:', err)
    const errorMsg = err instanceof Error ? err.message : '同步失败'
    syncFailedReason.value = errorMsg
    ElMessage.error('同步聊天记录失败')
  } finally {
    isSyncing.value = false
  }
}

// 监听显示状态
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      loadChatMessages()
    }
  }
)

// 滚动到底部
function scrollToBottom() {
  if (messageContainer.value) {
    messageContainer.value.scrollTop = messageContainer.value.scrollHeight
  }
}

// 判断是否需要显示时间（5分钟间隔）
function shouldShowTime(msg: ChatMessageRecord, index: number): boolean {
  if (index === 0) return true
  const prevMsg = messages.value[index - 1]
  if (!prevMsg.time || !msg.time) return false

  const prevTime = dayjs(prevMsg.time).valueOf()
  const currTime = dayjs(msg.time).valueOf()
  return currTime - prevTime > 5 * 60 * 1000 // 5分钟
}

// 格式化消息时间
function formatMessageTime(time: Date | null): string {
  if (!time) return ''
  return dayjs(time).format('MM-DD HH:mm')
}

// 在 BOSS 中打开聊天
function handleOpenBossChat() {
  if (props.bossInfo?.encryptBossId) {
    emit('open-boss-chat', props.bossInfo.encryptBossId, props.bossInfo.encryptJobId)
  }
}

// 查看职位
function handleViewJob() {
  if (props.bossInfo?.encryptJobId) {
    emit('view-job', props.bossInfo.encryptJobId)
  }
}

// 暴露方法给父组件
defineExpose({
  loadChatMessages
})
</script>

<style scoped lang="scss">
.chat-history-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }
}

.chat-history-container {
  display: flex;
  flex-direction: column;
  height: 600px;
}

.chat-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--el-fill-color-light);
}

.boss-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.boss-detail {
  .boss-name {
    font-size: 16px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }
  .boss-title {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }
}

.job-info {
  text-align: right;
  .job-name {
    font-size: 14px;
    color: var(--el-text-color-primary);
    font-weight: 500;
  }
  .brand-name {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f5f7fa;
}

.loading-wrapper,
.empty-wrapper {
  padding: 40px 0;
}

.message-item {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;

  &.sent {
    align-items: flex-end;

    .message-bubble {
      background-color: #95ec69;
      color: #000;
      border-bottom-right-radius: 4px;
    }
  }

  &.received {
    align-items: flex-start;

    .message-bubble {
      background-color: #fff;
      color: #000;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
  }
}

.message-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-align: center;
}

.message-content {
  max-width: 70%;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.5;
}

.text-content {
  white-space: pre-wrap;
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
}

.resume-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 8px;

  i {
    font-size: 20px;
    color: var(--el-color-primary);
  }
}

.chat-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: center;
  gap: 12px;
  background-color: var(--el-fill-color-light);
}

.sync-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 14px;
  }

  .sync-error {
    color: var(--el-color-danger);
  }

  .sync-hint {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
  }
}
</style>

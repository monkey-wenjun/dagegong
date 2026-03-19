<template>
  <div class="running-log-page" flex flex-col h-full>
    <div class="log-header" flex flex-items-center flex-justify-between p12px border-b>
      <h3>运行日志</h3>
      <div flex gap8 flex-items-center>
        <!-- 日志级别筛选 -->
        <el-select
          v-model="selectedLogTypes"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="筛选级别"
          size="small"
          style="width: 200px"
          clearable
        >
          <el-option
            v-for="type in logTypeOptions"
            :key="type.value"
            :label="type.label"
            :value="type.value"
          >
            <span flex items-center gap-2>
              <span class="log-type-dot" :class="type.value"></span>
              {{ type.label }}
            </span>
          </el-option>
        </el-select>
        <!-- 关键词搜索 -->
        <el-input
          v-model="filterKeyword"
          placeholder="搜索日志..."
          size="small"
          clearable
          style="width: 150px"
        />
        <el-button size="small" @click="clearLogs">清空日志</el-button>
        <el-button size="small" type="primary" @click="exportLogs">导出日志</el-button>
      </div>
    </div>
    <div ref="logContainer" class="log-container" flex-1 of-auto p8px>
      <div
        v-for="(log, index) in filteredLogs"
        :key="index"
        class="log-item"
        :class="log.type"
      >
        <span class="log-time">[{{ formatTime(log.timestamp) }}]</span>
        <span class="log-type-tag">[{{ getTypeLabel(log.type) }}]</span>
        <span class="log-message">{{ getLogMessage(log) }}</span>
        <div v-if="log.details" class="log-details">
          <pre>{{ formatDetails(log.details) }}</pre>
        </div>
      </div>
      <div v-if="filteredLogs.length === 0" class="empty-tip">
        {{ logs.length === 0 ? '暂无日志' : '没有匹配筛选条件的日志' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import dayjs from 'dayjs'

interface LogItem {
  timestamp: number
  type: 'click' | 'network' | 'navigation' | 'error' | 'info' | 'warn' | 'debug'
  message?: string
  method?: string
  url?: string
  status?: number
  details?: any
}

// 日志类型选项
const logTypeOptions = [
  { label: '信息', value: 'info' },
  { label: '调试', value: 'debug' },
  { label: '请求', value: 'network' },
  { label: '点击', value: 'click' },
  { label: '导航', value: 'navigation' },
  { label: '警告', value: 'warn' },
  { label: '错误', value: 'error' }
]

const logs = ref<LogItem[]>([])
const filterKeyword = ref('')
const selectedLogTypes = ref<string[]>([]) // 选中的日志类型，空数组表示全部
const logContainer = ref<HTMLElement>()

// 过滤后的日志（按关键词和类型筛选）
const filteredLogs = computed(() => {
  let result = logs.value
  
  // 按类型筛选（如果有选中类型）
  if (selectedLogTypes.value.length > 0) {
    result = result.filter((log) => selectedLogTypes.value.includes(log.type))
  }
  
  // 按关键词筛选
  if (filterKeyword.value) {
    const keyword = filterKeyword.value.toLowerCase()
    result = result.filter((log) => {
      const searchText = `${log.message || ''} ${log.url || ''} ${log.method || ''}`.toLowerCase()
      return searchText.includes(keyword)
    })
  }
  
  return result
})

// 格式化时间
const formatTime = (timestamp: number) => {
  return dayjs(timestamp).format('HH:mm:ss.SSS')
}

// 获取类型标签
const getTypeLabel = (type: string) => {
  const labelMap: Record<string, string> = {
    click: '点击',
    network: '请求',
    navigation: '导航',
    error: '错误',
    warn: '警告',
    debug: '调试',
    info: '信息'
  }
  return labelMap[type] || type.toUpperCase()
}

// 获取日志消息
const getLogMessage = (log: LogItem) => {
  if (log.type === 'network') {
    const statusStr = log.status ? ` [${log.status}]` : ''
    return `${log.method} ${log.url}${statusStr}`
  }
  return log.message || ''
}

// 格式化详情
const formatDetails = (details: any) => {
  if (typeof details === 'string') return details
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

// 清空日志
const clearLogs = () => {
  logs.value = []
}

// 导出日志
const exportLogs = () => {
  const content = logs.value
    .map(
      (log) =>
        `[${formatTime(log.timestamp)}] [${getTypeLabel(log.type)}] ${getLogMessage(log)}`
    )
    .join('\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `运行日志_${dayjs().format('YYYYMMDD_HHmmss')}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}

// 添加日志
const addLog = (log: LogItem) => {
  logs.value.push(log)
  // 限制日志数量，最多保留 1000 条
  if (logs.value.length > 1000) {
    logs.value = logs.value.slice(-1000)
  }
  scrollToBottom()
}

// 监听主进程发送的日志
let logListener: (() => void) | null = null

onMounted(() => {
  // 监听运行日志
  logListener = electron.ipcRenderer.on('browser-running-log', (_, log: LogItem) => {
    addLog(log)
  })

  // 获取历史日志
  electron.ipcRenderer.invoke('get-running-logs').then((historyLogs: LogItem[]) => {
    if (historyLogs && historyLogs.length > 0) {
      logs.value = historyLogs
      scrollToBottom()
    }
  })
})

onUnmounted(() => {
  if (logListener) {
    logListener()
  }
})
</script>

<style scoped lang="scss">
.running-log-page {
  background-color: #0d0d0d;
  color: #d4d4d4;
  height: 100%;
  width: 100%;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  margin-left: -20px;
  padding-left: 20px;
}

.log-header {
  background-color: #0d0d0d;
  border-bottom: 1px solid #333;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: #e0e0e0;
  }
}

.log-container {
  background-color: #0d0d0d;
  display: flex;
  flex-direction: column;

  .empty-tip {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #6e7681;
    font-size: 14px;
  }
}

.log-item {
  font-size: 13px;
  line-height: 1.6;
  padding: 2px 4px;
  white-space: pre-wrap;
  word-break: break-all;

  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  .log-time {
    color: #6e7681;
    margin-right: 8px;
  }

  .log-type-tag {
    margin-right: 8px;
    font-weight: bold;
  }

  .log-message {
    color: #d4d4d4;
  }

  .log-details {
    margin-left: 120px;
    margin-top: 2px;
    padding: 4px 8px;
    background-color: #1a1a1a;
    border-left: 2px solid #444;

    pre {
      margin: 0;
      font-size: 12px;
      color: #a0a0a0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }

  // 不同类型日志的颜色
  &.click {
    .log-type-tag {
      color: #79c0ff;
    }
  }

  &.network {
    .log-type-tag {
      color: #7ee787;
    }
  }

  &.navigation {
    .log-type-tag {
      color: #ffa657;
    }
  }

  &.error {
    .log-type-tag {
      color: #ff7b72;
    }
    .log-message {
      color: #ff7b72;
    }
  }

  &.warn {
    .log-type-tag {
      color: #ffa657;
    }
    .log-message {
      color: #ffa657;
    }
  }

  &.debug {
    .log-type-tag {
      color: #8b949e;
    }
    .log-message {
      color: #8b949e;
    }
  }

  &.info {
    .log-type-tag {
      color: #d2a8ff;
    }
  }
}

// 日志类型选择器中的颜色指示点
.log-type-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  
  &.info { background-color: #d2a8ff; }
  &.debug { background-color: #8b949e; }
  &.network { background-color: #7ee787; }
  &.click { background-color: #79c0ff; }
  &.navigation { background-color: #ffa657; }
  &.warn { background-color: #ffa657; }
  &.error { background-color: #ff7b72; }
}

// Element Plus 样式覆盖
:deep(.el-select) {
  .el-select__tags {
    .el-tag {
      background-color: #333;
      border-color: #444;
      color: #d4d4d4;
    }
  }
}
</style>

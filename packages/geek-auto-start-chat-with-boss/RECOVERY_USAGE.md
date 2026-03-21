# 浏览器崩溃自动恢复使用说明

## 概述

本模块实现了浏览器崩溃后自动重启功能，并且保持前端无感知。

## 特性

- 🔄 **自动重启**：浏览器崩溃后自动重启，无需人工干预
- ⏱️ **指数退避**：使用指数退避策略避免频繁重启（2s, 4s, 8s, 16s, 32s...）
- 📊 **状态保持**：保存执行状态，恢复后从断点继续
- 🚫 **重复保护**：记录已处理的职位，避免重复沟通
- 🎭 **前端无感知**：通过 hooks 通知前端，UI 无需特殊处理
- ⚠️ **最大重试限制**：最多重试 5 次，防止无限循环

## 快速开始

### 方式一：使用便捷的自动重启函数（推荐）

```javascript
import { runMainLoopWithAutoRestart, stopAutoRestart } from '@dagegong/geek-auto-start-chat-with-boss'

// 启动带自动重启的主循环
await runMainLoopWithAutoRestart({
  logInfo: (msg) => console.log(msg),
  logError: (msg) => console.error(msg),
  // ... 其他 hooks
})

// 手动停止（可选）
await stopAutoRestart()
```

### 方式二：使用包装器（更灵活）

```javascript
import { createAutoRestartWrapper } from '@dagegong/geek-auto-start-chat-with-boss'

const wrapper = createAutoRestartWrapper({
  logInfo: (msg) => console.log(msg),
  logError: (msg) => console.error(msg),
  // ... 其他 hooks
})

// 监听恢复事件
wrapper.eventBus.on('recovering', (state) => {
  console.log(`正在恢复，第 ${state.crashCount} 次尝试`)
})

wrapper.eventBus.on('crashed', ({ error, state }) => {
  console.log(`浏览器崩溃: ${error.message}`)
})

wrapper.eventBus.on('maxRetriesReached', () => {
  console.log('已达到最大重试次数')
})

// 启动
await wrapper.start()

// 停止
wrapper.stop()

// 获取状态
const status = wrapper.getStatus()
console.log(status.isRunning)
console.log(status.state.crashCount)
```

### 方式三：继续使用普通 mainLoop（无自动恢复）

```javascript
import { mainLoop } from '@dagegong/geek-auto-start-chat-with-boss'

await mainLoop(hooks)
```

## Hooks 增强

崩溃恢复模块会自动跟踪以下阶段，通过 hooks 触发：

| Hook | 阶段 | 说明 |
|------|------|------|
| `puppeteerLaunched` | `LAUNCHING_BROWSER` | 浏览器启动 |
| `pageGotten` | `SETTING_COOKIES` | 获取页面 |
| `mainFlowWillLaunch` | `NAVIGATING` | 主流程即将启动 |
| `jobDetailIsGetFromRecommendList` | `PROCESSING_JOBS` | 处理职位详情 |
| `newChatWillStartup` | `CHATTING` | 即将开始沟通 |
| `newChatStartup` | `PROCESSING_JOBS` | 沟通完成 |

## 恢复状态文件

恢复状态保存在 `runtime-data/recovery-state.json`：

```json
{
  "isRecovering": false,
  "crashCount": 2,
  "lastCrashTime": "2026-03-21T12:53:19.000Z",
  "currentPhase": "processing_jobs",
  "resumeContext": {
    "currentFilterIndex": null,
    "currentJobId": "some-job-id",
    "currentPage": null,
    "dailyChatCount": 15,
    "lastAction": "chat_completed",
    "lastProcessedJobIds": ["job-1", "job-2", "job-3"]
  }
}
```

## 前端集成建议

### 显示恢复状态

```javascript
const wrapper = createAutoRestartWrapper({
  logInfo: (msg) => {
    // 发送到前端
    ipcRenderer.send('log', { level: 'info', message: msg })
  },
  logError: (msg) => {
    ipcRenderer.send('log', { level: 'error', message: msg })
  }
})

wrapper.eventBus.on('recovering', (state) => {
  // 前端显示"正在恢复..."提示
  ipcRenderer.send('browser-recovering', { 
    attempt: state.crashCount,
    message: `浏览器崩溃，正在进行第 ${state.crashCount} 次恢复...`
  })
})
```

### Vue/React 组件示例

```vue
<template>
  <div v-if="isRecovering" class="recovery-toast">
    <span class="spinner"></span>
    浏览器正在恢复 ({{ recoveryAttempt }}/5)...
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ipcRenderer } from 'electron'

const isRecovering = ref(false)
const recoveryAttempt = ref(0)

onMounted(() => {
  ipcRenderer.on('browser-recovering', (event, data) => {
    isRecovering.value = true
    recoveryAttempt.value = data.attempt
  })
  
  ipcRenderer.on('browser-recovered', () => {
    isRecovering.value = false
  })
})
</script>
```

## 配置参数

在 `browser-crash-recovery.mjs` 中可以调整以下参数：

```javascript
const BACKOFF_CONFIG = {
  initialDelay: 2000,      // 初始延迟 2 秒
  maxDelay: 60000,         // 最大延迟 60 秒
  multiplier: 2,           // 乘数
  maxRetries: 5,           // 最大重试次数
  resetAfter: 300000,      // 5 分钟后重置崩溃计数
}
```

## 常见问题

### Q: 什么情况下会触发自动恢复？

以下错误会触发自动恢复：
- `Browser disconnected`
- `Protocol error`
- `Target closed`
- `Session closed`
- 包含 "Browser"、"browser"、"disconnected" 的错误

### Q: 如何避免误触发？

- 崩溃计数会在 5 分钟后自动重置
- 连续 5 次失败后停止自动恢复
- 手动调用 `stopAutoRestart()` 可以立即停止

### Q: 恢复后能否继续之前的任务？

当前实现会：
1. 恢复 cookies 和 localStorage
2. 跳过已处理的职位（通过 `lastProcessedJobIds`）
3. 从职位列表页面重新开始

**注意**：完全精确地恢复到崩溃时的具体位置需要更复杂的状态管理，当前实现保证了不会重复处理已沟通的职位。

## 调试

启用调试日志：

```javascript
// 环境变量
process.env.DEBUG_RECOVERY = '1'

// 或者修改代码
console.log('[Recovery] 状态:', readRecoveryState())
```

## 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 反复崩溃 | 内存不足 | 增加 `--max_old_space_size` |
| 无法恢复 | 状态文件损坏 | 删除 `runtime-data/recovery-state.json` |
| 恢复后 cookies 失效 | 会话过期 | 重新登录 |
| 达到最大重试次数 | 浏览器安装损坏 | 重新安装 Puppeteer 浏览器 |

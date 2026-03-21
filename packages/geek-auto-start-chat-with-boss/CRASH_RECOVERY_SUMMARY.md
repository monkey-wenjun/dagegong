# 浏览器崩溃自动恢复功能 - 实现总结

## 已完成的修改

### 1. 核心恢复模块 (`browser-crash-recovery.mjs`)

创建了完整的浏览器崩溃自动恢复系统，包含：

- **状态管理**：保存/读取恢复状态 (`readRecoveryState`, `saveRecoveryState`)
- **执行阶段跟踪**：记录当前执行阶段 (`updateExecutionPhase`)
- **已处理职位记录**：防止重复处理 (`recordProcessedJob`, `isJobProcessed`)
- **自动重启包装器**：`createAutoRestartWrapper(mainLoopFn, hooks)`
- **指数退避策略**：2s → 4s → 8s → 16s → 32s (最大60s)
- **崩溃事件监听**：`attachBrowserCrashListener`, `attachPageErrorListener`

### 2. 修改 `index.mjs`

- 导入恢复模块的函数
- 修改 `mainLoop` 函数：
  - 添加 `recoveryOptions` 参数
  - 添加浏览器断开检测机制 (`browserDisconnectPromise`)
  - 改进 `disconnected` 事件处理，抛出可识别的错误
  - 添加页面导航监控
  - 使用 `Promise.race` 包装关键操作，及时检测崩溃
  - 增加崩溃恢复相关的 Chrome 启动参数
- 导出便捷函数：
  - `createAutoRestartWrapper(hooks)` - 创建包装器
  - `runMainLoopWithAutoRestart(hooks)` - 一键启动
  - `stopAutoRestart()` - 停止恢复

### 3. 修改 UI 层 (`GEEK_AUTO_START_CHAT_WITH_BOSS_MAIN/index.ts`)

- 导入 `createAutoRestartWrapper`
- 在 hooks 初始化后创建自动恢复包装器
- 添加事件监听：
  - `recovering`: 通知前端正在恢复
  - `crashed`: 记录崩溃日志
  - `maxRetriesReached`: 达到最大重试次数时通知前端
- 将 `await mainLoop(hooks)` 替换为 `await autoRestartWrapper.start()`
- 添加 `BROWSER_CRASHED` 退出码处理

### 4. 新增退出码 (`auto-start-chat.ts`)

```typescript
BROWSER_CRASHED = 87
```

## 恢复流程

```
1. 浏览器崩溃
   ↓
2. browser.on('disconnected') 触发
   ↓
3. 抛出 BROWSER_CRASHED 错误
   ↓
4. createAutoRestartWrapper 捕获错误
   ↓
5. 保存恢复状态 (crashCount++, lastCrashTime, currentPhase)
   ↓
6. 触发 'crashed' 事件通知前端
   ↓
7. 计算指数退避延迟 (2s, 4s, 8s...)
   ↓
8. 延迟后自动重启 mainLoop
   ↓
9. 触发 'recovering' 事件
   ↓
10. 从断点继续执行（跳过已处理职位）
```

## 前端集成

### 自动发送给前端的消息

```javascript
// 正在恢复
{
  type: 'browser-recovering',
  crashCount: 2,
  maxRetries: 5,
  message: '浏览器崩溃，正在自动恢复 (2/5)...'
}

// 恢复失败
{
  type: 'browser-recovery-failed',
  message: '浏览器连续崩溃多次，已停止自动恢复'
}
```

### Vue 组件示例

```vue
<template>
  <div class="running-status">
    <!-- 恢复提示 -->
    <div v-if="isRecovering" class="recovery-alert">
      <span class="spinner">⟳</span>
      <span>浏览器正在恢复 ({{ recoveryAttempt }}/5)...</span>
    </div>
    
    <!-- 正常状态 -->
    <div v-else class="normal-status">
      运行中...
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ipcRenderer } from 'electron'

const isRecovering = ref(false)
const recoveryAttempt = ref(0)

onMounted(() => {
  ipcRenderer.on('worker-to-gui-message', (event, data) => {
    if (data.type === 'browser-recovering') {
      isRecovering.value = true
      recoveryAttempt.value = data.crashCount
    } else if (data.type === 'browser-recovery-failed') {
      isRecovering.value = false
      // 显示错误提示
      alert(data.message)
    }
  })
})

onUnmounted(() => {
  ipcRenderer.removeAllListeners('worker-to-gui-message')
})
</script>

<style scoped>
.recovery-alert {
  background: #fff3cd;
  color: #856404;
  padding: 10px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
```

## 配置参数

在 `browser-crash-recovery.mjs` 中可调整：

```javascript
const BACKOFF_CONFIG = {
  initialDelay: 2000,      // 初始延迟 2 秒
  maxDelay: 60000,         // 最大延迟 60 秒
  multiplier: 2,           // 乘数
  maxRetries: 5,           // 最大重试次数
  resetAfter: 300000,      // 5 分钟后重置崩溃计数
}
```

## 状态文件

恢复状态保存在 `runtime-data/recovery-state.json`：

```json
{
  "isRecovering": false,
  "crashCount": 2,
  "lastCrashTime": "2026-03-21T12:53:19.000Z",
  "currentPhase": "processing_jobs",
  "resumeContext": {
    "currentJobId": "some-job-id",
    "dailyChatCount": 15,
    "lastAction": "chat_completed",
    "lastProcessedJobIds": ["job-1", "job-2", "job-3"]
  }
}
```

## 使用方式对比

### 方式一：使用自动恢复（推荐）
```javascript
import { runMainLoopWithAutoRestart } from '@dagegong/geek-auto-start-chat-with-boss'

await runMainLoopWithAutoRestart(hooks)  // 自动处理崩溃恢复
```

### 方式二：普通方式（无自动恢复）
```javascript
import { mainLoop } from '@dagegong/geek-auto-start-chat-with-boss'

await mainLoop(hooks)  // 崩溃后需手动重启
```

## 测试建议

1. **模拟崩溃**：
   ```javascript
   // 在浏览器控制台手动杀死进程
   process.kill(browser.process().pid)
   ```

2. **内存压力测试**：
   ```javascript
   // 在页面中制造内存压力
   const arr = []
   setInterval(() => {
     arr.push(new Array(1000000).fill('x'))
   }, 100)
   ```

3. **网络中断测试**：
   ```javascript
   // 断开网络，观察是否触发恢复
   ```

## 注意事项

1. **5次限制**：连续崩溃5次后停止自动恢复，需要人工介入
2. **状态重置**：5分钟后崩溃计数自动重置
3. **Cookie 过期**：如果恢复后登录失效，需要重新登录
4. **资源释放**：确保 `closeBrowserWindow()` 正确清理资源

## 故障排除

| 问题 | 检查项 |
|------|--------|
| 不自动恢复 | 检查 `err.message` 是否包含触发关键词 |
| 频繁崩溃 | 检查内存使用，增加 `--max_old_space_size` |
| 恢复后异常 | 删除 `runtime-data/recovery-state.json` |
| 前端收不到通知 | 检查 `sendToDaemon` 调用是否正确 |

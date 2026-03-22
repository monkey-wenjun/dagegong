import { BrowserWindow } from 'electron'

export interface LogItem {
  timestamp: number
  type: 'click' | 'network' | 'navigation' | 'error' | 'info' | 'ai-reply'
  message?: string
  method?: string
  url?: string
  status?: number
  details?: any
  // AI 回复日志专字段
  bossName?: string
  bossId?: string
  jobName?: string
  receivedMessage?: string
  replyContent?: string
  aiResponse?: string
  isReject?: boolean
}

class RunningLogManager {
  private logs: LogItem[] = []
  private maxLogs = 1000
  private mainWindow: BrowserWindow | null = null
  private sendToDaemon: ((message: any) => void) | null = null

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  setSendToDaemon(sendToDaemonFn: (message: any) => void) {
    this.sendToDaemon = sendToDaemonFn
  }

  addLog(log: LogItem) {
    this.logs.push(log)
    
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
    
    // 发送给渲染进程
    this.sendLogToRenderer(log)
  }

  getLogs(): LogItem[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }

  // 从 worker 进程接收日志并保存（不触发发送）
  addLogFromWorker(log: LogItem) {
    this.logs.push(log)
    
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
    
    // 转发给渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('browser-running-log', log)
    }
  }

  private sendLogToRenderer(log: LogItem) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('browser-running-log', log)
    } else if (this.sendToDaemon) {
      // 如果没有 mainWindow（worker 进程），通过 daemon 转发
      // 使用 worker-to-gui-message 类型，daemon 会自动转发给所有 GUI 客户端
      this.sendToDaemon({
        type: 'worker-to-gui-message',
        data: {
          type: 'browser-running-log',
          log
        }
      })
    }
  }

  // 记录点击操作
  logClick(selector: string, elementText?: string) {
    this.addLog({
      timestamp: Date.now(),
      type: 'click',
      message: elementText ? `点击: ${selector} (${elementText})` : `点击: ${selector}`
    })
  }

  // 记录网络请求
  logNetwork(method: string, url: string, status?: number, details?: any) {
    this.addLog({
      timestamp: Date.now(),
      type: 'network',
      method,
      url,
      status,
      details
    })
  }

  // 记录页面导航
  logNavigation(message: string, url?: string) {
    this.addLog({
      timestamp: Date.now(),
      type: 'navigation',
      message: url ? `${message}: ${url}` : message
    })
  }

  // 记录错误
  logError(message: string, error?: any) {
    this.addLog({
      timestamp: Date.now(),
      type: 'error',
      message,
      details: error
    })
  }

  // 记录普通信息
  logInfo(message: string, details?: any) {
    this.addLog({
      timestamp: Date.now(),
      type: 'info',
      message,
      details
    })
  }

  // 记录 AI 回复
  logAiReply(data: {
    bossName: string
    bossId: string
    jobName?: string
    receivedMessage: string
    replyContent: string
    aiResponse?: string
    isReject?: boolean
  }) {
    const isRejectTag = data.isReject ? '[婉拒] ' : ''
    this.addLog({
      timestamp: Date.now(),
      type: 'ai-reply',
      message: `${isRejectTag}AI 回复 ${data.bossName}: ${data.replyContent.slice(0, 50)}${data.replyContent.length > 50 ? '...' : ''}`,
      bossName: data.bossName,
      bossId: data.bossId,
      jobName: data.jobName,
      receivedMessage: data.receivedMessage,
      replyContent: data.replyContent,
      aiResponse: data.aiResponse,
      isReject: data.isReject
    })
  }
}

export const runningLogManager = new RunningLogManager()

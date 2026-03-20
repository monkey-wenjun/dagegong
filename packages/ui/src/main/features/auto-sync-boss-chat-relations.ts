/**
 * BOSS沟通记录后台自动同步服务
 * 每5分钟自动同步一次沟通记录
 */

import { ipcMain, BrowserWindow } from 'electron'
import { readStorageFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

// 同步状态
interface SyncStatus {
  isEnabled: boolean
  lastSyncTime: Date | null
  lastSyncResult: {
    success: boolean
    syncedCount: number
    error?: string
  } | null
  isRunning: boolean
  nextSyncTime: Date | null
}

const syncStatus: SyncStatus = {
  isEnabled: false,
  lastSyncTime: null,
  lastSyncResult: null,
  isRunning: false,
  nextSyncTime: null
}

let syncTimer: NodeJS.Timeout | null = null
const SYNC_INTERVAL = 5 * 60 * 1000 // 5分钟

// 检查是否正在运行AI沟通任务
function isAutoChatRunning(): boolean {
  return globalThis.__AUTO_CHAT_RUNNING__ === true
}

// 检查是否已登录
function isLoggedIn(): boolean {
  try {
    const cookies = readStorageFile('boss-cookies.json') || []
    return cookies.length > 0
  } catch {
    return false
  }
}

// 执行同步
async function doSync(): Promise<void> {
  if (syncStatus.isRunning) {
    console.log('[AutoSync] 同步已在运行中，跳过本次')
    return
  }

  if (!isLoggedIn()) {
    console.log('[AutoSync] 未登录，跳过同步')
    syncStatus.lastSyncResult = {
      success: false,
      syncedCount: 0,
      error: '未登录'
    }
    return
  }

  if (isAutoChatRunning()) {
    console.log('[AutoSync] AI沟通任务运行中，跳过同步')
    syncStatus.lastSyncResult = {
      success: false,
      syncedCount: 0,
      error: 'AI沟通任务运行中'}
    }
    return
  }

  syncStatus.isRunning = true
  console.log('[AutoSync] 开始同步BOSS沟通记录...')

  try {
    // 通过 IPC 调用同步函数
    const result = await BrowserWindow.getFocusedWindow()?.webContents.executeJavaScript(`
      electron.ipcRenderer.invoke('sync-boss-chat-relations')
    `)
    
    if (!result) {
      // 如果没有焦点窗口，尝试调用内部函数
      const { syncBossChatRelations } = await import('../flow/OPEN_SETTING_WINDOW/ipc/sync-boss-chat-relations')
      const syncResult = await syncBossChatRelations({ headless: true })
      
      syncStatus.lastSyncTime = new Date()
      syncStatus.lastSyncResult = {
        success: syncResult.success,
        syncedCount: syncResult.data?.syncedCount || 0,
        error: syncResult.error
      }

      if (syncResult.success) {
        console.log(`[AutoSync] 同步成功，共 ${syncResult.data?.syncedCount} 条记录`)
        notifyRenderers('auto-sync-completed', {
          success: true,
          syncedCount: syncResult.data?.syncedCount,
          syncTime: syncStatus.lastSyncTime
        })
      } else {
        console.log('[AutoSync] 同步失败:', syncResult.error)
        notifyRenderers('auto-sync-failed', {
          success: false,
          error: syncResult.error
        })
      }
    } else {
      syncStatus.lastSyncTime = new Date()
      syncStatus.lastSyncResult = {
        success: result.success,
        syncedCount: result.data?.syncedCount || 0,
        error: result.error
      }

      if (result.success) {
        console.log(`[AutoSync] 同步成功，共 ${result.data?.syncedCount} 条记录`)
        notifyRenderers('auto-sync-completed', result)
      } else {
        console.log('[AutoSync] 同步失败:', result.error)
        notifyRenderers('auto-sync-failed', result)
      }
    }
  } catch (error) {
    console.error('[AutoSync] 同步异常:', error)
    syncStatus.lastSyncResult = {
      success: false,
      syncedCount: 0,
      error: String(error)
    }
    notifyRenderers('auto-sync-failed', {
      success: false,
      error: String(error)
    })
  } finally {
    syncStatus.isRunning = false
    syncStatus.nextSyncTime = new Date(Date.now() + SYNC_INTERVAL)
  }
}

// 通知所有渲染进程
function notifyRenderers(channel: string, data: any): void {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
}

// 启动自动同步
export function startAutoSync(): void {
  if (syncTimer) {
    console.log('[AutoSync] 自动同步已在运行')
    return
  }

  syncStatus.isEnabled = true
  syncStatus.nextSyncTime = new Date(Date.now() + SYNC_INTERVAL)
  
  console.log('[AutoSync] 启动自动同步，间隔:', SYNC_INTERVAL / 1000 / 60, '分钟')
  
  // 立即执行一次
  doSync()
  
  // 设置定时器
  syncTimer = setInterval(doSync, SYNC_INTERVAL)
}

// 停止自动同步
export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
  syncStatus.isEnabled = false
  syncStatus.nextSyncTime = null
  console.log('[AutoSync] 停止自动同步')
}

// 获取同步状态
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus }
}

// 立即执行一次同步
export async function triggerManualSync(): Promise<void> {
  await doSync()
}

// 初始化 IPC 处理
export function initAutoSyncIpc(): void {
  // 获取自动同步状态
  ipcMain.handle('get-auto-sync-status', () => {
    return getSyncStatus()
  })

  // 启用/禁用自动同步
  ipcMain.handle('set-auto-sync-enabled', (_, enabled: boolean) => {
    if (enabled) {
      startAutoSync()
    } else {
      stopAutoSync()
    }
    return getSyncStatus()
  })

  // 手动触发同步
  ipcMain.handle('trigger-auto-sync', async () => {
    await triggerManualSync()
    return getSyncStatus()
  })
}

// 应用启动时初始化
export function initAutoSyncOnAppStart(): void {
  // 检查配置是否启用了自动同步
  try {
    const config = readStorageFile('app-config.json') || {}
    if (config.autoSyncBossChat !== false) {
      // 默认启用
      startAutoSync()
    }
  } catch {
    // 默认启用
    startAutoSync()
  }
}

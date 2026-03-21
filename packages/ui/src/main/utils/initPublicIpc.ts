import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import gtag from './gtag'
import buildInfo from '../../common/build-info.json'
import os from 'node:os'

// 从 git tag 获取的版本号（构建时注入）
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : buildInfo.version
import fs from 'node:fs'
import path from 'node:path'
import {
  ensureStorageFileExist,
  writeStorageFile,
  configFileNameList,
  readConfigFile,
  readStorageFile,
  writeConfigFile
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { runningLogManager } from '../features/running-log'
import { getBrowserConfig, saveBrowserConfig } from '../features/browser-config'
import { initAutoSyncIpc } from '../features/auto-sync-boss-chat-relations'

export default function initPublicIpc() {
  ipcMain.on(
    'update-window-size',
    (
      ev,
      size: {
        width: number
        height: number
        animate?: boolean
      }
    ) => {
      const win = BrowserWindow.fromWebContents(ev.sender)
      if (!win) {
        return
      }
      win.setMinimumSize(size.width, size.height)
      win.setSize(size.width, size.height, size.animate)
    }
  )
  ipcMain.on('open-external-link', (_, link) => {
    shell.openExternal(link, {
      activate: true
    })
  })
  ipcMain.on('gtag', (ev, { name, params } = {}) => {
    gtag(name, {
      ...params,
      electron_log_source: 'renderer'
    })
  })
  ipcMain.on('send-feed-back-to-github-issue', (ev, payload) => {
    const getIssueUrlWithBody = (issueBody: string = '') => {
      const baseUrl = `https://github.com/dagegong/dagegong/issues/new`
      issueBody = issueBody || ''
      if (!issueBody || !issueBody.trim()) {
        return baseUrl
      }
      const urlObj = new URL(baseUrl)
      urlObj.searchParams.append('body', issueBody)

      return urlObj.toString()
    }

    shell.openExternal(
      getIssueUrlWithBody(`\n\n\n-----
版本号：${appVersion}(${buildInfo.buildVersion})
提交：${buildInfo.buildHash.substring(0, 6)}
操作系统信息: \`${os.type()}\` / \`${os.release()}\` / \`${os.arch()}\``),
      {
        activate: true
      }
    )
  })

  ipcMain.handle('read-storage-file', async (ev, payload) => {
    ensureStorageFileExist()
    return await readStorageFile(payload.fileName)
  })

  ipcMain.handle('write-storage-file', async (ev, payload) => {
    ensureStorageFileExist()
    return await writeStorageFile(payload.fileName, JSON.parse(payload.data))
  })
  ipcMain.handle('get-os-platform', () => {
    return os.platform()
  })
  ipcMain.handle('choose-file', (ev, { fileChooserConfig }) => {
    if (!fileChooserConfig) {
      fileChooserConfig = {}
    }
    const win = BrowserWindow.fromWebContents(ev.sender)
    if (!win) {
      return dialog.showOpenDialog(fileChooserConfig)
    } else {
      return dialog.showOpenDialog(win, fileChooserConfig)
    }
  })
  ipcMain.handle('check-executable-file', (ev, filePath: string) => {
    if (!filePath?.trim()) {
      return {
        message: '文件名无效'
      }
    }
    if (!fs.existsSync(filePath)) {
      return {
        message: '文件不存在'
      }
    }
    if (!fs.statSync(filePath).isFile()) {
      const messageSeg = ['文件不是可执行文件']
      if (os.platform() === 'darwin') {
        messageSeg.push(
          'macOS 平台，可执行文件位于“App包.app/Contents/MacOS/ 文件夹下”，而不是“App包.app”文件夹整体'
        )
      }
      return {
        message: messageSeg.join('；')
      }
    }
    return null
  })

  ipcMain.handle('fetch-config-file-content', async () => {
    const configFileContentList = configFileNameList.map((fileName) => {
      return readConfigFile(fileName)
    })
    const result = {
      config: {}
    }

    configFileNameList.forEach((fileName, index) => {
      result.config[fileName] = configFileContentList[index]
    })

    return result
  })

  // 保存求职全局设置配置
  ipcMain.handle('save-common-job-condition-config', async (_ev, payload) => {
    console.log('[IPC] save-common-job-condition-config called', payload)
    await writeConfigFile('common-job-condition-config.json', payload)
    return { success: true }
  })

  // PDF 简历解析
  ipcMain.handle('parse-pdf-resume', async (ev, { filePath }: { filePath: string }) => {
    try {
      // 动态导入 pdf-parse
      const pdfParse = await import('pdf-parse').then((m) => m.default || m)

      // 读取 PDF 文件
      const dataBuffer = fs.readFileSync(filePath)
      const pdfData = await pdfParse(dataBuffer)

      return {
        success: true,
        text: pdfData.text,
        info: {
          pages: pdfData.numpages,
          fileName: path.basename(filePath)
        }
      }
    } catch (error) {
      console.error('PDF parse error:', error)
      return {
        success: false,
        error: error.message || 'PDF 解析失败'
      }
    }
  })

  // 运行日志相关 IPC
  ipcMain.handle('get-running-logs', () => {
    return runningLogManager.getLogs()
  })

  ipcMain.handle('clear-running-logs', () => {
    runningLogManager.clearLogs()
    return { success: true }
  })

  // 浏览器配置相关 IPC
  ipcMain.handle('get-browser-config', async () => {
    return await getBrowserConfig()
  })

  ipcMain.handle('save-browser-config', async (_, config) => {
    await saveBrowserConfig(config)
    return { success: true }
  })

  // 获取当前用户信息（从cookie或storage中）
  ipcMain.handle('get-user-info', async () => {
    try {
      // 尝试从storage中获取用户信息
      const cookies = readStorageFile('boss-cookies.json') || []
      const wt2Cookie = cookies.find((c) => c.name === 'wt2')

      // 尝试从数据库获取最近的用户
      const { getPublicDbFilePath } =
        await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs')
      const { initDb } = await import('@dagegong/sqlite-plugin')

      let ds: any
      try {
        ds = await initDb(getPublicDbFilePath())
        const result = await ds.query(
          'SELECT encryptUserId, name FROM user_info ORDER BY ROWID DESC LIMIT 1'
        )
        if (result && result.length > 0) {
          return {
            encryptUserId: result[0].encryptUserId,
            name: result[0].name
          }
        }
      } finally {
        if (ds && ds.isInitialized) {
          await ds.destroy()
        }
      }

      return null
    } catch (error) {
      console.error('Get user info error:', error)
      return null
    }
  })

  // 获取已同步的用户列表（从聊天关系表中提取）
  ipcMain.handle('get-synced-user-list', async () => {
    try {
      const { getPublicDbFilePath } =
        await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs')
      const { initDb } = await import('@dagegong/sqlite-plugin')

      let ds: any
      try {
        ds = await initDb(getPublicDbFilePath())
        // 从 boss_chat_relation 表中获取所有唯一的用户ID，并关联用户名称
        const result = await ds.query(`
          SELECT DISTINCT 
            bcr.encryptUserId,
            COALESCE(ui.name, '用户 ' || substr(bcr.encryptUserId, 1, 8) || '...') as name,
            MAX(bcr.syncTime) as lastSyncTime,
            COUNT(*) as chatCount
          FROM boss_chat_relation bcr
          LEFT JOIN user_info ui ON bcr.encryptUserId = ui.encryptUserId
          GROUP BY bcr.encryptUserId
          ORDER BY lastSyncTime DESC
        `)
        return {
          success: true,
          data: result.map((r: any) => ({
            encryptUserId: r.encryptUserId,
            name: r.name,
            lastSyncTime: r.lastSyncTime,
            chatCount: r.chatCount
          }))
        }
      } finally {
        if (ds && ds.isInitialized) {
          await ds.destroy()
        }
      }
    } catch (error) {
      console.error('Get synced user list error:', error)
      return { success: false, error: error.message }
    }
  })

  // 初始化自动同步 IPC 处理
  initAutoSyncIpc()

  // 初始化 AI 自动回复 IPC
  import('../features/ai-auto-reply-service').then(({ initAiAutoReplyIpc, startAiAutoReply }) => {
    initAiAutoReplyIpc()
    // 如果配置启用，自动启动服务
    startAiAutoReply()
  })
}

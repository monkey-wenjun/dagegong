import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { openDevTools } from '../commands'
import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import { runningLogManager } from '../features/running-log'
export let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    show: true,  // 改为 true，先显示窗口
    autoHideMenuBar: true,
    frame: true,
    // 使用更可靠的图标路径
    icon: path.join(process.resourcesPath || __dirname, 'build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // 设置运行日志管理器的主窗口
    runningLogManager.setMainWindow(mainWindow)
  })
  mainWindow.on('ready-to-show', async () => {
    process.env.NODE_ENV === 'development' &&
      setTimeout(() => {
        mainWindow && openDevTools(mainWindow)
      }, 500)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // 添加错误处理和日志
    const htmlPath = path.join(__dirname, '../renderer/index.html')
    console.log('Loading renderer from:', htmlPath)
    mainWindow.loadFile(htmlPath).catch(err => {
      console.error('Failed to load renderer:', err)
      // 如果加载失败，显示错误信息
      mainWindow?.loadURL(`data:text/html,<h1>Error loading app</h1><p>${err.message}</p>`)
    })
  }

  mainWindow!.once('closed', () => {
    mainWindow = null
  })
  daemonEE.on('message', (message) => {
    if (message.type === 'worker-to-gui-message') {
      mainWindow?.webContents?.send('worker-to-gui-message', message)
      // 转发 worker 进程的日志到渲染进程
      if (message.data?.type === 'browser-running-log' && message.data?.log) {
        // 保存到主进程的日志管理器并转发给渲染进程
        runningLogManager.addLogFromWorker(message.data.log)
      }
    }
  })
  daemonEE.on('error', (err) => {
    console.log(err)
  })
  return mainWindow!
}

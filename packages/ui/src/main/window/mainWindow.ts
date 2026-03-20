import { BrowserWindow, shell, app } from 'electron'
import path from 'path'
import { openDevTools } from '../commands'
import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import { runningLogManager } from '../features/running-log'
export let mainWindow: BrowserWindow | null = null

// 获取应用图标路径
function getIconPath(): string {
  // 优先使用应用资源目录
  if (app.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, 'build/icon.ico')
  }
  // 开发模式下使用项目目录
  return path.join(app.getAppPath(), 'build/icon.ico')
}

export function createMainWindow(): BrowserWindow {
  const iconPath = getIconPath()
  console.log('[MainWindow] Using icon:', iconPath)
  console.log('[MainWindow] __dirname:', __dirname)
  console.log('[MainWindow] app.getAppPath():', app.getAppPath())
  console.log('[MainWindow] process.resourcesPath:', process.resourcesPath)
  console.log('[MainWindow] app.isPackaged:', app.isPackaged)
  
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    show: false, // 先不显示，等加载完成后再显示
    autoHideMenuBar: true,
    frame: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 只使用一个 ready-to-show 事件处理器
  mainWindow.once('ready-to-show', () => {
    console.log('[MainWindow] Window ready to show')
    mainWindow?.show()
    mainWindow?.focus()
    // 设置运行日志管理器的主窗口
    runningLogManager.setMainWindow(mainWindow)
    
    // 开发模式下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        mainWindow && openDevTools(mainWindow)
      }, 500)
    }
  })

  // 监听加载失败事件
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[MainWindow] Failed to load:', errorCode, errorDescription)
  })

  // 监听控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console ${level}]:`, message)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    console.log('[MainWindow] Loading from dev server:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // 添加错误处理和日志
    const htmlPath = path.join(__dirname, '../renderer/index.html')
    console.log('[MainWindow] Loading renderer from:', htmlPath)
    console.log('[MainWindow] File exists check will be performed...')
    
    mainWindow.loadFile(htmlPath).then(() => {
      console.log('[MainWindow] Renderer loaded successfully')
    }).catch(err => {
      console.error('[MainWindow] Failed to load renderer:', err)
      // 如果加载失败，显示错误信息
      mainWindow?.loadURL(`data:text/html,<h1>Error loading app</h1><p>${err.message}</p><p>Path: ${htmlPath}</p>`)
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
    console.log('[MainWindow] Daemon error:', err)
  })
  
  return mainWindow!
}

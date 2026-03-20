---
name: electron-best-practices
description: "Electron application best practices for the dagegong project. Covers main/renderer process communication, security best practices, IPC patterns, window management, and native module handling."
---

# Electron Best Practices for dagegong

Comprehensive guide for Electron development in the dagegong project.

## Architecture Overview

### Process Separation

```
┌─────────────────────────────────────────────────────────┐
│                      Main Process                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  IPC Handlers │  │  Plugin Mgr  │  │  DB Manager  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                                            │
│         │ IPC (contextBridge)                        │
│         ↓                                            │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Preload Script                      │ │
│  │  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │  contextBridge │  │  ipcRenderer (exposed)   │ │ │
│  │  └──────────────┘  └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Vue 3 App   │  │  IPC Invoker │  │  UI Components│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                        │
│  (Cannot access Node.js APIs directly)                 │
└─────────────────────────────────────────────────────────┘
```

## Security Best Practices

### Context Isolation

Always enable context isolation and use context bridge:

```typescript
// main/window.ts
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,  // Always true
    nodeIntegration: false,  // Always false
    preload: path.join(__dirname, '../preload/index.js')
  }
})
```

### Context Bridge Pattern

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels } from '../shared/ipc-types'

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Invoke methods (renderer → main, async)
  invoke: <T>(channel: IpcChannels, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  
  // Send methods (renderer → main, fire and forget)
  send: (channel: IpcChannels, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },
  
  // Listen to events from main
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    
    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  
  // Once listener
  once: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args))
  }
})
```

### IPC Channel Whitelist

```typescript
// shared/ipc-types.ts
export type IpcChannels =
  | 'db:query'
  | 'db:insert'
  | 'browser:launch'
  | 'browser:close'
  | 'plugin:load'
  | 'config:get'
  | 'config:set'
  | 'dialog:showOpen'
  | 'dialog:showSave'

// Validate channels in preload
const VALID_CHANNELS: IpcChannels[] = [
  'db:query', 'db:insert', 'browser:launch',
  'browser:close', 'plugin:load', 'config:get',
  'config:set', 'dialog:showOpen', 'dialog:showSave'
]

function validateChannel(channel: string): channel is IpcChannels {
  return VALID_CHANNELS.includes(channel as IpcChannels)
}
```

## IPC Patterns

### Request-Response Pattern

```typescript
// main/ipc/db-handlers.ts
import { ipcMain } from 'electron'
import { dataSource } from '../db/data-source'

ipcMain.handle('db:query', async (event, sql: string, params?: any[]) => {
  try {
    const result = await dataSource.query(sql, params)
    return { success: true, data: result }
  } catch (error) {
    console.error('DB Query error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

// renderer usage
async function fetchUsers() {
  const result = await window.electronAPI.invoke('db:query', 
    'SELECT * FROM users LIMIT ?', [10]
  )
  
  if (result.success) {
    return result.data
  } else {
    throw new Error(result.error)
  }
}
```

### Event-Based Pattern

```typescript
// main - send progress updates
function processLargeFile(filePath: string) {
  const win = BrowserWindow.getFocusedWindow()
  
  const processor = new FileProcessor(filePath)
  
  processor.on('progress', (percent: number) => {
    win?.webContents.send('file:progress', { filePath, percent })
  })
  
  processor.on('complete', (result: ProcessResult) => {
    win?.webContents.send('file:complete', { filePath, result })
  })
  
  processor.on('error', (error: Error) => {
    win?.webContents.send('file:error', { filePath, error: error.message })
  })
}

// renderer - listen to events
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  const cleanupProgress = window.electronAPI.on('file:progress', 
    ({ filePath, percent }) => {
      updateProgress(filePath, percent)
    }
  )
  
  const cleanupComplete = window.electronAPI.on('file:complete',
    ({ filePath, result }) => {
      handleComplete(filePath, result)
    }
  )
  
  // Cleanup listeners on unmount
  onUnmounted(() => {
    cleanupProgress()
    cleanupComplete()
  })
})
```

### Type-Safe IPC Wrapper

```typescript
// shared/ipc-client.ts
interface IpcDefinitions {
  'db:query': {
    input: [sql: string, params?: any[]]
    output: { success: boolean; data?: any[]; error?: string }
  }
  'browser:launch': {
    input: [options: BrowserOptions]
    output: { success: boolean; browserId?: string; error?: string }
  }
  'config:get': {
    input: [key: string]
    output: any
  }
}

// Type-safe invoke wrapper
export function invoke<K extends keyof IpcDefinitions>(
  channel: K,
  ...args: IpcDefinitions[K]['input']
): Promise<IpcDefinitions[K]['output']> {
  return window.electronAPI.invoke(channel, ...args)
}
```

## Window Management

### Window State Management

```typescript
// main/window-state.ts
import { app, BrowserWindow, screen } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
  isFullScreen?: boolean
}

const stateFilePath = path.join(app.getPath('userData'), 'window-state.json')

export function loadWindowState(): WindowState {
  try {
    const data = fs.readFileSync(stateFilePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    // Default state
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    return {
      width: Math.min(1200, width),
      height: Math.min(800, height)
    }
  }
}

export function saveWindowState(win: BrowserWindow) {
  const bounds = win.getBounds()
  const state: WindowState = {
    ...bounds,
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen()
  }
  
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

// Usage in main window creation
function createWindow() {
  const state = loadWindowState()
  
  const win = new BrowserWindow({
    ...state,
    show: false,  // Don't show until ready
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })
  
  if (state.isMaximized) {
    win.maximize()
  }
  
  // Save state on close
  win.on('close', () => {
    saveWindowState(win)
  })
  
  win.once('ready-to-show', () => {
    win.show()
  })
  
  return win
}
```

### Multi-Window Pattern

```typescript
// main/window-manager.ts
import { BrowserWindow } from 'electron'

interface WindowEntry {
  id: string
  type: 'main' | 'settings' | 'chat'
  window: BrowserWindow
}

class WindowManager {
  private windows: Map<string, WindowEntry> = new Map()
  
  createWindow(type: WindowEntry['type'], id: string, options?: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    // Check if window already exists
    const existing = this.getWindow(id)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return existing
    }
    
    const win = new BrowserWindow({
      ...options,
      webPreferences: {
        contextIsolation: true,
        // ...
      }
    })
    
    this.windows.set(id, { id, type, window: win })
    
    win.on('closed', () => {
      this.windows.delete(id)
    })
    
    return win
  }
  
  getWindow(id: string): BrowserWindow | undefined {
    return this.windows.get(id)?.window
  }
  
  getWindowsByType(type: WindowEntry['type']): BrowserWindow[] {
    return Array.from(this.windows.values())
      .filter(entry => entry.type === type)
      .map(entry => entry.window)
  }
  
  closeAllWindows() {
    this.windows.forEach(entry => {
      if (!entry.window.isDestroyed()) {
        entry.window.close()
      }
    })
  }
}

export const windowManager = new WindowManager()
```

## Native Module Handling

### Better-SQLite3 in Electron

```typescript
// main/db/connection.ts
import * as path from 'path'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function initializeDatabase(dbPath: string): Database.Database {
  // Use native module in main process only
  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  })
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL')
  
  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

// Expose via IPC, not directly
ipcMain.handle('db:transaction', async (event, operations: DbOperation[]) => {
  const database = getDatabase()
  
  const transaction = database.transaction((ops) => {
    for (const op of ops) {
      database.prepare(op.sql).run(op.params)
    }
  })
  
  try {
    transaction(operations)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})
```

### Puppeteer Integration

```typescript
// main/browser/puppeteer-manager.ts
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

interface BrowserInstance {
  id: string
  browser: puppeteer.Browser
  pages: Map<string, puppeteer.Page>
}

class PuppeteerManager {
  private browsers: Map<string, BrowserInstance> = new Map()
  
  async launchBrowser(id: string, options?: puppeteer.LaunchOptions): Promise<string> {
    const browser = await puppeteer.launch({
      headless: false,
      ...options
    })
    
    const instance: BrowserInstance = {
      id,
      browser,
      pages: new Map()
    }
    
    this.browsers.set(id, instance)
    
    // Notify renderer of new browser
    this.notifyBrowserChange(id, 'launched')
    
    return id
  }
  
  async closeBrowser(id: string): Promise<void> {
    const instance = this.browsers.get(id)
    if (instance) {
      await instance.browser.close()
      this.browsers.delete(id)
      this.notifyBrowserChange(id, 'closed')
    }
  }
  
  private notifyBrowserChange(browserId: string, event: string) {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('browser:change', { browserId, event })
    })
  }
}

export const puppeteerManager = new PuppeteerManager()
```

## Error Handling

### Main Process Error Handling

```typescript
// main/index.ts
import { app, dialog } from 'electron'

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  
  dialog.showErrorBox(
    'Application Error',
    `An unexpected error occurred:\n${error.message}`
  )
  
  // Graceful shutdown
  app.quit()
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// IPC error wrapper
function safeIpcHandler<T>(
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<T>
) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: any[]) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      console.error('IPC Handler Error:', error)
      throw error  // Re-throw for renderer to handle
    }
  }
}

// Usage
ipcMain.handle('risky:operation', safeIpcHandler(async (event, data) => {
  // This will have error handling
  return await performRiskyOperation(data)
}))
```

## Build & Distribution

### electron-builder Configuration

```yaml
# electron-builder.yml
appId: com.dagegong.app
productName: dagegong
directories:
  buildResources: build
files:
  - out/**
  - resources/**
  - '!**/.vscode/*'
  - '!src/*'
  - '!node_modules/@sap/hana-client/**'
  - '!node_modules/mongodb/**'
asarUnpack:
  - 'resources/**'
  - 'node_modules/better-sqlite3/**/*.node'
extraResources:
  - from: '../geek-auto-start-chat-with-boss'
    to: 'geek-auto-start-chat-with-boss'
    filter: ['**/*.mjs', '**/*.json']
win:
  target: nsis
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

## Common Pitfalls

### DO
- ✅ Use context isolation
- ✅ Validate all IPC inputs
- ✅ Use type-safe IPC wrappers
- ✅ Handle errors in both processes
- ✅ Clean up event listeners
- ✅ Use the main process for heavy operations

### DON'T
- ❌ Disable context isolation
- ❌ Expose full Node.js APIs to renderer
- ❌ Trust data from renderer without validation
- ❌ Store sensitive data in localStorage
- ❌ Block the main process with sync operations
- ❌ Forget to handle window state

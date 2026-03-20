---
name: error-handling
description: "Error handling standards for the dagegong project. Covers error classification, logging strategies, user-facing error messages, recovery patterns, and cross-process error handling in Electron with Vue and TypeORM."
---

# Error Handling Standards for dagegong

Comprehensive guide for consistent error handling across main process, renderer process, and IPC communication.

## Error Classification

### Error Hierarchy

```
AppError (base)
├── IpcError
│   ├── IpcTimeoutError
│   ├── IpcChannelError
│   └── IpcValidationError
├── DatabaseError
│   ├── ConnectionError
│   ├── QueryError
│   └── ConstraintError
├── BrowserError
│   ├── LaunchError
│   ├── NavigationError
│   └── ElementNotFoundError
├── ValidationError
│   ├── SchemaValidationError
│   └── BusinessRuleError
└── UserError
    ├── AuthenticationError
    ├── PermissionError
    └── NotFoundError
```

### Error Classes

```typescript
// shared/errors/base.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack
    }
  }
}

// shared/errors/ipc.ts
export class IpcError extends AppError {
  constructor(
    message: string,
    code: string = 'IPC_ERROR',
    public channel?: string
  ) {
    super(message, code, 500, { channel })
  }
}

export class IpcTimeoutError extends IpcError {
  constructor(channel: string, timeoutMs: number) {
    super(
      `IPC call to '${channel}' timed out after ${timeoutMs}ms`,
      'IPC_TIMEOUT',
      channel
    )
    this.statusCode = 504
  }
}

export class IpcValidationError extends IpcError {
  constructor(
    channel: string,
    public validationErrors: Record<string, string[]>
  ) {
    super(
      `Invalid parameters for IPC call to '${channel}'`,
      'IPC_VALIDATION_ERROR',
      channel
    )
    this.statusCode = 400
    this.details = { validationErrors }
  }
}

// shared/errors/database.ts
export class DatabaseError extends AppError {
  constructor(
    message: string,
    code: string = 'DB_ERROR',
    public query?: string
  ) {
    super(message, code, 500, { query })
  }
}

export class ConstraintError extends DatabaseError {
  constructor(
    public constraint: string,
    public table: string,
    message?: string
  ) {
    super(
      message || `Constraint violation: ${constraint} on ${table}`,
      'DB_CONSTRAINT_ERROR'
    )
    this.statusCode = 409
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string = 'Database connection failed') {
    super(message, 'DB_CONNECTION_ERROR')
    this.statusCode = 503
  }
}

// shared/errors/browser.ts
export class BrowserError extends AppError {
  constructor(
    message: string,
    code: string = 'BROWSER_ERROR',
    public browserId?: string
  ) {
    super(message, code, 500, { browserId })
  }
}

export class ElementNotFoundError extends BrowserError {
  constructor(
    public selector: string,
    browserId?: string
  ) {
    super(
      `Element not found: ${selector}`,
      'BROWSER_ELEMENT_NOT_FOUND',
      browserId
    )
    this.statusCode = 404
  }
}

// shared/errors/user.ts
export class UserError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number = 400
  ) {
    super(message, code, statusCode)
  }
}

export class AuthenticationError extends UserError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_REQUIRED', 401)
  }
}

export class PermissionError extends UserError {
  constructor(
    message: string = 'Permission denied',
    public requiredPermission?: string
  ) {
    super(message, 'PERMISSION_DENIED', 403)
    this.details = { requiredPermission }
  }
}
```

## Main Process Error Handling

### IPC Handler Wrapper

```typescript
// main/utils/ipc-wrapper.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcValidationError, AppError } from '../../shared/errors'

interface IpcHandlerOptions {
  timeout?: number
  validate?: (args: any[]) => void
  logErrors?: boolean
}

export function handleIpc<T extends (...args: any[]) => any>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Parameters<T>) => ReturnType<T>,
  options: IpcHandlerOptions = {}
) {
  const { timeout = 30000, validate, logErrors = true } = options
  
  ipcMain.handle(channel, async (event, ...args) => {
    const startTime = Date.now()
    
    try {
      // Validation
      if (validate) {
        try {
          validate(args)
        } catch (validationError) {
          throw new IpcValidationError(
            channel,
            { args: [validationError.message] }
          )
        }
      }
      
      // Execute with timeout
      const result = await Promise.race([
        handler(event, ...args),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new IpcTimeoutError(channel, timeout))
          }, timeout)
        })
      ])
      
      // Log success in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[IPC] ${channel} succeeded in ${Date.now() - startTime}ms`)
      }
      
      return {
        success: true,
        data: result
      }
      
    } catch (error) {
      // Convert unknown errors to AppError
      const appError = error instanceof AppError
        ? error
        : new AppError(
            error instanceof Error ? error.message : 'Unknown error',
            'UNKNOWN_ERROR'
          )
      
      // Log error
      if (logErrors) {
        console.error(`[IPC Error] ${channel}:`, {
          error: appError.toJSON(),
          duration: Date.now() - startTime,
          args: process.env.NODE_ENV === 'development' ? args : undefined
        })
      }
      
      return {
        success: false,
        error: appError.message,
        code: appError.code,
        details: appError.details
      }
    }
  })
}

// Usage
import { handleIpc } from './utils/ipc-wrapper'
import { DatabaseError } from '../shared/errors'

handleIpc(
  'db:query',
  async (event, sql: string, params?: any[]) => {
    if (typeof sql !== 'string') {
      throw new IpcValidationError('db:query', {
        sql: ['SQL must be a string']
      })
    }
    
    try {
      return await database.query(sql, params)
    } catch (dbError) {
      throw new DatabaseError(
        'Query execution failed',
        'DB_QUERY_ERROR',
        sql
      )
    }
  },
  {
    timeout: 10000,
    validate: ([sql]) => {
      if (!sql || typeof sql !== 'string') {
        throw new Error('SQL query is required')
      }
    }
  }
)
```

### Global Error Handlers

```typescript
// main/index.ts
import { app, dialog } from 'electron'
import { AppError } from '../shared/errors'

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught Exception:', error)
  
  const appError = error instanceof AppError
    ? error
    : new AppError(
        error instanceof Error ? error.message : 'Unexpected error',
        'UNCAUGHT_EXCEPTION'
      )
  
  // Show error dialog
  dialog.showErrorBox(
    'Application Error',
    `A critical error occurred:\n\n${appError.message}\n\nCode: ${appError.code}`
  )
  
  // Log to file
  logErrorToFile(appError)
  
  // Graceful shutdown
  app.quit()
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Unhandled Rejection at:', promise, 'reason:', reason)
  
  const appError = reason instanceof AppError
    ? reason
    : new AppError(
        reason instanceof Error ? reason.message : String(reason),
        'UNHANDLED_REJECTION'
      )
  
  logErrorToFile(appError)
})

// Graceful shutdown on signals
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

async function gracefulShutdown() {
  console.log('[Shutdown] Starting graceful shutdown...')
  
  try {
    // Close database connections
    await closeDatabaseConnections()
    
    // Close browser instances
    await closeBrowserInstances()
    
    console.log('[Shutdown] Completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error)
    process.exit(1)
  }
}
```

## Renderer Process Error Handling

### API Client Wrapper

```typescript
// renderer/services/api-client.ts
import { IpcError, IpcTimeoutError } from '../../shared/errors'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  details?: Record<string, any>
}

class ApiClient {
  async invoke<T>(
    channel: string,
    ...args: any[]
  ): Promise<T> {
    const timeout = 30000
    
    try {
      const response: ApiResponse<T> = await Promise.race([
        window.electronAPI.invoke(channel, ...args),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new IpcTimeoutError(channel, timeout))
          }, timeout)
        })
      ])
      
      if (!response.success) {
        throw new IpcError(
          response.error || 'IPC call failed',
          response.code || 'IPC_ERROR',
          channel
        )
      }
      
      return response.data as T
      
    } catch (error) {
      // Re-throw known errors
      if (error instanceof IpcError) {
        throw error
      }
      
      // Wrap unknown errors
      throw new IpcError(
        error instanceof Error ? error.message : 'Unknown IPC error',
        'IPC_UNKNOWN',
        channel
      )
    }
  }
}

export const apiClient = new ApiClient()
```

### Vue Error Handler

```typescript
// renderer/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { AppError } from '../shared/errors'

const app = createApp(App)

// Global error handler
app.config.errorHandler = (error, instance, info) => {
  console.error('[Vue Error]', error, info)
  
  const appError = error instanceof AppError
    ? error
    : new AppError(
        error instanceof Error ? error.message : 'Vue runtime error',
        'VUE_ERROR'
      )
  
  // Show error notification
  ElNotification.error({
    title: 'Application Error',
    message: appError.message,
    duration: 5000
  })
  
  // Log to analytics in production
  if (process.env.NODE_ENV === 'production') {
    window.electronAPI.send('error:report', {
      ...appError.toJSON(),
      vueInfo: info,
      timestamp: new Date().toISOString()
    })
  }
}

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise]', event.reason)
  
  ElNotification.error({
    title: 'Async Operation Failed',
    message: event.reason?.message || 'An unexpected error occurred',
    duration: 5000
  })
})

app.mount('#app')
```

### Composable Error Handling

```typescript
// renderer/composables/useAsyncAction.ts
import { ref, readonly } from 'vue'
import { AppError } from '../../shared/errors'

interface UseAsyncActionOptions {
  onError?: (error: AppError) => void
  onSuccess?: () => void
  showNotification?: boolean
}

export function useAsyncAction<T extends (...args: any[]) => Promise<any>>(
  action: T,
  options: UseAsyncActionOptions = {}
) {
  const { onError, onSuccess, showNotification = true } = options
  
  const isLoading = ref(false)
  const error = ref<AppError | null>(null)
  
  async function execute(...args: Parameters<T>): Promise<ReturnType<T> | undefined> {
    isLoading.value = true
    error.value = null
    
    try {
      const result = await action(...args)
      
      if (showNotification) {
        ElMessage.success('Operation completed successfully')
      }
      
      onSuccess?.()
      return result
      
    } catch (err) {
      const appError = err instanceof AppError
        ? err
        : new AppError(
            err instanceof Error ? err.message : 'Unknown error',
            'UNKNOWN_ERROR'
          )
      
      error.value = appError
      
      if (showNotification) {
        ElMessage.error(appError.message)
      }
      
      onError?.(appError)
      
    } finally {
      isLoading.value = false
    }
  }
  
  function clearError() {
    error.value = null
  }
  
  return {
    isLoading: readonly(isLoading),
    error: readonly(error),
    execute,
    clearError
  }
}

// Usage in component
const { isLoading, error, execute: fetchUser } = useAsyncAction(
  async (userId: string) => {
    return await UserService.getUser(userId)
  },
  {
    onError: (error) => {
      if (error.code === 'NOT_FOUND') {
        router.push('/404')
      }
    }
  }
)

// Template
// <el-alert v-if="error" :title="error.message" type="error" />
// <el-button :loading="isLoading" @click="fetchUser('123')">Load User</el-button>
```

## Error UI Components

### Error Boundary Component

```vue
<!-- components/ErrorBoundary.vue -->
<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <el-result
      icon="error"
      :title="title"
      :sub-title="error.message"
    >
      <template #extra>
        <el-button @click="handleRetry">Retry</el-button>
        <el-button type="primary" @click="handleReset">
          Reset Application
        </el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { AppError } from '../../shared/errors'

interface Props {
  title?: string
  onReset?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Something went wrong'
})

const error = ref<AppError | null>(null)

onErrorCaptured((err) => {
  error.value = err instanceof AppError
    ? err
    : new AppError(
        err instanceof Error ? err.message : 'Unknown error',
        'COMPONENT_ERROR'
      )
  return false  // Stop propagation
})

function handleRetry() {
  error.value = null
}

function handleReset() {
  props.onReset?.()
  window.location.reload()
}
</script>
```

### Error Toast Utility

```typescript
// renderer/utils/error-toast.ts
import { AppError } from '../../shared/errors'

interface ToastOptions {
  duration?: number
  showRetry?: boolean
  onRetry?: () => void
}

export function showErrorToast(
  error: AppError | Error | string,
  options: ToastOptions = {}
) {
  const { duration = 5000, showRetry = false, onRetry } = options
  
  const message = error instanceof AppError
    ? getUserFriendlyMessage(error)
    : error instanceof Error
    ? error.message
    : error
  
  ElNotification.error({
    title: 'Error',
    message,
    duration,
    onClick: showRetry ? onRetry : undefined
  })
}

function getUserFriendlyMessage(error: AppError): string {
  const messageMap: Record<string, string> = {
    'DB_CONNECTION_ERROR': 'Failed to connect to database. Please check your settings.',
    'DB_CONSTRAINT_ERROR': 'This operation conflicts with existing data.',
    'IPC_TIMEOUT': 'The operation took too long. Please try again.',
    'AUTH_REQUIRED': 'Please sign in to continue.',
    'PERMISSION_DENIED': 'You do not have permission to perform this action.',
    'BROWSER_ELEMENT_NOT_FOUND': 'Could not find the expected page element.',
    'NOT_FOUND': 'The requested resource was not found.'
  }
  
  return messageMap[error.code] || error.message
}

// Usage
import { showErrorToast } from '@/utils/error-toast'

try {
  await someOperation()
} catch (error) {
  showErrorToast(error, {
    showRetry: true,
    onRetry: () => someOperation()
  })
}
```

## Logging Strategy

### Structured Logging

```typescript
// shared/logger.ts
import { AppError } from './errors'

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, any>
  error?: AppError
}

class Logger {
  private static instance: Logger
  private logs: LogEntry[] = []
  private maxLogs = 1000
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }
  
  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: AppError) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error
    }
    
    this.logs.push(entry)
    
    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
    
    // Console output
    const consoleMethod = level === 'fatal' ? 'error' : level
    console[consoleMethod](`[${level.toUpperCase()}]`, message, context || '')
    
    // Send to main process in renderer
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('log:write', entry)
    }
  }
  
  debug(message: string, context?: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, context)
    }
  }
  
  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context)
  }
  
  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context)
  }
  
  error(message: string, error?: AppError, context?: Record<string, any>) {
    this.log('error', message, context, error)
  }
  
  fatal(message: string, error: AppError, context?: Record<string, any>) {
    this.log('fatal', message, context, error)
  }
  
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level)
    }
    return [...this.logs]
  }
  
  clear() {
    this.logs = []
  }
}

export const logger = Logger.getInstance()
```

## Best Practices

### DO
- ✅ Use custom error classes for different error types
- ✅ Include error codes for programmatic handling
- ✅ Log errors with context for debugging
- ✅ Show user-friendly error messages
- ✅ Handle errors at appropriate levels
- ✅ Implement retry logic for transient errors
- ✅ Clean up resources in error cases

### DON'T
- ❌ Swallow errors silently
- ❌ Expose internal error details to users
- ❌ Use generic Error class everywhere
- ❌ Ignore promise rejections
- ❌ Log sensitive information
- ❌ Show stack traces to end users
- ❌ Crash without graceful shutdown

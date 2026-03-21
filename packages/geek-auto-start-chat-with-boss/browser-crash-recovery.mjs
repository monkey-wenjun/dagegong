/**
 * 浏览器崩溃自动恢复管理器
 * 实现浏览器崩溃后自动重启，并保持前端无感知
 */

import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 恢复状态文件路径
const RECOVERY_STATE_FILE = path.join(__dirname, 'runtime-data', 'recovery-state.json')

// 恢复管理器事件
export const recoveryEventBus = new EventEmitter()

// 恢复状态类型
/**
 * @typedef {Object} RecoveryState
 * @property {boolean} isRecovering - 是否正在恢复中
 * @property {number} crashCount - 崩溃次数
 * @property {string} lastCrashTime - 上次崩溃时间
 * @property {string} currentPhase - 当前执行阶段
 * @property {Object} resumeContext - 恢复上下文数据
 * @property {string} resumeContext.currentFilterIndex - 当前筛选器索引
 * @property {string} resumeContext.currentJobId - 当前处理的职位ID
 * @property {string} resumeContext.currentPage - 当前页面状态
 * @property {number} resumeContext.dailyChatCount - 当日沟通次数
 * @property {string} resumeContext.lastAction - 最后执行的动作
 * @property {number} version - 状态文件版本
 */

// 执行阶段定义
export const ExecutionPhase = {
  IDLE: 'idle',                          // 空闲状态
  INITIALIZING: 'initializing',          // 初始化中
  LAUNCHING_BROWSER: 'launching_browser', // 启动浏览器中
  SETTING_COOKIES: 'setting_cookies',    // 设置 cookies
  NAVIGATING: 'navigating',              // 页面导航中
  FILTERING: 'filtering',                // 筛选职位
  PROCESSING_JOBS: 'processing_jobs',    // 处理职位列表
  CHATTING: 'chatting',                  // 沟通中
  SENDING_RESUME: 'sending_resume',      // 发送简历
  CLEANUP: 'cleanup',                    // 清理中
}

// 默认恢复状态
const DEFAULT_RECOVERY_STATE = {
  isRecovering: false,
  crashCount: 0,
  lastCrashTime: null,
  currentPhase: ExecutionPhase.IDLE,
  resumeContext: {
    currentFilterIndex: null,
    currentJobId: null,
    currentPage: null,
    dailyChatCount: null,
    lastAction: null,
    lastProcessedJobIds: [], // 最近已处理的职位ID列表，避免重复
  },
  version: 1,
}

// 确保运行时数据目录存在
function ensureRuntimeDir() {
  const runtimeDir = path.dirname(RECOVERY_STATE_FILE)
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true })
  }
}

/**
 * 读取恢复状态
 * @returns {RecoveryState}
 */
export function readRecoveryState() {
  try {
    ensureRuntimeDir()
    if (fs.existsSync(RECOVERY_STATE_FILE)) {
      const data = fs.readFileSync(RECOVERY_STATE_FILE, 'utf-8')
      const state = JSON.parse(data)
      // 合并默认值，处理版本升级
      return { ...DEFAULT_RECOVERY_STATE, ...state }
    }
  } catch (err) {
    console.error('[Recovery] 读取恢复状态失败:', err.message)
  }
  return { ...DEFAULT_RECOVERY_STATE }
}

/**
 * 保存恢复状态
 * @param {Partial<RecoveryState>} state
 */
export function saveRecoveryState(state) {
  try {
    ensureRuntimeDir()
    const currentState = readRecoveryState()
    const newState = { 
      ...currentState, 
      ...state,
      resumeContext: {
        ...currentState.resumeContext,
        ...(state.resumeContext || {})
      }
    }
    fs.writeFileSync(RECOVERY_STATE_FILE, JSON.stringify(newState, null, 2))
  } catch (err) {
    console.error('[Recovery] 保存恢复状态失败:', err.message)
  }
}

/**
 * 清除恢复状态
 */
export function clearRecoveryState() {
  try {
    if (fs.existsSync(RECOVERY_STATE_FILE)) {
      fs.unlinkSync(RECOVERY_STATE_FILE)
    }
  } catch (err) {
    console.error('[Recovery] 清除恢复状态失败:', err.message)
  }
}

/**
 * 更新当前执行阶段
 * @param {string} phase
 * @param {Object} context
 */
export function updateExecutionPhase(phase, context = {}) {
  saveRecoveryState({
    currentPhase: phase,
    resumeContext: {
      ...readRecoveryState().resumeContext,
      ...context
    }
  })
}

/**
 * 记录已处理的职位ID
 * @param {string} jobId
 */
export function recordProcessedJob(jobId) {
  const state = readRecoveryState()
  const processedJobs = state.resumeContext.lastProcessedJobIds || []
  
  // 保持最近 100 个已处理职位
  if (!processedJobs.includes(jobId)) {
    processedJobs.push(jobId)
    if (processedJobs.length > 100) {
      processedJobs.shift()
    }
  }
  
  saveRecoveryState({
    resumeContext: {
      ...state.resumeContext,
      lastProcessedJobIds: processedJobs
    }
  })
}

/**
 * 检查职位是否已处理过
 * @param {string} jobId
 * @returns {boolean}
 */
export function isJobProcessed(jobId) {
  const state = readRecoveryState()
  return (state.resumeContext.lastProcessedJobIds || []).includes(jobId)
}

// 指数退避配置
const BACKOFF_CONFIG = {
  initialDelay: 2000,      // 初始延迟 2 秒
  maxDelay: 60000,         // 最大延迟 60 秒
  multiplier: 2,           // 乘数
  maxRetries: 5,           // 最大重试次数
  resetAfter: 300000,      // 5 分钟后重置崩溃计数
}

/**
 * 计算下次重试延迟
 * @param {number} crashCount
 * @returns {number} 延迟毫秒数
 */
function calculateBackoffDelay(crashCount) {
  const delay = BACKOFF_CONFIG.initialDelay * Math.pow(BACKOFF_CONFIG.multiplier, crashCount - 1)
  return Math.min(delay, BACKOFF_CONFIG.maxDelay)
}

/**
 * 检查是否应该重置崩溃计数
 * @param {string} lastCrashTime
 * @returns {boolean}
 */
function shouldResetCrashCount(lastCrashTime) {
  if (!lastCrashTime) return true
  const lastCrash = new Date(lastCrashTime).getTime()
  const now = Date.now()
  return (now - lastCrash) > BACKOFF_CONFIG.resetAfter
}

/**
 * 浏览器崩溃自动恢复包装器
 * @param {Function} mainLoopFn - 主循环函数
 * @param {Object} hooks - 钩子对象
 * @returns {Function}
 */
export function createAutoRestartWrapper(mainLoopFn, hooks) {
  let isRunning = false
  let shouldStop = false
  let currentBrowser = null
  let restartTimeout = null

  // 包装后的 hooks，添加状态跟踪
  const wrappedHooks = new Proxy(hooks || {}, {
    get(target, prop) {
      const original = target[prop]
      if (typeof original === 'function') {
        return function(...args) {
          // 跟踪关键阶段
          if (prop === 'puppeteerLaunched') {
            updateExecutionPhase(ExecutionPhase.LAUNCHING_BROWSER)
          } else if (prop === 'pageGotten') {
            updateExecutionPhase(ExecutionPhase.SETTING_COOKIES)
          } else if (prop === 'mainFlowWillLaunch') {
            updateExecutionPhase(ExecutionPhase.NAVIGATING)
          } else if (prop === 'jobDetailIsGetFromRecommendList') {
            const jobData = args[0]
            if (jobData?.encryptJobId) {
              updateExecutionPhase(ExecutionPhase.PROCESSING_JOBS, {
                currentJobId: jobData.encryptJobId,
                lastAction: 'job_detail_fetched'
              })
            }
          } else if (prop === 'newChatWillStartup') {
            const jobData = args[0]
            if (jobData?.encryptJobId) {
              updateExecutionPhase(ExecutionPhase.CHATTING, {
                currentJobId: jobData.encryptJobId,
                lastAction: 'chat_will_start'
              })
            }
          } else if (prop === 'newChatStartup') {
            const [jobData] = args
            if (jobData?.encryptJobId) {
              recordProcessedJob(jobData.encryptJobId)
              updateExecutionPhase(ExecutionPhase.PROCESSING_JOBS, {
                lastAction: 'chat_completed'
              })
            }
          }
          return original.apply(target, args)
        }
      }
      return original
    }
  })

  /**
   * 执行单次运行（带错误处理）
   */
  async function runOnce() {
    const state = readRecoveryState()
    
    // 检查是否超过最大重试次数
    if (state.crashCount >= BACKOFF_CONFIG.maxRetries) {
      const errorMsg = `[Recovery] 崩溃次数超过最大限制 (${BACKOFF_CONFIG.maxRetries})，停止自动恢复`
      console.error(errorMsg)
      wrappedHooks.logError?.(errorMsg)
      recoveryEventBus.emit('maxRetriesReached', state)
      throw new Error('MAX_RETRIES_REACHED')
    }

    try {
      // 标记正在恢复
      saveRecoveryState({ isRecovering: true })
      
      // 通知前端正在恢复
      if (state.crashCount > 0) {
        const recoveryMsg = `[Recovery] 正在从崩溃中恢复 (第 ${state.crashCount} 次尝试)...`
        console.log(recoveryMsg)
        wrappedHooks.logInfo?.(recoveryMsg)
        recoveryEventBus.emit('recovering', state)
      }

      // 执行主循环
      await mainLoopFn(wrappedHooks)
      
      // 正常完成，清除状态
      clearRecoveryState()
      isRunning = false
      
    } catch (err) {
      // 检查是否是浏览器断开连接错误
      const isBrowserCrash = err.message?.includes('Browser') || 
                             err.message?.includes('browser') ||
                             err.message?.includes('disconnected') ||
                             err.message?.includes('Protocol error') ||
                             err.message?.includes('Target closed') ||
                             err.message?.includes('Session closed')
      
      if (!isBrowserCrash) {
        // 非浏览器错误，直接抛出
        throw err
      }

      // 浏览器崩溃，准备重启
      const now = new Date().toISOString()
      const currentState = readRecoveryState()
      
      // 检查是否需要重置崩溃计数
      let newCrashCount = currentState.crashCount + 1
      if (shouldResetCrashCount(currentState.lastCrashTime)) {
        newCrashCount = 1
      }
      
      saveRecoveryState({
        crashCount: newCrashCount,
        lastCrashTime: now,
        isRecovering: false,
      })

      const crashMsg = `[Recovery] 检测到浏览器崩溃 (${newCrashCount}/${BACKOFF_CONFIG.maxRetries})，准备重启...`
      console.error(crashMsg)
      wrappedHooks.logError?.(crashMsg)
      recoveryEventBus.emit('crashed', { error: err, state: readRecoveryState() })

      // 计算延迟
      const delay = calculateBackoffDelay(newCrashCount)
      const delayMsg = `[Recovery] ${delay}ms 后尝试重启...`
      console.log(delayMsg)
      wrappedHooks.logInfo?.(delayMsg)

      // 延迟后重启
      await new Promise((resolve, reject) => {
        restartTimeout = setTimeout(async () => {
          if (shouldStop) {
            reject(new Error('STOP_REQUESTED'))
            return
          }
          try {
            await runOnce()
            resolve()
          } catch (e) {
            reject(e)
          }
        }, delay)
      })
    }
  }

  /**
   * 停止自动恢复循环
   */
  function stop() {
    shouldStop = true
    isRunning = false
    if (restartTimeout) {
      clearTimeout(restartTimeout)
      restartTimeout = null
    }
    clearRecoveryState()
  }

  /**
   * 启动带自动恢复的 mainLoop
   */
  async function start() {
    if (isRunning) {
      console.warn('[Recovery] 已经在运行中')
      return
    }

    isRunning = true
    shouldStop = false

    try {
      await runOnce()
    } finally {
      isRunning = false
    }
  }

  /**
   * 获取当前恢复状态
   */
  function getStatus() {
    return {
      isRunning,
      shouldStop,
      state: readRecoveryState(),
    }
  }

  return {
    start,
    stop,
    getStatus,
    eventBus: recoveryEventBus,
  }
}

/**
 * 创建浏览器断开连接监听器
 * @param {Object} browser - Puppeteer browser 实例
 * @param {Function} onCrash - 崩溃回调
 */
export function attachBrowserCrashListener(browser, onCrash) {
  if (!browser) return () => {}

  const handler = () => {
    console.error('[Recovery] browser.on(disconnected) 触发')
    onCrash?.(new Error('Browser disconnected'))
  }

  browser.on('disconnected', handler)

  // 返回卸载函数
  return () => {
    browser.off('disconnected', handler)
  }
}

/**
 * 创建页面错误监听器
 * @param {Object} page - Puppeteer page 实例
 * @param {Function} onError - 错误回调
 */
export function attachPageErrorListener(page, onError) {
  if (!page) return () => {}

  const handler = (err) => {
    console.error('[Recovery] page.on(error) 触发:', err.message)
    onError?.(err)
  }

  page.on('error', handler)

  // 返回卸载函数
  return () => {
    page.off('error', handler)
  }
}

export default {
  createAutoRestartWrapper,
  readRecoveryState,
  saveRecoveryState,
  clearRecoveryState,
  updateExecutionPhase,
  recordProcessedJob,
  isJobProcessed,
  attachBrowserCrashListener,
  attachPageErrorListener,
  recoveryEventBus,
  ExecutionPhase,
}

import overrideConsole from './utils/overrideConsole'
import minimist from 'minimist'
import { runCommon } from './features/run-common'
import { launchDaemon } from './flow/OPEN_SETTING_WINDOW/launch-daemon'
import { app } from 'electron'
import { initDailyStatsNotification } from './flow/OPEN_SETTING_WINDOW/ipc/daily-stats-notification'

// 在 app 准备就绪前配置 GPU 和兼容性选项
// 解决某些 Windows 系统上白屏问题
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')

// 如果是 Windows 7 或某些有兼容性问题的系统，禁用 GPU 加速
const disableGpu = process.env.DAGEGONG_DISABLE_GPU === '1'
if (disableGpu) {
  console.log('[App] GPU acceleration disabled by environment variable')
  app.disableHardwareAcceleration()
}

const isUiDev = process.env.NODE_ENV === 'development'
const enableLogToFile = process.env.DAGEGONG_ENABLE_LOG_TO_FILE === String(1)
if (isUiDev || enableLogToFile) {
  overrideConsole()
}
console.log('[App] ==========================================')
console.log('[App] 打个工 启动中...')
console.log('[App] ==========================================')
console.log('[App] NODE_ENV:', process.env.NODE_ENV)
console.log('[App] Electron version:', process.versions.electron)
console.log('[App] Chrome version:', process.versions.chrome)
console.log('[App] Platform:', process.platform)
console.log('[App] Arch:', process.arch)
console.log('[App] PID:', process.pid)
console.log('[App] Exec Path:', process.execPath)
console.log('[App] CWD:', process.cwd())

// 捕获未处理的 EPIPE 错误
process.on('uncaughtException', (err) => {
  console.error('[App] Uncaught Exception:', err)
  if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') {
    return
  }
  // 不要抛出，而是记录并优雅退出
  process.exit(1)
})

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('[App] Unhandled Rejection at:', promise, 'reason:', reason)
})

console.log('argv:', process.argv)
const commandlineArgs = minimist(isUiDev ? process.argv.slice(2) : process.argv.slice(1))
console.log('parsed commandline args:', commandlineArgs)

const runMode = commandlineArgs['mode']

;(async () => {
  switch (runMode) {
    // #region internal use
    case 'geekAutoStartWithBossMain': {
      const { waitForProcessHandShakeAndRunAutoChat } = await import(
        './flow/GEEK_AUTO_START_CHAT_WITH_BOSS_MAIN/index'
      )
      waitForProcessHandShakeAndRunAutoChat()
      break
    }
    case 'downloadDependenciesForInit': {
      const { downloadDependenciesForInit } = await import('./flow/DOWNLOAD_DEPENDENCIES/index')
      downloadDependenciesForInit()
      break
    }
    case 'launchBossZhipinLoginPageWithPreloadExtension': {
      const { launchBossZhipinLoginPageWithPreloadExtension } = await import(
        './flow/LAUNCH_BOSS_ZHIPIN_LOGIN_PAGE_WITH_PRELOAD_EXTENSION'
      )
      launchBossZhipinLoginPageWithPreloadExtension()
      break
    }
    case 'launchBossSite': {
      const { launchBossSite } = await import('./flow/LAUNCH_BOSS_SITE')
      launchBossSite()
      break
    }
    case 'readNoReplyAutoReminderMain': {
      const { runEntry } = await import('./flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/index')
      runEntry()
      break
    }
    case 'launchDaemon': {
      await import('./flow/LAUNCH_DAEMON')
      break
    }
    // #endregion

    // #region user entry
    case 'geekAutoStartWithBoss': {
      app.dock?.hide()
      await launchDaemon()
      // 初始化每日统计通知
      await initDailyStatsNotification()
      const { isAlreadyRunning } = await runCommon({ mode: 'geekAutoStartWithBossMain' })
      if (isAlreadyRunning) {
        process.exit(0)
      }
      break
    }
    case 'readNoReplyAutoReminder': {
      app.dock?.hide()
      await launchDaemon()
      // 初始化每日统计通知
      await initDailyStatsNotification()
      const { isAlreadyRunning } = await runCommon({ mode: 'readNoReplyAutoReminderMain' })
      if (isAlreadyRunning) {
        process.exit(0)
      }
      break
    }
    default: {
      globalThis.DAGEGONG_PROCESS_ROLE = 'ui'
      await launchDaemon()
      // 初始化每日统计通知（主窗口模式）
      await initDailyStatsNotification()
      const { openSettingWindow } = await import('./flow/OPEN_SETTING_WINDOW/index')
      openSettingWindow()
      break
    }
    // #region
  }
})()

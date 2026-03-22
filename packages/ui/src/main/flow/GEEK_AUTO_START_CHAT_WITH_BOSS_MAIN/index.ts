import DingtalkPlugin from '@dagegong/dingtalk-plugin/index.mjs'
import { app, dialog } from 'electron'
import { SyncHook, AsyncSeriesHook } from 'tapable'
import {
  readConfigFile,
  getPublicDbFilePath
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
// import { pipeWriteRegardlessError } from '../utils/pipe'
import { sleep } from '@dagegong/utils/sleep.mjs'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../common/enums/auto-start-chat'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import minimist from 'minimist'
import SqlitePluginModule from '@dagegong/sqlite-plugin'
import gtag from '../../utils/gtag'
import GtagPlugin from '../../utils/gtag/GtagPlugin'
import { connectToDaemon, sendToDaemon } from '../OPEN_SETTING_WINDOW/connect-to-daemon'
// import { PeriodPushCurrentPageScreenshotPlugin } from '../../utils/screenshot'
import { checkShouldExit } from '../../utils/worker'
import { CookieInvalidHandlePlugin } from '../../features/cookie-invalid-handle-plugin'
import initPublicIpc from '../../utils/initPublicIpc'
import { getLastUsedAndAvailableBrowser } from '../DOWNLOAD_DEPENDENCIES/utils/browser-history'
import { configWithBrowserAssistant } from '../../features/config-with-browser-assistant'
import { loginWithCookieAssistant } from '../../features/login-with-cookie-assistant'
import { runningLogManager } from '../../features/running-log'
import { getBrowserConfig } from '../../features/browser-config'
const { default: SqlitePlugin } = SqlitePluginModule

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在退出')
  // 尝试关闭浏览器以加速退出
  try {
    const { closeBrowserWindow } = require('@dagegong/geek-auto-start-chat-with-boss/index.mjs')
    closeBrowserWindow?.()
  } catch (e) {
    // 忽略错误
  }
  process.exit(0)
})

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()

const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
  new SqlitePlugin(getPublicDbFilePath()).apply(hooks)
  new GtagPlugin().apply(hooks)
  // new PeriodPushCurrentPageScreenshotPlugin().apply(hooks)
  new CookieInvalidHandlePlugin().apply(hooks)
}

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null
const runAutoChat = async () => {
  console.log('[DEBUG] runAutoChat started')
  app.dock?.hide()
  
  // 记录启动日志
  runningLogManager.logInfo('启动子进程')
  
  console.log('[DEBUG] Getting browser executable...')
  runningLogManager.logInfo('开始检查 Puppeteer 可执行程序')
  let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
  console.log('[DEBUG] Browser executable:', puppeteerExecutable)
  if (!puppeteerExecutable) {
    try {
      await configWithBrowserAssistant({ autoFind: true })
    } catch (error) {
      //
    }
    puppeteerExecutable = await getLastUsedAndAvailableBrowser()
  }
  if (!puppeteerExecutable) {
    runningLogManager.logError('未找到可用的浏览器')
    await dialog.showMessageBox({
      type: `error`,
      message: `未找到可用的浏览器`,
      detail: `请重新运行本程序，按照提示安装、配置浏览器`
    })
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'prerequisite-step-by-step-checkstep-by-step-check',
        step: {
          id: 'puppeteer-executable-check',
          status: 'rejected'
        },
        runRecordId
      }
    })
    app.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
    return
  }
  runningLogManager.logInfo('可执行程序检查通过', { executablePath: puppeteerExecutable.executablePath })
  sendToDaemon({
    type: 'worker-to-gui-message',
    data: {
      type: 'prerequisite-step-by-step-checkstep-by-step-check',
      step: {
        id: 'puppeteer-executable-check',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerExecutable.executablePath
  console.log('[DEBUG] PUPPETEER_EXECUTABLE_PATH set to:', puppeteerExecutable.executablePath)
  
  // 读取浏览器配置
  console.log('[DEBUG] Reading browser config...')
  const browserConfig = await getBrowserConfig()
  console.log('[DEBUG] Browser config:', browserConfig)
  if (browserConfig.headless) {
    process.env.DAGEGONG_BROWSER_HEADLESS = '1'
    console.log('[DEBUG] Headless mode enabled')
  }
  
  console.log('[DEBUG] Importing geek-auto-start-chat-with-boss module...')
  const { initPuppeteer, mainLoop, closeBrowserWindow, autoStartChatEventBus, createAutoRestartWrapper } = await import(
    '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
  )
  console.log('[DEBUG] Module imported successfully')
  
  process.on('disconnect', () => {
    console.log('[DEBUG] Process disconnect event received')
    closeBrowserWindow()
    app.exit()
  })
  
  console.log('[DEBUG] Calling initPuppeteer...')
  await initPuppeteer()
  console.log('[DEBUG] initPuppeteer completed')

  const hooks = {
    puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']),
    pageLoaded: new SyncHook(),
    cookieWillSet: new AsyncSeriesHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    mainFlowWillLaunch: new AsyncSeriesHook(['args']),
    jobDetailIsGetFromRecommendList: new AsyncSeriesHook(['userInfo']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook(['positionInfoDetail', 'chatRunningContext']),
    jobMarkedAsNotSuit: new AsyncSeriesHook(['positionInfoDetail', 'markDetail']),
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo']),
    encounterEmptyRecommendJobList: new AsyncSeriesHook(['args']),
    sageTimeEnter: new AsyncSeriesHook(['args']),
    sageTimeExit: new AsyncSeriesHook(['args']),
    logError: (message: string) => runningLogManager.logError(message),
    logInfo: (message: string) => runningLogManager.logInfo(message)
  }
  
  // 添加运行日志记录
  hooks.puppeteerLaunched.tap('RunningLog', (browser) => {
    runningLogManager.logInfo('浏览器已启动', { headless: browserConfig.headless })
  })
  
  hooks.pageGotten.tap('RunningLog', (page) => {
    runningLogManager.logInfo('页面已获取')
    
    // 监听页面点击事件
    page.on('click', (event) => {
      runningLogManager.logClick(event?.selector || 'unknown')
    })
    
    // 监听页面导航
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        runningLogManager.logNavigation('页面导航', frame.url())
      }
    })
    
    // 监听网络请求
    page.on('request', (request) => {
      if (request.url().includes('zhipin.com')) {
        runningLogManager.logNetwork(
          request.method(),
          request.url().split('?')[0],
          undefined,
          { resourceType: request.resourceType() }
        )
      }
    })
    
    // 监听网络响应
    page.on('response', (response) => {
      const request = response.request()
      if (request.url().includes('zhipin.com') && 
          (request.url().includes('/api/') || request.url().includes('/wapi/'))) {
        runningLogManager.logNetwork(
          request.method(),
          request.url().split('?')[0],
          response.status(),
          { resourceType: request.resourceType() }
        )
      }
    })
    
    // 监听控制台错误
    page.on('pageerror', (error) => {
      runningLogManager.logError('页面错误', error.message)
    })
    
    // 监听请求失败
    page.on('requestfailed', (request) => {
      runningLogManager.logError('请求失败', {
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText
      })
    })
  })
  
  hooks.pageLoaded.tap('RunningLog', () => {
    runningLogManager.logInfo('页面加载完成')
  })
  
  hooks.newChatWillStartup.tap('RunningLog', (positionInfo) => {
    runningLogManager.logInfo('开始打招呼', {
      jobName: positionInfo?.jobInfo?.jobName,
      company: positionInfo?.brandName
    })
  })
  
  hooks.newChatStartup.tap('RunningLog', (positionInfo) => {
    runningLogManager.logInfo('打招呼成功', {
      jobName: positionInfo?.jobInfo?.jobName
    })
  })
  
  hooks.errorEncounter.tap('RunningLog', (errorInfo) => {
    runningLogManager.logError('遇到错误', errorInfo)
  })
  
  initPlugins(hooks)
  
  // 创建带自动恢复的包装器
  const autoRestartWrapper = createAutoRestartWrapper(hooks)
  
  // 监听恢复事件并通知前端
  autoRestartWrapper.eventBus.on('recovering', (state) => {
    runningLogManager.logInfo(`[自动恢复] 浏览器崩溃，正在进行第 ${state.crashCount} 次恢复尝试...`)
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'browser-recovering',
        crashCount: state.crashCount,
        maxRetries: 5,
        message: `浏览器崩溃，正在自动恢复 (${state.crashCount}/5)...`
      }
    })
  })
  
  autoRestartWrapper.eventBus.on('crashed', ({ error, state }) => {
    runningLogManager.logError(`[自动恢复] 浏览器已崩溃: ${error.message}`)
  })
  
  autoRestartWrapper.eventBus.on('maxRetriesReached', () => {
    runningLogManager.logError('[自动恢复] 已达到最大重试次数，停止自动恢复')
    sendToDaemon({
      type: 'worker-to-gui-message',
      data: {
        type: 'browser-recovery-failed',
        message: '浏览器连续崩溃多次，已停止自动恢复'
      }
    })
  })

  gtag('run_auto_chat_with_boss_main_ready')

  autoStartChatEventBus.once('LOGIN_STATUS_INVALID', () => {
  })

  console.log('[DEBUG] Entering main loop with auto-restart...')
  
  // 主循环 - 带自动恢复
  while (true) {
    try {
      console.log('[DEBUG] Starting auto-restart wrapper...')
      await autoRestartWrapper.start()
      console.log('[DEBUG] mainLoop completed')
    } catch (err) {
      // 检查是否是最大重试次数达到的错误
      if (err.message === 'MAX_RETRIES_REACHED') {
        await dialog.showMessageBox({
          type: 'error',
          message: '浏览器连续崩溃多次',
          detail: '浏览器已连续崩溃 5 次，已停止自动恢复。请检查系统资源或重新启动程序。'
        })
        process.exit(AUTO_CHAT_ERROR_EXIT_CODE.BROWSER_CRASHED)
        break
      }
      
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
          runningLogManager.logInfo('登录状态无效，尝试弹出登录窗口...')
          try {
            await loginWithCookieAssistant()
            runningLogManager.logInfo('用户已完成登录，将重新启动任务')
            // 登录成功后，不退出，继续循环重试
            continue
          } catch (loginError) {
            if (loginError?.message === 'USER_CANCELLED_LOGIN') {
              runningLogManager.logError('用户取消了登录')
              await dialog.showMessageBox({
                type: `error`,
                message: `登录已取消`,
                detail: `需要登录后才能继续使用自动找工作功能`
              })
            } else {
              await dialog.showMessageBox({
                type: `error`,
                message: `登录失败`,
                detail: loginError?.message || '未知错误'
              })
            }
            process.exit(AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID)
            break
          }
        }
        if (err.message.includes('ERR_INTERNET_DISCONNECTED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ERR_INTERNET_DISCONNECTED)
          break
        }
        if (err.message.includes('ACCESS_IS_DENIED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ACCESS_IS_DENIED)
          break
        }
        if (err.message.includes(`Could not find Chrome`) || err.message.includes(`no executable was found`)) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE)
          break
        }
      }
      
      closeBrowserWindow?.()
      console.error(err)
      const shouldExit = await checkShouldExit()
      if (shouldExit) {
        app.exit()
        return
      }
      
      // 如果不是浏览器崩溃导致的错误，使用原来的重试间隔
      console.log(
        `[Run core main] An internal error is caught, and browser will be restarted in ${rerunInterval}ms.`
      )
      await sleep(rerunInterval)
    }
  }
}

export const waitForProcessHandShakeAndRunAutoChat = async () => {
  await app.whenReady()
  app.on('window-all-closed', (e) => {
    e.preventDefault()
  })
  initPublicIpc()
  await connectToDaemon()
  // 设置日志转发到 daemon
  runningLogManager.setSendToDaemon(sendToDaemon)
  await sendToDaemon(
    {
      type: 'ping'
    },
    {
      needCallback: true
    }
  )
  sendToDaemon({
    type: 'worker-to-gui-message',
    data: {
      type: 'prerequisite-step-by-step-checkstep-by-step-check',
      step: {
        id: 'worker-launch',
        status: 'fulfilled'
      },
      runRecordId
    }
  })
  runAutoChat()
}

attachListenerForKillSelfOnParentExited()

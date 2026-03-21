import DingtalkPlugin from '@dagegong/dingtalk-plugin/index.mjs'
import { mainLoop, closeBrowserWindow } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
import {
  SyncHook,
  AsyncSeriesHook
} from 'tapable'
import fs from 'node:fs'
import path from 'node:path'
import { get__dirname } from '@dagegong/utils/legacy-path.mjs';
import JSON5 from 'json5'
import { readConfigFile, readStorageFile, getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { sleep } from '@dagegong/utils/sleep.mjs'
import {
  AUTO_CHAT_ERROR_EXIT_CODE
} from './enums.mjs'

import SqlitePlugin from './sqlite-plugin-compat.mjs'

const rerunInterval = (() => {
  let v = Number(process.env.MAIN_BOSSGEEKGO_RERUN_INTERVAL)
  if (isNaN(v)) {
    v = 3000
  }

  return v
})()

process.on('disconnect', () => {
  process.exit()
})

const bossCookies = readStorageFile('boss-cookies.json')
const { groupRobotAccessToken: dingTalkAccessToken } = readConfigFile('dingtalk.json')

const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
  new SqlitePlugin(getPublicDbFilePath()).apply(hooks)
}

const main = async () => {
  console.log('[MAIN] ================================')
  console.log('[MAIN] main() started')
  console.log('[MAIN] Node version:', process.version)
  console.log('[MAIN] ================================')
  console.log('[MAIN] Checking cookies...')
  if (!bossCookies?.length) {
    console.error('[MAIN] There is no cookies. You can save a copy with EditThisCookie extension.')
    process.exit(AUTO_CHAT_ERROR_EXIT_CODE.COOKIE_INVALID)
  }
  console.log('[MAIN] Cookies found:', bossCookies.length, 'items')
  const hooks = {
    daemonInitialized: new AsyncSeriesHook(),
    puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    mainFlowWillLaunch: new AsyncSeriesHook(['args']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook(['positionInfoDetail', 'chatRunningContext']),
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo']),
    encounterEmptyRecommendJobList: new AsyncSeriesHook(['args']),
    sageTimeEnter: new AsyncSeriesHook(['args']),
    sageTimeExit: new AsyncSeriesHook(['args']),
    jobDetailIsGetFromRecommendList: new AsyncSeriesHook(['jobInfo']),
    jobMarkedAsNotSuit: new AsyncSeriesHook(['jobInfo', 'options'])
  }
  initPlugins(hooks)
  await hooks.daemonInitialized.promise()
  while (true) {
    try {
      await mainLoop(hooks)
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('LOGIN_STATUS_INVALID')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.LOGIN_STATUS_INVALID)
          break
        }
        if (err.message.includes('ERR_INTERNET_DISCONNECTED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ERR_INTERNET_DISCONNECTED)
          break
        }
        if (err.message.includes('ACCESS_IS_DENIED')) {
          process.exit(AUTO_CHAT_ERROR_EXIT_CODE.ACCESS_IS_DENIED)
          break
        }
      }
      closeBrowserWindow?.()
      console.error(err)
      console.log(`[Run core main] An internal error is caught, and browser will be restarted in ${rerunInterval}ms.`)
      await sleep(rerunInterval)
    }
  }
}

(async () => {
  try {
    await main()
  } catch(err) {
    console.error(err)
  }
})()
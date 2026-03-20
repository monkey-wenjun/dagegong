import { ipcMain, shell, app, dialog, BrowserWindow } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import {
  readConfigFile,
  writeConfigFile,
  readStorageFile,
  storageFilePath
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChildProcess } from 'child_process'
import * as JSONStream from 'JSONStream'
import { checkCookieListFormat } from '../../../../common/utils/cookie'
import { getAnyAvailablePuppeteerExecutable } from '../../DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
import { mainWindow } from '../../../window/mainWindow'
import {
  getAutoStartChatRecord,
  getBossLibrary,
  getCompanyLibrary,
  getJobLibrary,
  getJobHistoryByEncryptId,
  getMarkAsNotSuitRecord,
  getBossChatRelationList
} from '../utils/db/index'
import { PageReq } from '../../../../common/types/pagination'
import { pipeWriteRegardlessError } from '../../utils/pipe'
import { WriteStream } from 'node:fs'
// eslint-disable-next-line vue/prefer-import-from-vue
import { hasOwn } from '@vue/shared'
import { createLlmConfigWindow, llmConfigWindow } from '../../../window/llmConfigWindow'
import { createResumeEditorWindow, resumeEditorWindow } from '../../../window/resumeEditorWindow'
import {
  getValidTemplate,
  requestNewMessageContent,
  parseResumeFromPdf
} from '../../READ_NO_REPLY_AUTO_REMINDER_MAIN/boss-operation'
import {
  defaultPromptMap,
  writeDefaultAutoRemindPrompt
} from '../../READ_NO_REPLY_AUTO_REMINDER_MAIN/boss-operation'
import {
  checkIsResumeContentValid,
  resumeContentEnoughDetect
} from '../../../../common/utils/resume'
import {
  createReadNoReplyReminderLlmMockWindow,
  readNoReplyReminderLlmMockWindow
} from '../../../window/readNoReplyReminderLlmMockWindow'
import { RequestSceneEnum } from '../../../features/llm-request-log'
import { checkUpdateForUi } from '../../../features/updater'
import gtag from '../../../utils/gtag'
import { daemonEE, sendToDaemon } from '../connect-to-daemon'
import { runCommon } from '../../../features/run-common'
import { loginWithCookieAssistant } from '../../../features/login-with-cookie-assistant'
import { configWithBrowserAssistant } from '../../../features/config-with-browser-assistant'
import {
  createFirstLaunchNoticeApproveFlag,
  isFirstLaunchNoticeApproveFlagExist,
  waitForUserApproveAgreement
} from '../../../features/first-launch-notice-window'
import { getLastUsedAndAvailableBrowser } from '../../DOWNLOAD_DEPENDENCIES/utils/browser-history'
import { waitForCommonJobConditionDone } from '../../../features/common-job-condition'
import { ensureConfigFileExist } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { 
  setupDailyStatsNotification, 
  sendDailyStatsNotification,
  initDailyStatsNotification 
} from './daily-stats-notification'

export default async function initIpc() {
  // 初始化每日统计通知
  await initDailyStatsNotification()
  
  ipcMain.handle('save-config-file-from-ui', async (ev, payload) => {
    payload = JSON.parse(payload)
    ensureConfigFileExist()

    const promiseArr: Array<Promise<unknown>> = []

    const dingtalkConfig = readConfigFile('dingtalk.json')
    if (hasOwn(payload, 'dingtalkRobotAccessToken')) {
      dingtalkConfig.groupRobotAccessToken = payload.dingtalkRobotAccessToken
    }
    promiseArr.push(writeConfigFile('dingtalk.json', dingtalkConfig))

    const bossConfig = readConfigFile('boss.json')
    if (hasOwn(payload, 'anyCombineRecommendJobFilter')) {
      bossConfig.anyCombineRecommendJobFilter = payload.anyCombineRecommendJobFilter
    }
    delete bossConfig.expectJobRegExpStr
    if (hasOwn(payload, 'expectJobNameRegExpStr')) {
      bossConfig.expectJobNameRegExpStr = payload.expectJobNameRegExpStr
    }
    if (hasOwn(payload, 'expectJobTypeRegExpStr')) {
      bossConfig.expectJobTypeRegExpStr = payload.expectJobTypeRegExpStr
    }
    if (hasOwn(payload, 'expectJobDescRegExpStr')) {
      bossConfig.expectJobDescRegExpStr = payload.expectJobDescRegExpStr
    }
    if (hasOwn(payload, 'jobNotMatchStrategy')) {
      bossConfig.jobNotMatchStrategy = payload.jobNotMatchStrategy
    }
    if (hasOwn(payload, 'markAsNotActiveSelectedTimeRange')) {
      bossConfig.markAsNotActiveSelectedTimeRange = payload.markAsNotActiveSelectedTimeRange
    }
    if (hasOwn(payload, 'jobNotActiveStrategy')) {
      bossConfig.jobNotActiveStrategy = payload.jobNotActiveStrategy
    }
    if (hasOwn(payload, 'autoReminder')) {
      bossConfig.autoReminder = payload.autoReminder
    }

    // city
    if (hasOwn(payload, 'expectCityList')) {
      bossConfig.expectCityList = payload.expectCityList
    }
    if (hasOwn(payload, 'expectCityNotMatchStrategy')) {
      bossConfig.expectCityNotMatchStrategy = payload.expectCityNotMatchStrategy
    }
    if (hasOwn(payload, 'strategyScopeOptionWhenMarkJobCityNotMatch')) {
      bossConfig.strategyScopeOptionWhenMarkJobCityNotMatch =
        payload.strategyScopeOptionWhenMarkJobCityNotMatch
    }

    // salary
    if (hasOwn(payload, 'expectSalaryCalculateWay')) {
      bossConfig.expectSalaryCalculateWay = payload.expectSalaryCalculateWay
    }
    if (hasOwn(payload, 'expectSalaryNotMatchStrategy')) {
      bossConfig.expectSalaryNotMatchStrategy = payload.expectSalaryNotMatchStrategy
    }
    if (hasOwn(payload, 'strategyScopeOptionWhenMarkSalaryNotMatch')) {
      bossConfig.strategyScopeOptionWhenMarkSalaryNotMatch =
        payload.strategyScopeOptionWhenMarkSalaryNotMatch
    }
    if (hasOwn(payload, 'expectSalaryLow')) {
      bossConfig.expectSalaryLow = payload.expectSalaryLow
    }
    if (hasOwn(payload, 'expectSalaryHigh')) {
      bossConfig.expectSalaryHigh = payload.expectSalaryHigh
    }

    // work exp
    if (hasOwn(payload, 'expectWorkExpList')) {
      bossConfig.expectWorkExpList = payload.expectWorkExpList
    }
    if (hasOwn(payload, 'expectWorkExpNotMatchStrategy')) {
      bossConfig.expectWorkExpNotMatchStrategy = payload.expectWorkExpNotMatchStrategy
    }
    if (hasOwn(payload, 'strategyScopeOptionWhenMarkJobWorkExpNotMatch')) {
      bossConfig.strategyScopeOptionWhenMarkJobWorkExpNotMatch =
        payload.strategyScopeOptionWhenMarkJobWorkExpNotMatch
    }
    if (hasOwn(payload, 'jobDetailRegExpMatchLogic')) {
      bossConfig.jobDetailRegExpMatchLogic = payload.jobDetailRegExpMatchLogic
    }
    if (hasOwn(payload, 'isSkipEmptyConditionForCombineRecommendJobFilter')) {
      bossConfig.isSkipEmptyConditionForCombineRecommendJobFilter =
        payload.isSkipEmptyConditionForCombineRecommendJobFilter
    }
    if ('jobSourceList' in payload) {
      bossConfig.jobSourceList = payload.jobSourceList
    }
    if (hasOwn(payload, 'combineRecommendJobFilterType')) {
      bossConfig.combineRecommendJobFilterType = payload.combineRecommendJobFilterType
    }
    if (hasOwn(payload, 'staticCombineRecommendJobFilterConditions')) {
      bossConfig.staticCombineRecommendJobFilterConditions =
        payload.staticCombineRecommendJobFilterConditions
    }
    if (hasOwn(payload, 'isSageTimeEnabled')) {
      bossConfig.isSageTimeEnabled = payload.isSageTimeEnabled
    }
    if (hasOwn(payload, 'sageTimeOpTimes')) {
      bossConfig.sageTimeOpTimes = payload.sageTimeOpTimes
    }
    if (hasOwn(payload, 'sageTimePauseMinute')) {
      bossConfig.sageTimePauseMinute = payload.sageTimePauseMinute
    }
    if (hasOwn(payload, 'blockCompanyNameRegExpStr')) {
      bossConfig.blockCompanyNameRegExpStr = payload.blockCompanyNameRegExpStr
    }
    if (hasOwn(payload, 'blockCompanyNameRegMatchStrategy')) {
      bossConfig.blockCompanyNameRegMatchStrategy = payload.blockCompanyNameRegMatchStrategy
    }
    if (hasOwn(payload, 'fieldsForUseCommonConfig')) {
      bossConfig.fieldsForUseCommonConfig = payload.fieldsForUseCommonConfig
    }

    // auto run time settings
    // Use 'in' operator or typeof check instead of hasOwn for better reliability
    if ('autoRunTimeEnabled' in payload) {
      bossConfig.autoRunTimeEnabled = payload.autoRunTimeEnabled
    }
    if ('autoRunStartTime' in payload) {
      bossConfig.autoRunStartTime = payload.autoRunStartTime
    }
    if ('autoRunEndTime' in payload) {
      bossConfig.autoRunEndTime = payload.autoRunEndTime
    }
    if ('autoRunWeekdays' in payload) {
      bossConfig.autoRunWeekdays = payload.autoRunWeekdays
    }
    if ('greetingMessage' in payload) {
      bossConfig.greetingMessage = payload.greetingMessage
    }
    if ('greetingMessageMode' in payload) {
      bossConfig.greetingMessageMode = payload.greetingMessageMode
    }
    if ('greetingMessagePrompt' in payload) {
      bossConfig.greetingMessagePrompt = payload.greetingMessagePrompt
    }

    promiseArr.push(writeConfigFile('boss.json', bossConfig))

    if (hasOwn(payload, 'expectCompanies')) {
      promiseArr.push(
        writeConfigFile('target-company-list.json', payload.expectCompanies?.split(',') ?? [])
      )
    }

    return await Promise.all(promiseArr)
  })

  ipcMain.handle('run-geek-auto-start-chat-with-boss', async (ev) => {
    const mode = 'geekAutoStartWithBossMain'
    
    // 检查自动运行时间配置
    const bossConfig = readConfigFile('boss.json')
    if (bossConfig.autoRunTimeEnabled) {
      const now = new Date()
      const currentDay = now.getDay() // 0=周日, 1=周一, ..., 6=周六
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      
      // 检查星期几
      const allowedWeekdays = bossConfig.autoRunWeekdays || [1, 2, 3, 4, 5]
      if (!allowedWeekdays.includes(currentDay)) {
        const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        const allowedWeekdayNames = allowedWeekdays.map(d => weekdayNames[d]).join('、')
        return {
          success: false,
          error: `不在运行日期范围内。当前设置只允许在 ${allowedWeekdayNames} 运行。`
        }
      }
      
      // 检查时间段
      const startTime = bossConfig.autoRunStartTime || '10:00'
      const endTime = bossConfig.autoRunEndTime || '21:00'
      if (currentTime < startTime || currentTime > endTime) {
        return {
          success: false,
          error: `不在运行时间段内。当前设置只允许在 ${startTime} ~ ${endTime} 运行。`
        }
      }
    }
    
    const { runRecordId, isAlreadyRunning } = await runCommon({ mode })
    
    // 如果启用了时间控制，设置定时器检查运行时间
    let timeCheckInterval: NodeJS.Timeout | null = null
    if (bossConfig.autoRunTimeEnabled && !isAlreadyRunning) {
      timeCheckInterval = setInterval(() => {
        const now = new Date()
        const currentDay = now.getDay()
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        
        const allowedWeekdays = bossConfig.autoRunWeekdays || [1, 2, 3, 4, 5]
        const startTime = bossConfig.autoRunStartTime || '10:00'
        const endTime = bossConfig.autoRunEndTime || '21:00'
        
        // 检查是否超出时间范围
        const shouldStop = !allowedWeekdays.includes(currentDay) || 
                          currentTime < startTime || 
                          currentTime > endTime
        
        if (shouldStop) {
          console.log('[AutoRunTime] 超出运行时间范围，自动停止任务')
          // 发送停止命令
          sendToDaemon(
            {
              type: 'stop-worker',
              workerId: mode
            },
            { needCallback: false }
          )
          // 清除定时器
          if (timeCheckInterval) {
            clearInterval(timeCheckInterval)
            timeCheckInterval = null
          }
        }
      }, 60000) // 每分钟检查一次
      
      // 监听任务退出，清除定时器
      const cleanupHandler = (message: any) => {
        if (message.workerId === mode && message.type === 'worker-exited') {
          if (timeCheckInterval) {
            clearInterval(timeCheckInterval)
            timeCheckInterval = null
          }
          daemonEE.off('message', cleanupHandler)
        }
      }
      daemonEE.on('message', cleanupHandler)
    }
    
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('run-read-no-reply-auto-reminder', async () => {
    const mode = 'readNoReplyAutoReminderMain'
    
    // 检查自动运行时间配置
    const bossConfig = readConfigFile('boss.json')
    const autoReminderConfig = bossConfig.autoReminder || {}
    if (autoReminderConfig.autoRunTimeEnabled) {
      const now = new Date()
      const currentDay = now.getDay() // 0=周日, 1=周一, ..., 6=周六
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      
      // 检查星期几
      const allowedWeekdays = autoReminderConfig.autoRunWeekdays || [1, 2, 3, 4, 5]
      if (!allowedWeekdays.includes(currentDay)) {
        const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        const allowedWeekdayNames = allowedWeekdays.map(d => weekdayNames[d]).join('、')
        return {
          success: false,
          error: `不在运行日期范围内。当前设置只允许在 ${allowedWeekdayNames} 运行。`
        }
      }
      
      // 检查时间段
      const startTime = autoReminderConfig.autoRunStartTime || '10:00'
      const endTime = autoReminderConfig.autoRunEndTime || '21:00'
      if (currentTime < startTime || currentTime > endTime) {
        return {
          success: false,
          error: `不在运行时间段内。当前设置只允许在 ${startTime} ~ ${endTime} 运行。`
        }
      }
    }
    
    const { runRecordId, isAlreadyRunning } = await runCommon({ mode })
    
    // 如果启用了时间控制，设置定时器检查运行时间
    let timeCheckInterval: NodeJS.Timeout | null = null
    if (autoReminderConfig.autoRunTimeEnabled && !isAlreadyRunning) {
      timeCheckInterval = setInterval(() => {
        const now = new Date()
        const currentDay = now.getDay()
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        
        const allowedWeekdays = autoReminderConfig.autoRunWeekdays || [1, 2, 3, 4, 5]
        const startTime = autoReminderConfig.autoRunStartTime || '10:00'
        const endTime = autoReminderConfig.autoRunEndTime || '21:00'
        
        // 检查是否超出时间范围
        const shouldStop = !allowedWeekdays.includes(currentDay) || 
                          currentTime < startTime || 
                          currentTime > endTime
        
        if (shouldStop) {
          console.log('[AutoRunTime] 已读不回复聊超出运行时间范围，自动停止任务')
          // 发送停止命令
          sendToDaemon(
            {
              type: 'stop-worker',
              workerId: mode
            },
            { needCallback: false }
          )
          // 清除定时器
          if (timeCheckInterval) {
            clearInterval(timeCheckInterval)
            timeCheckInterval = null
          }
        }
      }, 60000) // 每分钟检查一次
      
      // 监听任务退出，清除定时器
      const cleanupHandler = (message: any) => {
        if (message.workerId === mode && message.type === 'worker-exited') {
          if (timeCheckInterval) {
            clearInterval(timeCheckInterval)
            timeCheckInterval = null
          }
          daemonEE.off('message', cleanupHandler)
        }
      }
      daemonEE.on('message', cleanupHandler)
    }
    
    daemonEE.on('message', function handler(message) {
      if (message.workerId !== mode) {
        return
      }
      if (message.type === 'worker-exited') {
        mainWindow?.webContents.send('worker-exited', message)
      }
    })
    return { runRecordId }
  })

  ipcMain.handle('stop-geek-auto-start-chat-with-boss', async () => {
    mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'geekAutoStartWithBossMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'geekAutoStartWithBossMain'
      },
      {
        needCallback: true
      }
    )

    await p
    mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopped')
  })

  ipcMain.handle('stop-read-no-reply-auto-reminder', async () => {
    mainWindow?.webContents.send('read-no-reply-auto-reminder-stopping')
    const p = new Promise((resolve) => {
      daemonEE.on('message', function handler(message) {
        if (message.workerId !== 'readNoReplyAutoReminderMain') {
          return
        }
        if (message.type === 'worker-exited') {
          daemonEE.off('message', handler)
          resolve(undefined)
        }
      })
    })
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId: 'readNoReplyAutoReminderMain'
      },
      {
        needCallback: true
      }
    )

    await p
    mainWindow?.webContents.send('read-no-reply-auto-reminder-stopped')
  })

  ipcMain.handle('get-task-manager-list', async () => {
    const result = await sendToDaemon(
      {
        type: 'get-status'
      },
      {
        needCallback: true
      }
    )
    return result
  })

  // IPC处理：停止工具进程
  ipcMain.handle('stop-task', async (_, workerId) => {
    await sendToDaemon(
      {
        type: 'stop-worker',
        workerId
      },
      {
        needCallback: true
      }
    )
  })

  ipcMain.handle('check-boss-zhipin-cookie-file', () => {
    const cookies = readStorageFile('boss-cookies.json')
    return checkCookieListFormat(cookies)
  })

  ipcMain.handle('get-auto-start-chat-record', async (ev, payload: PageReq) => {
    const a = await getAutoStartChatRecord(payload)
    return a
  })
  ipcMain.handle('get-mark-as-not-suit-record', async (ev, payload: PageReq) => {
    const a = await getMarkAsNotSuitRecord(payload)
    return a
  })
  ipcMain.handle('get-job-library', async (ev, payload: PageReq) => {
    const a = await getJobLibrary(payload)
    return a
  })
  ipcMain.handle('get-boss-library', async (ev, payload: PageReq) => {
    const a = await getBossLibrary(payload)
    return a
  })
  ipcMain.handle('get-company-library', async (ev, payload: PageReq) => {
    const a = await getCompanyLibrary(payload)
    return a
  })
  ipcMain.handle('get-boss-chat-relation-list', async (ev, payload: PageReq & { encryptUserId?: string }) => {
    const a = await getBossChatRelationList(payload)
    return a
  })
  ipcMain.handle('sync-boss-chat-relations', async () => {
    // 打开BOSS直聘聊天页面并获取沟通列表（自动获取当前登录用户）
    const result = await syncBossChatRelations()
    return result
  })

  let subProcessOfOpenBossSiteDefer: null | PromiseWithResolvers<ChildProcess> = null
  let subProcessOfOpenBossSite: null | ChildProcess = null
  ipcMain.handle('open-site-with-boss-cookie', async (ev, data) => {
    const url = data.url
    if (
      !subProcessOfOpenBossSiteDefer ||
      !subProcessOfOpenBossSite ||
      subProcessOfOpenBossSite.killed
    ) {
      subProcessOfOpenBossSiteDefer = Promise.withResolvers()
      let puppeteerExecutable = await getLastUsedAndAvailableBrowser()
      if (!puppeteerExecutable) {
        try {
          const parent = BrowserWindow.fromWebContents(ev.sender) || undefined
          await configWithBrowserAssistant({
            autoFind: true,
            windowOption: {
              parent,
              modal: !!parent,
              show: true
            }
          })
          puppeteerExecutable = await getLastUsedAndAvailableBrowser()
        } catch (error) {
          //
        }
      }
      if (!puppeteerExecutable) {
        await dialog.showMessageBox({
          type: `error`,
          message: `未找到可用的浏览器`,
          detail: `请重新运行本程序，按照提示安装、配置浏览器`
        })
        return
      }
      const subProcessEnv = {
        ...process.env,
        PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable!.executablePath
      }
      subProcessOfOpenBossSite = childProcess.spawn(
        process.argv[0],
        process.env.NODE_ENV === 'development'
          ? [process.argv[1], `--mode=launchBossSite`]
          : [`--mode=launchBossSite`],
        {
          env: subProcessEnv,
          stdio: ['inherit', 'inherit', 'inherit', 'pipe']
        }
      )
      subProcessOfOpenBossSite.once('exit', () => {
        subProcessOfOpenBossSiteDefer = null
      })
      subProcessOfOpenBossSite.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        async function handler(data) {
          switch (data?.type) {
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY': {
              subProcessOfOpenBossSiteDefer!.resolve(subProcessOfOpenBossSite as ChildProcess)
              break
            }
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED': {
              try {
                subProcessOfOpenBossSite &&
                  !subProcessOfOpenBossSite.killed &&
                  subProcessOfOpenBossSite.pid &&
                  process.kill(subProcessOfOpenBossSite.pid)
              } catch {
                //
              } finally {
                subProcessOfOpenBossSiteDefer = null
                subProcessOfOpenBossSite = null
              }
              break
            }
          }
        }
      )
    }

    await subProcessOfOpenBossSiteDefer.promise

    pipeWriteRegardlessError(
      subProcessOfOpenBossSite!.stdio[3]! as WriteStream,
      JSON.stringify({
        type: 'NEW_WINDOW',
        url: url ?? 'about:blank'
      })
    )
  })

  ipcMain.handle('get-job-history-by-encrypt-id', async (_, encryptJobId) => {
    return await getJobHistoryByEncryptId(encryptJobId)
  })

  ipcMain.handle('llm-config', async () => {
    createLlmConfigWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers()
    async function saveLlmConfigHandler(_, configToSave) {
      await writeConfigFile('llm.json', configToSave)
      defer.resolve()
      ipcMain.removeHandler('save-llm-config')
      llmConfigWindow?.close()
    }
    ipcMain.handle('save-llm-config', saveLlmConfigHandler)
    llmConfigWindow?.once('closed', () => {
      ipcMain.removeHandler('save-llm-config')
      defer.reject(new Error('cancel'))
    })
    return defer.promise
  })
  ipcMain.on('close-llm-config', () => llmConfigWindow?.close())

  // 直接保存 LLM 配置（用于路由方式，不关闭窗口）
  ipcMain.handle('save-llm-config-direct', async (_, configToSave) => {
    await writeConfigFile('llm.json', configToSave)
  })

  ipcMain.handle('resume-edit', async () => {
    createResumeEditorWindow({
      parent: mainWindow!,
      modal: true,
      show: true
    })
    const defer = Promise.withResolvers()
    async function saveResumeHandler(_, resumeContent) {
      await writeConfigFile('resumes.json', [
        {
          name: '默认简历',
          updateTime: Number(new Date()),
          content: resumeContent
        }
      ])
      defer.resolve()
      resumeEditorWindow?.close()
    }
    ipcMain.handle('save-resume-content', saveResumeHandler)
    resumeEditorWindow?.once('closed', () => {
      ipcMain.removeHandler('save-resume-content')
      defer.reject(new Error('cancel'))
    })

    return defer.promise
  })
  ipcMain.handle('fetch-resume-content', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return res?.content ?? null
  })
  ipcMain.on('no-reply-reminder-prompt-edit', async (_, { type }) => {
    const template = await readStorageFile(defaultPromptMap[type].fileName, {
      isJson: false
    })
    if (!template) {
      await writeDefaultAutoRemindPrompt({ type })
    }
    const filePath = path.join(storageFilePath, defaultPromptMap[type].fileName)
    shell.openPath(filePath)
  })
  ipcMain.on('close-resume-editor', () => resumeEditorWindow?.close())
  ipcMain.handle('check-if-auto-remind-prompt-valid', async (_, { type }) => {
    await getValidTemplate({ type })
  })
  ipcMain.handle('check-is-resume-content-valid', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return checkIsResumeContentValid(res)
  })
  ipcMain.handle('resume-content-enough-detect', async () => {
    const res = (await readConfigFile('resumes.json'))?.[0]
    return resumeContentEnoughDetect(res)
  })
  ipcMain.handle('overwrite-auto-remind-prompt-with-default', async (_, { type }) => {
    await writeDefaultAutoRemindPrompt({ type })
  })
  ipcMain.handle('check-if-llm-config-list-valid', async () => {
    const llmConfigList = await readConfigFile('llm.json')
    if (!Array.isArray(llmConfigList) || !llmConfigList?.length) {
      throw new Error('CANNOT_FIND_VALID_CONFIG')
    }
    if (llmConfigList.some((it) => !/^http(s)?:\/\//.test(it.providerCompleteApiUrl))) {
      throw new Error('CANNOT_FIND_VALID_CONFIG')
    }
    if (llmConfigList.length > 1) {
      const firstEnabledModel = llmConfigList.find((it) => it.enabled)
      if (!firstEnabledModel) {
        throw new Error('CANNOT_FIND_VALID_CONFIG')
      }
    }
  })
  ipcMain.on('test-llm-config-effect', (_, { autoReminderConfig } = {}) => {
    createReadNoReplyReminderLlmMockWindow(
      {
        parent: mainWindow!,
        modal: true,
        show: true
      },
      {
        autoReminderConfig
      }
    )
    async function requestLlm(_, requestPayload) {
      return await requestNewMessageContent(requestPayload.messageList, {
        requestScene: RequestSceneEnum.testing,
        llmConfigIdForPick: requestPayload.llmConfigIdForPick ?? null
      })
    }
    ipcMain.handle('request-llm-for-test', requestLlm)
    readNoReplyReminderLlmMockWindow?.once('closed', () => {
      ipcMain.removeHandler('request-llm-for-test')
    })
    async function getLlmConfigList() {
      return await readConfigFile('llm.json')
    }
    ipcMain.handle('get-llm-config-for-test', getLlmConfigList)
    readNoReplyReminderLlmMockWindow?.once('closed', () => {
      ipcMain.removeHandler('get-llm-config-for-test')
    })
  })
  ipcMain.on('close-read-no-reply-reminder-llm-mock-window', () => {
    readNoReplyReminderLlmMockWindow?.close()
    gtag('mock_chat_window_closed')
  })
  ipcMain.handle('check-update', async () => {
    const newRelease = await checkUpdateForUi()
    return newRelease
  })
  ipcMain.handle('login-with-cookie-assistant', async () => {
    return await loginWithCookieAssistant({
      windowOption: {
        parent: mainWindow!,
        modal: true,
        show: true
      }
    })
  })
  ipcMain.handle('config-with-browser-assistant', async () => {
    return await configWithBrowserAssistant({
      windowOption: {
        parent: mainWindow!,
        modal: true,
        show: true
      }
    })
  })

  ipcMain.handle('pre-enter-setting-ui', async () => {
    if (!isFirstLaunchNoticeApproveFlagExist()) {
      try {
        await waitForUserApproveAgreement({
          windowOption: {
            parent: mainWindow!,
            modal: true,
            show: true
          }
        })
        createFirstLaunchNoticeApproveFlag()
      } catch {
        app.exit(0)
        return
      }
    }
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      const lastBrowser = await getLastUsedAndAvailableBrowser()
      if (!lastBrowser) {
        try {
          await configWithBrowserAssistant({
            windowOption: {
              parent: mainWindow!,
              modal: true,
              show: true
            },
            autoFind: true
          })
        } catch (err) {
          void err
        }
      }
    }
  })
  ipcMain.handle('common-job-condition-config', async () => {
    await waitForCommonJobConditionDone()
    mainWindow?.webContents.send('common-job-condition-config-updated', {
      config: await readConfigFile('common-job-condition-config.json')
    })
  })

  // PDF 简历解析（使用 LLM）
  ipcMain.handle('parse-pdf-resume-with-llm', async (ev, { pdfText }: { pdfText: string }) => {
    try {
      const parsedResume = await parseResumeFromPdf(pdfText)
      return {
        success: true,
        data: parsedResume
      }
    } catch (error) {
      console.error('Parse PDF resume with LLM error:', error)
      return {
        success: false,
        error: error.message || '简历解析失败'
      }
    }
  })

  ipcMain.handle('exit-app-immediately', () => {
    app.exit(0)
  })

  // 保存每日统计通知配置
  ipcMain.handle('save-daily-stats-notification-config', async (_, config) => {
    await writeConfigFile('daily-stats-notification.json', config)
    // 重启或更新定时通知任务
    await setupDailyStatsNotification(config)
    return { success: true }
  })

  // 获取每日统计通知配置
  ipcMain.handle('get-daily-stats-notification-config', async () => {
    return await readConfigFile('daily-stats-notification.json')
  })

  // 获取今日统计预览
  ipcMain.handle('get-today-stats-preview', async () => {
    const { getTodayStats } = await import('./daily-stats-notification')
    return await getTodayStats()
  })

  // 测试每日统计通知
  ipcMain.handle('test-daily-stats-notification', async (_, { type, webhookUrl, template }) => {
    try {
      await sendDailyStatsNotification({
        type,
        webhookUrl,
        resumeCount: 5,
        bossCount: 3,
        template
      })
      return { success: true }
    } catch (error) {
      console.error('Test notification error:', error)
      return { success: false, error: error.message }
    }
  })
}

// 同步BOSS直聘沟通列表
import { initDb } from '@dagegong/sqlite-plugin'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { saveBossChatRelationList } from '@dagegong/sqlite-plugin/dist/handlers'
import { BossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/BossChatRelation'

import { initPuppeteer } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
import { getAnyAvailablePuppeteerExecutable } from '../../DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'

async function syncBossChatRelations() {
  const dbInitPromise = initDb(getPublicDbFilePath())
  let browser = null
  
  try {
    // 获取cookie
    const cookies = readStorageFile('boss-cookies.json') || []
    if (!cookies.length) {
      return { success: false, error: '未配置BOSS直聘Cookie' }
    }
    
    // 启动浏览器获取用户信息
    const { puppeteer } = await initPuppeteer()
    const browserInfo = await getAnyAvailablePuppeteerExecutable()
    if (!browserInfo) {
      return { success: false, error: '未找到可用的浏览器，请先配置浏览器' }
    }
    browser = await puppeteer.launch({
      headless: true,
      executablePath: browserInfo.executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    const page = await browser.newPage()
    
    // 设置cookie
    await page.setCookie(...cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    })))
    
    // 打开聊天页面获取用户信息和沟通列表
    console.log('[SyncBossChat] Navigating to chat page...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    // 等待页面基本结构加载
    console.log('[SyncBossChat] Waiting for page structure...')
    await page.waitForSelector('.main-wrap, .chat-container, #container', { 
      timeout: 30000 
    }).catch(() => {
      console.log('[SyncBossChat] Main container not found, trying alternative selectors...')
    })
    
    // 等待一段时间让 Vue 应用初始化
    await new Promise(r => setTimeout(r, 3000))
    
    // 检查是否登录（通过检查页面中的登录状态）
    console.log('[SyncBossChat] Checking login status...')
    const isLoggedIn = await page.evaluate(() => {
      // 检查页面中是否有登录相关的元素或数据
      const hasVueData = !!(document.querySelector('.main-wrap') as any)?.__vue__
      const hasUserElement = document.querySelector('.user-info, .avatar-wrap, .user-name')
      const hasLoginForm = document.querySelector('.login-wrap, .login-form, [class*="login"]')
      return { hasVueData, hasUserElement: !!hasUserElement, hasLoginForm: !!hasLoginForm }
    })
    
    console.log('[SyncBossChat] Login check:', isLoggedIn)
    
    if (isLoggedIn.hasLoginForm && !isLoggedIn.hasUserElement) {
      await browser.close()
      return { success: false, error: 'BOSS直聘 Cookie 已过期，请重新登录' }
    }
    
    // 尝试等待聊天列表加载（使用更宽松的条件）
    console.log('[SyncBossChat] Waiting for chat list...')
    try {
      await page.waitForFunction(() => {
        const chatUser = document.querySelector('.chat-user, .chat-list, [class*="chat"]')
        const vueData = (chatUser as any)?.__vue__
        return vueData || document.querySelector('.chat-item, .user-item, .friend-item')
      }, { timeout: 30000 })
    } catch (waitError) {
      console.log('[SyncBossChat] Chat list wait timeout, checking alternative methods...')
    }
    
    // 获取当前用户信息（尝试多种方式）
    console.log('[SyncBossChat] Getting user info...')
    const userInfo = await page.evaluate(() => {
      // 尝试从 Vue store 获取
      const mainWrap = document.querySelector('.main-wrap, #app, #container')
      const vueStore = (mainWrap as any)?.__vue__?.$store
      if (vueStore?.state?.userInfo) {
        return vueStore.state.userInfo
      }
      
      // 尝试从全局变量获取
      const globalUserInfo = (window as any).__INITIAL_STATE__?.userInfo || (window as any).userInfo
      if (globalUserInfo) {
        return globalUserInfo
      }
      
      return null
    })
    
    console.log('[SyncBossChat] User info:', userInfo ? 'found' : 'not found')
    
    if (!userInfo || !userInfo.encryptUserId) {
      await browser.close()
      return { success: false, error: '未获取到当前用户信息，请确保BOSS直聘 Cookie 有效且未过期' }
    }
    
    const encryptUserId = userInfo.encryptUserId
    
    // 首先尝试从页面的 Vue 数据中直接获取沟通记录
    console.log('[SyncBossChat] Trying to get chat list from Vue data...')
    let allChatList = await page.evaluate(() => {
      try {
        // 尝试从 Vue 组件获取沟通列表
        const chatUserEl = document.querySelector('.chat-user, .chat-list')
        const vueData = (chatUserEl as any)?.__vue__
        
        if (vueData?.list && Array.isArray(vueData.list)) {
          return vueData.list
        }
        
        // 尝试从 store 获取
        const mainWrap = document.querySelector('.main-wrap, #app')
        const store = (mainWrap as any)?.__vue__?.$store
        if (store?.state?.chat?.list) {
          return store.state.chat.list
        }
        
        return null
      } catch (e) {
        console.error('Error getting Vue data:', e)
        return null
      }
    })
    
    // 如果 Vue 数据获取失败，尝试通过 API 获取
    if (!allChatList || allChatList.length === 0) {
      console.log('[SyncBossChat] Trying to get chat list from API...')
      allChatList = await page.evaluate(async () => {
        const allList: any[] = []
        let pageNum = 1
        const pageSize = 50
        let hasMore = true
        
        // 尝试多个 API 端点
        const apiEndpoints = [
          (page: number, size: number) => `/wapi/zprelation/friend/geekFilterByLabel?labelId=0&page=${page}&pageSize=${size}`,
          (page: number, size: number) => `/wapi/zprelation/friend/getGeekFriendList?page=${page}&pageSize=${size}`,
          (page: number, size: number) => `/wapi/zprelation/friend/list?page=${page}&pageSize=${size}&scene=1`
        ]
        
        for (const getEndpoint of apiEndpoints) {
          if (allList.length > 0) break // 如果已经获取到数据，不再尝试其他端点
          
          pageNum = 1
          hasMore = true
          
          while (hasMore && allList.length < 1000 && pageNum <= 20) {
            try {
              const endpoint = getEndpoint(pageNum, pageSize)
              console.log(`[SyncBossChat] Trying API: ${endpoint}`)
              
              const response = await fetch(endpoint, {
                headers: {
                  'accept': 'application/json, text/plain, */*',
                  'x-requested-with': 'XMLHttpRequest'
                },
                credentials: 'include'
              })
              
              if (!response.ok) {
                console.error('API request failed:', response.status)
                break
              }
              
              const result = await response.json()
              console.log('[SyncBossChat] API response:', result.code, result.message || '')
              
              if (result.code !== 0) {
                console.error('API error:', result.message || result.msg)
                break
              }
              
              // 尝试多种数据结构 (BOSS直聘 API 返回 friendList 而不是 list)
              let list = result.zpData?.friendList || result.zpData?.list || result.data?.friendList || result.data?.list || []
              
              if (!Array.isArray(list)) {
                console.error('List is not array:', typeof list)
                break
              }
              
              if (list.length === 0) {
                console.log('[SyncBossChat] Empty list returned')
                hasMore = false
                break
              }
              
              console.log(`[SyncBossChat] Got ${list.length} items from page ${pageNum}`)
              
              // 转换数据格式 (根据实际 API 返回结构调整)
              const formattedList = list.map((item: any) => ({
                friendId: Number(item.friendId || item.id || 0),
                encryptBossId: item.encryptFriendId || item.encryptBossId || item.bossId || '',
                name: item.name || '',
                title: item.bossTitle || item.title || '',
                avatar: item.avatar || '',
                encryptJobId: item.encryptJobId || item.jobId || '',
                jobName: item.jobName || '',
                brandName: item.brandName || '',
                encryptCompanyId: item.encryptCompanyId || item.companyId || '',
                lastText: item.lastText || '',
                lastMessageId: item.lastMessageId || '',
                unreadCount: item.unreadCount || 0,
                lastMsgStatus: item.lastMsgStatus || 0,
                lastTS: item.lastTS || item.updateTime || Date.now(),
                updateTime: item.updateTime || Date.now(),
                isTop: item.isTop || 0,
                relationType: item.relationType || 1,
                friendSource: item.friendSource || 0,
                goldGeekStatus: item.goldGeekStatus || 0,
                sourceTitle: item.sourceTitle || '',
                lastIsSelf: item.lastIsSelf || false
              }))
              
              allList.push(...formattedList)
              
              // 如果返回的数据少于pageSize，说明没有更多了
              if (list.length < pageSize) {
                hasMore = false
              } else {
                pageNum++
              }
            } catch (error) {
              console.error('Fetch error:', error)
              break
            }
          }
        }
        
        return allList
      })
    } else {
      console.log(`[SyncBossChat] Got ${allChatList.length} items from Vue data`)
    }
    
    // 关闭浏览器
    await browser.close()
    browser = null
    
    if (allChatList.length === 0) {
      return { success: false, error: '未获取到沟通记录，请确保BOSS直聘账号有沟通记录' }
    }
    
    // 保存到数据库
    const ds = await dbInitPromise
    const result = await saveBossChatRelationList(ds, allChatList, encryptUserId)
    
    return {
      success: true,
      data: {
        syncedCount: result.syncedCount,
        syncTime: result.syncTime
      }
    }
    
  } catch (error) {
    if (browser) {
      await browser.close()
    }
    console.error('Sync boss chat relations error:', error)
    return {
      success: false,
      error: error.message || '同步沟通记录失败'
    }
  }
}

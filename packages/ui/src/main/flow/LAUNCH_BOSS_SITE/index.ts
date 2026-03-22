import { app } from 'electron'
import path from 'path'
import { initPuppeteer } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
import {
  readStorageFile,
  writeStorageFile
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import {
  RECOMMEND_JOB_ENTRY_SELECTOR,
  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR
} from '@dagegong/geek-auto-start-chat-with-boss/constant.mjs'
import { setDomainLocalStorage } from '@dagegong/utils/puppeteer/local-storage.mjs'
import {
  saveJobInfoFromRecommendPage,
  saveChatStartupRecord,
  saveMarkAsNotSuitRecord,
  saveChatMessageRecord,
  saveJobHireStatusRecord
} from '@dagegong/sqlite-plugin/dist/handlers.js'
import { initDb } from '@dagegong/sqlite-plugin'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { MarkAsNotSuitReason, JobSource, JobHireStatus } from '@dagegong/sqlite-plugin/dist/enums.js'
import cheerio from 'cheerio'

import fs from 'node:fs'
import { Target } from 'puppeteer'
import { pipeWriteRegardlessError } from '../utils/pipe'
import * as JSONStream from 'JSONStream'
import { ChatStartupFrom } from '@dagegong/sqlite-plugin/dist/entity/ChatStartupLog.js'
import gtag from '../../utils/gtag'
import attachListenerForKillSelfOnParentExited from '../../utils/attachListenerForKillSelfOnParentExited'
import { type ChatMessageRecord } from '@dagegong/sqlite-plugin/dist/entity/ChatMessageRecord.js'
import { BossInfo } from '@dagegong/sqlite-plugin/dist/entity/BossInfo.js'
import { UserInfo } from '@dagegong/sqlite-plugin/dist/entity/UserInfo.js'
import { messageForSaveFilter } from '../../../common/utils/chat-list'

import {
  ensureEditThisCookie,
  editThisCookieExtensionPath
} from '@dagegong/launch-bosszhipin-login-page-with-preload-extension/utils.mjs'

const dbInitPromise = initDb(getPublicDbFilePath())

const attachRequestsListener = async (target: Target) => {
  const page = await target.page()
  if (!page) {
    return
  }

  // FIXME: might not work
  async function handleJobDetailPage({ encryptJobId } = { encryptJobId: null }) {
    if (!encryptJobId) {
      return
    }
    try {
      await page.waitForFunction(
        ({ encryptJobId }) => {
          return (
            location.href.startsWith(`https://www.zhipin.com/job_detail/${encryptJobId}`) &&
            (!!document.querySelector('#main .job-banner') ||
              !!document.documentElement.innerText?.includes(`您访问的页面不存在`))
          )
        },
        undefined,
        { encryptJobId }
      )
      const htmlContent = await page.content()
      if (htmlContent) {
        const $ = cheerio.load(htmlContent)
        const [jobBannerEl] = $('#main .job-banner') ?? []
        if (!jobBannerEl) {
          console.log(`access might be blocked`)
          if (
            htmlContent.includes(`您访问的页面不存在`) ||
            location.href === `https://www.zhipin.com/`
          ) {
            await saveJobHireStatusRecord(await dbInitPromise, {
              encryptJobId,
              hireStatus: JobHireStatus.DELETED,
              lastSeenDate: new Date()
            })
          }
        } else {
          const [jobStatusTextEl] = $('#main .job-banner .job-status') ?? []
          if (jobStatusTextEl) {
            const jobStatusText = $(jobStatusTextEl).text()?.trim() ?? ''
            if ([`职位已关闭`].includes(jobStatusText)) {
              await saveJobHireStatusRecord(await dbInitPromise, {
                encryptJobId,
                hireStatus: JobHireStatus.CLOSED,
                lastSeenDate: new Date()
              })
            } else {
              await saveJobHireStatusRecord(await dbInitPromise, {
                encryptJobId,
                hireStatus: JobHireStatus.HIRING,
                lastSeenDate: new Date()
              })
            }
          }
        }
      }
    } catch {
      //
    }
  }

  if (page.url().match(/^https:\/\/www.zhipin.com\/job_detail\/(.+)\.html/)) {
    const encryptJobId = page.url().match(/^https:\/\/www.zhipin.com\/job_detail\/(.+)\.html/)?.[1]
    if (encryptJobId) {
      handleJobDetailPage({ encryptJobId })
    }
  }

  async function getCurrentJobSource() {
    const methodMap = {
      async recommend() {
        return await page.evaluate(
          ({ RECOMMEND_JOB_ENTRY_SELECTOR }) => {
            return document.querySelector(RECOMMEND_JOB_ENTRY_SELECTOR).classList.contains('active')
          },
          {
            RECOMMEND_JOB_ENTRY_SELECTOR
          }
        )
      },
      async expect() {
        return await page.evaluate(
          ({ USER_SET_EXPECT_JOB_ENTRIES_SELECTOR }) => {
            return [...document.querySelectorAll(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)].some((el) =>
              el.classList.contains('active')
            )
          },
          {
            USER_SET_EXPECT_JOB_ENTRIES_SELECTOR
          }
        )
      },
      async search() {
        const elHandle = await page.$(`.page-jobs-main`)
        const currentKeyWord = await elHandle?.evaluate((el) => {
          return el?.__vue__?.formData?.query
        })
        return !!currentKeyWord
      }
    }
    for (const [type, func] of Object.entries(methodMap)) {
      try {
        if (await func()) {
          return type
        }
      } catch (err) {
        console.error('encounter error when get job source')
      }
    }
    return null
  }

  page.on('response', async (response) => {
    if (response.url().match(/^https:\/\/www.zhipin.com\/job_detail\/(.+)\.html/)) {
      const encryptJobId = response
        .url()
        .match(/^https:\/\/www.zhipin.com\/job_detail\/(.+)\.html/)?.[1]
      if (encryptJobId) {
        handleJobDetailPage({ encryptJobId })
      }
    } else if (response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')) {
      const data = await response.json()

      console.log(data)
      if (data.code === 0) {
        await saveJobInfoFromRecommendPage(await dbInitPromise, data.zpData)
        await saveJobHireStatusRecord(await dbInitPromise, {
          encryptJobId: data.zpData.jobInfo.encryptId,
          hireStatus: JobHireStatus.HIRING,
          lastSeenDate: new Date()
        })
      }
    } else if (
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json')
    ) {
      const rawReasonResData = (await response.json())?.zpData?.result ?? []
      const reasonCodeToTextMap = await readStorageFile(
        'job-not-suit-reason-code-to-text-cache.json'
      )
      for (const it of rawReasonResData) {
        reasonCodeToTextMap[it.code] = it.text?.content ?? ''
      }
      await writeStorageFile('job-not-suit-reason-code-to-text-cache.json', reasonCodeToTextMap)
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/jobs') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/save.json')
    ) {
      const currentJobData = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.data'
      )
      const requestBody = new URLSearchParams(response.request().postData())

      const securityIdInRequest = requestBody.get('securityId')
      const currentJobSecurityId = currentJobData?.securityId

      if (securityIdInRequest !== currentJobSecurityId) {
        return
      }

      const chosenCode = Number(requestBody.get('code'))
      const currentUserInfo = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.$store.state.userInfo'
      )
      const reasonCodeToTextMap = await readStorageFile(
        'job-not-suit-reason-code-to-text-cache.json'
      )
      const jobSource = await getCurrentJobSource()
      const markDetail = {
        markFrom: ChatStartupFrom.ManuallyFromRecommendList,
        extInfo: {
          chosenReasonInUi: {
            code: chosenCode,
            text: reasonCodeToTextMap[chosenCode]
          }
        },
        markReason: MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON,
        jobSource: JobSource[jobSource]
      }
      gtag('job_marked_as_not_suit', {
        markFrom: markDetail.markFrom,
        bossActiveTimeDesc: currentJobData?.bossInfo?.activeTimeDesc,
        encryptJobId: currentJobData?.jobInfo?.encryptId,
        jobSource: JobSource[jobSource]
      })
      if (reasonCodeToTextMap[chosenCode]?.includes('活跃度低')) {
        markDetail.markReason = MarkAsNotSuitReason.BOSS_INACTIVE
        markDetail.extInfo.bossActiveTimeDesc = currentJobData?.bossInfo.activeTimeDesc
      }
      await saveMarkAsNotSuitRecord(
        await dbInitPromise,
        currentJobData,
        {
          encryptUserId: currentUserInfo.encryptUserId
        },
        markDetail
      )
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/jobs') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json')
    ) {
      const request = response.request().url()

      const url = new URL(request)
      const jobIdInAddFriendUrl = url.searchParams.get('jobId')

      // access current page, predict if jobId of current page is equal to jobId in request
      // in case of page changed after startup chat
      const currentJobData = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.data'
      )
      const currentJobId = currentJobData?.jobInfo?.encryptId
      if (jobIdInAddFriendUrl !== currentJobId) {
        return
      }

      const currentUserInfo = await page.evaluate(
        'document.querySelector(".job-detail-box").__vue__.$store.state.userInfo'
      )
      const jobSource = await getCurrentJobSource()
      gtag('new_chat_startup', {
        chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList,
        encryptJobId: currentJobData?.jobInfo?.encryptId,
        jobSource: JobSource[jobSource]
      })
      await saveChatStartupRecord(
        await dbInitPromise,
        currentJobData,
        {
          encryptUserId: currentUserInfo.encryptUserId
        },
        {
          chatStartupFrom: ChatStartupFrom.ManuallyFromRecommendList,
          jobSource: JobSource[jobSource]
        }
      )
    } else if (
      page.url().startsWith('https://www.zhipin.com/web/geek/chat') &&
      response.url().startsWith('https://www.zhipin.com/wapi/zpchat/geek/historyMsg')
    ) {
      console.log('[DEBUG] Intercepted historyMsg response:', response.url())
      
      const currentUserInfo = await page.evaluate(
        'document.querySelector(".main-wrap").__vue__.$store.state.userInfo'
      )
      const request = response.request().url()

      const url = new URL(request)
      const encryptBossIdInAddFriendUrl = url.searchParams.get('bossId')
      
      console.log('[DEBUG] Request bossId:', encryptBossIdInAddFriendUrl)

      // 添加重试机制获取 bossInfo
      let bossInfo = null
      let retryCount = 0
      const maxRetries = 5
      
      while (!bossInfo && retryCount < maxRetries) {
        bossInfo = await page.evaluate(() => {
          const selectors = [
            '.chat-conversation .chat-record',
            '.chat-record',
            '[class*="chat-record"]'
          ]
          for (const selector of selectors) {
            const el = document.querySelector(selector)
            if (el?.__vue__?.boss) {
              console.log(`[DEBUG] Found bossInfo with selector: ${selector}`)
              return el.__vue__.boss
            }
          }
          return null
        })
        
        if (!bossInfo) {
          retryCount++
          console.log(`[DEBUG] Waiting for bossInfo (${retryCount}/${maxRetries})...`)
          await new Promise(r => setTimeout(r, 500))
        }
      }
      
      if (!bossInfo) {
        console.warn('[DEBUG] cannot find boss info on page after retries.')
        return
      }
      
      console.log('[DEBUG] Got bossInfo:', { encryptBossId: bossInfo.encryptBossId, name: bossInfo.name })
      
      const ds = await dbInitPromise
      // save boss info
      const bossInfoRepository = ds.getRepository(BossInfo)
      let targetBossInfo = await bossInfoRepository.findOneBy({
        encryptBossId: bossInfo.encryptBossId
      })
      if (!targetBossInfo) {
        targetBossInfo = new BossInfo()
        Object.assign(targetBossInfo, {
          encryptBossId: bossInfo.encryptBossId,
          name: bossInfo.name,
          title: bossInfo.title,
          date: new Date()
        })
        await bossInfoRepository.save(targetBossInfo)
      }
      if (encryptBossIdInAddFriendUrl !== bossInfo.encryptBossId) {
        console.log('[DEBUG] BossId mismatch, skipping. URL:', encryptBossIdInAddFriendUrl, 'Page:', bossInfo.encryptBossId)
        return
      }
      
      // 添加重试机制获取聊天记录
      let rawChatRecordList: any[] = []
      retryCount = 0
      
      while (rawChatRecordList.length === 0 && retryCount < maxRetries) {
        rawChatRecordList = await page.evaluate(() => {
          const selectors = [
            { sel: '.message-content .chat-record', props: ['list$', 'records$'] },
            { sel: '.chat-conversation .chat-record', props: ['list$', 'records$'] },
            { sel: '.chat-record', props: ['list$', 'records$'] }
          ]
          
          for (const { sel, props } of selectors) {
            const el = document.querySelector(sel)
            if (el?.__vue__) {
              for (const prop of props) {
                if (el.__vue__[prop]) {
                  console.log(`[DEBUG] Found chat records with selector: ${sel}, prop: ${prop}`)
                  return el.__vue__[prop]
                }
              }
            }
          }
          return []
        })
        
        if (rawChatRecordList.length === 0) {
          retryCount++
          console.log(`[DEBUG] Waiting for chat records (${retryCount}/${maxRetries})...`)
          await new Promise(r => setTimeout(r, 500))
        }
      }
      
      console.log('[DEBUG] Got rawChatRecordList length:', rawChatRecordList?.length ?? 0)
      
      rawChatRecordList = rawChatRecordList?.filter(messageForSaveFilter) ?? []

      const chatRecordList = rawChatRecordList.map((it) => {
        const mappedItem = {} as InstanceType<typeof ChatMessageRecord>
        mappedItem.mid = it.mid
        mappedItem.encryptFromUserId = it.isSelf
          ? currentUserInfo.encryptUserId
          : bossInfo.encryptBossId
        mappedItem.encryptToUserId = it.isSelf
          ? bossInfo.encryptBossId
          : currentUserInfo.encryptUserId
        mappedItem.style = it.isSelf ? 'sent' : 'received'
        mappedItem.type = it.type
        mappedItem.time = it.time ? new Date(it.time) : null
        mappedItem.text = it.text
        if (it.type === 'image') {
          mappedItem.imageUrl = it.image?.originImage?.url
          mappedItem.imageHeight = it.image?.originImage?.url?.height
          mappedItem.imageWidth = it.image?.originImage?.url?.width
        }

        return mappedItem
      })
      await saveChatMessageRecord(ds, chatRecordList)
      console.log('[DEBUG] Saved', chatRecordList.length, 'chat messages to database')
      
      // 同时保存用户信息到 user_info 表
      if (currentUserInfo?.encryptUserId) {
        try {
          const userInfoRepository = ds.getRepository(UserInfo)
          let userInfoRecord = await userInfoRepository.findOneBy({
            encryptUserId: currentUserInfo.encryptUserId
          })
          if (!userInfoRecord) {
            userInfoRecord = new UserInfo()
            userInfoRecord.encryptUserId = currentUserInfo.encryptUserId
            userInfoRecord.name = currentUserInfo.name || currentUserInfo.nickName || '未知用户'
            await userInfoRepository.save(userInfoRecord)
            console.log('[DEBUG] Saved user info:', userInfoRecord.encryptUserId, userInfoRecord.name)
          }
        } catch (err) {
          console.error('[DEBUG] Failed to save user info:', err)
        }
      }
    }
  })

  await page.waitForResponse((response) => {
    if (response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')) {
      return true
    }
    return false
  })
}

export async function launchBossSite() {
  app.dock?.hide()
  await ensureEditThisCookie()
  const bossCookies = readStorageFile('boss-cookies.json')
  const bossLocalStorage = readStorageFile('boss-local-storage.json')

  const { puppeteer } = await initPuppeteer()
  const browser = await puppeteer.launch({
    headless: false,
    pipe: true,
    ignoreDefaultArgs: ['--enable-automation'],
    enableExtensions: [editThisCookieExtensionPath],
    defaultViewport: null,
    args: [
      '--disable-infobars',
      '--window-size=1440,900',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
      '--test-type=ui',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--hide-scrollbars',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
      '--password-store=basic',
      '--use-mock-keychain',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  })
  let [page] = await browser.pages()
  for (let i = 0; i < bossCookies.length; i++) {
    await page.setCookie(bossCookies[i])
  }

  const localStoragePageUrl = `https://www.zhipin.com/desktop/`
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)

  //#region pipe
  let pipeForWrite: null | fs.WriteStream = null
  let pipeForRead: null | fs.ReadStream = null
  try {
    pipeForWrite = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.warn('pipeForWrite is not available')
  }
  try {
    pipeForRead = fs.createReadStream(null, { fd: 3 })
  } catch {
    console.warn('pipeForRead is not available')
  }
  pipeForRead?.pipe(JSONStream.parse())?.on('data', async function handler(data) {
    if (data.type !== 'NEW_WINDOW') {
      return
    }
    const page = await browser.newPage()
    await page.goto(data.url)
  })

  pipeWriteRegardlessError(
    pipeForWrite,
    JSON.stringify({
      type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY'
    })
  )
  //#endregion
  gtag('launch_boss_site_ready')
  browser.on('targetcreated', (target) => {
    attachRequestsListener(target)
  })
  browser.on('targetdestroyed', async () => {
    const pages = await browser.pages()
    if (pages.length) {
      return
    }
    const cp = browser.process()
    cp.kill()
    pipeWriteRegardlessError(
      pipeForWrite,
      JSON.stringify({
        type: 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED'
      })
    )
    process.exit(0)
  })

  const tempPage = await browser.newPage()
  await page.close()
  page = tempPage
  
  // 手动为新页面绑定请求监听器
  await attachRequestsListener(page.target())
}

attachListenerForKillSelfOnParentExited()

/**
 * 启动浏览器并发送回复消息（用于AI自动回复）
 */
export async function launchBossSiteForReply(
  encryptBossId: string,
  encryptJobId: string | undefined,
  message: string,
  bossName?: string
): Promise<void> {
  console.log('[LaunchBossSite] ====== launchBossSiteForReply 开始 ======')
  console.log('[LaunchBossSite] 参数:', {
    encryptBossId: encryptBossId?.substring(0, 20) + '...',
    encryptJobId: encryptJobId?.substring(0, 20) + '...' || 'undefined',
    bossName: bossName || '(未提供)',
    messageLength: message.length,
    messagePreview: message.substring(0, 50) + '...'
  })
  
  // 如果没有提供 bossName，从数据库查询
  if (!bossName) {
    try {
      const dbPath = path.join(app.getPath('userData'), 'storage', 'public.db')
      const sqlite3 = await import('better-sqlite3')
      const db = sqlite3.default(dbPath)
      const result = db.prepare('SELECT bossName FROM boss_chat_relation WHERE encryptBossId = ?').get(encryptBossId)
      if (result?.bossName) {
        bossName = result.bossName
        console.log('[LaunchBossSite] 从数据库获取 bossName:', bossName)
      }
      db.close()
    } catch (e) {
      console.log('[LaunchBossSite] 查询 bossName 失败:', e.message)
    }
  }
  
  const { puppeteer } = await initPuppeteer()
  console.log('[LaunchBossSite] Puppeteer 初始化完成')
  
  const browserInfo = await getAnyAvailablePuppeteerExecutable()
  if (!browserInfo) {
    throw new Error('未找到可用的浏览器')
  }
  console.log('[LaunchBossSite] 浏览器可执行文件:', browserInfo.executablePath)

  console.log('[LaunchBossSite] 正在启动浏览器...')
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: browserInfo.executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  console.log('[LaunchBossSite] 浏览器启动成功')

  // 确保 debug 目录存在
  const debugDir = path.join(app.getPath('userData'), 'debug')
  await import('fs').then(fs => {
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true })
    }
  })

  try {
    console.log('[LaunchBossSite] 正在创建新页面...')
    const page = await browser.newPage()
    console.log('[LaunchBossSite] 页面创建成功')

    // 设置cookie
    console.log('[LaunchBossSite] 正在设置 Cookie...')
    const cookies = readStorageFile('boss-cookies.json') || []
    console.log('[LaunchBossSite] Cookie 数量:', cookies.length)
    for (const cookie of cookies) {
      await page.setCookie(cookie)
    }
    console.log('[LaunchBossSite] Cookie 设置完成')

    // 打开聊天页面 - 使用简洁的 URL，让页面自动加载
    const chatUrl = 'https://www.zhipin.com/web/geek/chat'
    console.log('[LaunchBossSite] 正在打开聊天页面:', chatUrl)

    await page.goto(chatUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    console.log('[LaunchBossSite] 页面加载完成')

    // 截图查看初始页面
    const initialScreenshotPath = path.join(debugDir, `reply-initial-${Date.now()}.png`)
    await page.screenshot({ path: initialScreenshotPath, fullPage: true })
    console.log('[LaunchBossSite] 初始页面截图已保存:', initialScreenshotPath)

    // 等待页面加载
    console.log('[LaunchBossSite] 等待聊天界面...')
    await page.waitForSelector('.chat-conversation, .chat-list, .main-wrap, .list-warp', { timeout: 30000 })
    console.log('[LaunchBossSite] 聊天界面加载完成')
    await new Promise((r) => setTimeout(r, 3000))
    
    // ====== 步骤 1：点击"未读"标签过滤未读消息 ======
    console.log('[LaunchBossSite] 步骤 1：点击"未读"标签...')
    try {
      const unreadSelector = '#container > div > div > div.list-warp.v2 > div > div.label-list > ul > li:nth-child(2) > span'
      await page.click(unreadSelector)
      console.log('[LaunchBossSite] 已点击未读标签')
      await new Promise((r) => setTimeout(r, 2000))
    } catch (e) {
      console.log('[LaunchBossSite] 点击未读标签失败:', e.message)
    }
    
    // ====== 步骤 2：在搜索框中搜索 BOSS ======
    console.log(`[LaunchBossSite] 步骤 2：搜索 BOSS ${bossName || encryptBossId.slice(0, 10)}...`)
    try {
      const searchSelector = '#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input'
      // 使用 BOSS 名字搜索（比 ID 更有效）
      const searchTerm = bossName || encryptBossId.slice(0, 10)
      await page.click(searchSelector)
      await page.type(searchSelector, searchTerm, { delay: 100 })
      console.log('[LaunchBossSite] 已输入搜索词:', searchTerm)
      await new Promise((r) => setTimeout(r, 3000)) // 等待下拉菜单出现
    } catch (e) {
      console.log('[LaunchBossSite] 搜索失败:', e.message)
    }
    
    // ====== 步骤 3：点击第一个搜索结果 ======
    console.log('[LaunchBossSite] 步骤 3：点击搜索结果...')
    try {
      // 点击搜索结果中的第一个结果
      console.log('[LaunchBossSite] 点击第一个搜索结果...')
      const searchResultSelector = '.boss-search-result .search-ul .search-list'
      await page.click(searchResultSelector)
      console.log('[LaunchBossSite] 已点击搜索结果:', searchResultSelector)
      
      await new Promise((r) => setTimeout(r, 3000))
    } catch (e) {
      console.log('[LaunchBossSite] 点击搜索结果失败:', e.message)
    }
    console.log(`[LaunchBossSite] 在左侧列表中查找 BOSS: ${encryptBossId}`)
    const foundBoss = await page.evaluate((targetBossId) => {
      // 尝试多种选择器找到对话列表项
      const selectors = [
        '.chat-list .chat-item',
        '.conversation-list .conversation-item',
        '.friend-list .friend-item',
        '[class*="chat"] [class*="item"]',
        '.chat-record'
      ]
      
      for (const selector of selectors) {
        const items = document.querySelectorAll(selector)
        console.log(`[LaunchBossSite] 选择器 ${selector} 找到 ${items.length} 个元素`)
        
        for (const item of items) {
          // 检查是否包含目标 BOSS ID
          const vueData = (item as any).__vue__ || (item as any).__VUE__
          const itemBossId = vueData?.encryptBossId || vueData?.bossId || 
                            item.getAttribute('data-boss-id') ||
                            item.getAttribute('boss-id')
          
          if (itemBossId === targetBossId) {
            // 找到目标 BOSS，点击它
            (item as HTMLElement).click()
            return { found: true, selector, bossId: itemBossId }
          }
        }
      }
      
      // 如果没找到精确匹配，尝试文本匹配
      const allItems = document.querySelectorAll('.chat-list .chat-item, .conversation-list .conversation-item, .friend-list .friend-item')
      for (const item of allItems) {
        const text = item.textContent || ''
        // 如果文本包含某些关键词，也可以尝试点击
        if (text.includes('期望薪资') || text.includes('薪资')) {
          (item as HTMLElement).click()
          return { found: true, selector: 'text-match', text: text.slice(0, 50) }
        }
      }
      
      return { found: false, totalItems: allItems.length }
    }, encryptBossId)
    
    console.log('[LaunchBossSite] 查找 BOSS 结果:', foundBoss)
    
    if (!foundBoss.found) {
      console.log('[LaunchBossSite] 未找到目标 BOSS，尝试点击第一个对话...')
      // 尝试点击第一个对话
      await page.evaluate(() => {
        const firstItem = document.querySelector('.chat-list .chat-item, .conversation-list .conversation-item, .friend-list .friend-item')
        if (firstItem) {
          (firstItem as HTMLElement).click()
          return true
        }
        return false
      })
    }
    
    // 等待对话加载
    await new Promise((r) => setTimeout(r, 2000))
    
    // 截图确认当前对话
    const afterClickScreenshotPath = path.join(debugDir, `reply-after-click-${Date.now()}.png`)
    await page.screenshot({ path: afterClickScreenshotPath, fullPage: true })
    console.log('[LaunchBossSite] 点击后截图已保存:', afterClickScreenshotPath)

    // 检查是否登录
    console.log('[LaunchBossSite] 检查登录状态...')
    const isLoggedIn = await page.evaluate(() => {
      const hasLoginForm = document.querySelector('.login-wrap, .login-form')
      return !hasLoginForm
    })

    if (!isLoggedIn) {
      throw new Error('BOSS直聘 Cookie 已过期')
    }
    console.log('[LaunchBossSite] 登录状态正常')

    // ====== 从页面读取最后一条消息 ======
    console.log('[LaunchBossSite] 从页面读取最后一条消息...')
    const lastMessageInfo = await page.evaluate(() => {
      const selectors = [
        '.chat-conversation .message-item:last-child .message-content',
        '.chat-conversation .message-item:last-child .text-content',
        '.chat-conversation [class*="message"]:last-child [class*="content"]'
      ]
      
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el?.textContent) {
          const isSelf = el.closest('.sent') !== null || el.classList.contains('sent')
          return {
            text: el.textContent.trim(),
            selector: sel,
            isSelf
          }
        }
      }
      return null
    })
    
    console.log('[LaunchBossSite] 页面最后消息:', lastMessageInfo)
    
    if (!lastMessageInfo || lastMessageInfo.isSelf) {
      console.log('[LaunchBossSite] 没有新消息或最后一条是自己发的，跳过')
      return
    }
    
    // ====== 调用 Dify API 生成回复 ======
    console.log('[LaunchBossSite] 调用 Dify API 生成回复...')
    
    // 读取 Dify 配置
    const { readConfigFile } = await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs')
    const aiConfig = readConfigFile('ai-auto-reply.json') || {}
    
    let replyMessage = message // 默认使用传入的消息
    
    if (aiConfig.apiUrl && aiConfig.apiKey) {
      try {
        const response = await fetch(aiConfig.apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${aiConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: {},
            query: `BOSS 说: "${lastMessageInfo.text}"\n\n请给出一个专业、得体的回复。`,
            response_mode: 'blocking',
            conversation_id: '',
            user: 'dagegong-auto-reply'
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          const aiReply = data.answer || data.message || data.content
          if (aiReply) {
            replyMessage = aiReply.trim()
            console.log('[LaunchBossSite] AI 生成回复:', replyMessage.substring(0, 100) + '...')
          }
        }
      } catch (e) {
        console.log('[LaunchBossSite] Dify 调用失败，使用默认回复:', e.message)
      }
    } else {
      console.log('[LaunchBossSite] 未配置 Dify，使用传入的消息')
    }

    // 发送消息
    console.log('[LaunchBossSite] 准备发送消息...')
    
    // 先截图查看页面状态
    const beforeScreenshotPath = path.join(debugDir, `reply-before-${Date.now()}.png`)
    await page.screenshot({ path: beforeScreenshotPath, fullPage: true })
    console.log('[LaunchBossSite] 发送前截图已保存:', beforeScreenshotPath)
    
    // 查找输入框（使用测试确认的选择器）
    const chatInputSelector = '.chat-conversation .message-controls .chat-input'
    console.log('[LaunchBossSite] 查找输入框，选择器:', chatInputSelector)
    let chatInputHandle = await page.$(chatInputSelector)
    
    if (!chatInputHandle) {
      // 尝试其他可能的选择器
      console.log('[LaunchBossSite] 未找到输入框，尝试备用选择器...')
      const alternativeSelectors = [
        '.chat-input',
        '[contenteditable="true"]',
        '.editor-input',
        'div[role="textbox"]',
        '.message-controls textarea',
        '.chat-editor'
      ]
      for (const sel of alternativeSelectors) {
        chatInputHandle = await page.$(sel)
        if (chatInputHandle) {
          console.log('[LaunchBossSite] 使用备用选择器找到输入框:', sel)
          break
        }
      }
    }
    
    if (!chatInputHandle) {
      // 截图查看页面结构
      const errorScreenshotPath = path.join(debugDir, `reply-error-no-input-${Date.now()}.png`)
      await page.screenshot({ path: errorScreenshotPath, fullPage: true })
      console.log('[LaunchBossSite] 未找到输入框，错误截图:', errorScreenshotPath)
      
      // 获取页面 HTML 帮助调试
      const html = await page.content()
      console.log('[LaunchBossSite] 页面 HTML 片段:', html.substring(0, 2000))
      
      throw new Error('未找到聊天输入框')
    }
    console.log('[LaunchBossSite] 找到聊天输入框')

    console.log('[LaunchBossSite] 点击输入框...')
    await chatInputHandle.click()
    await new Promise((r) => setTimeout(r, 500))
    
    console.log('[LaunchBossSite] 清空输入框...')
    await chatInputHandle.evaluate(el => {
      if (el instanceof HTMLElement) {
        el.innerHTML = ''
        el.textContent = ''
        if ((el as HTMLInputElement).value !== undefined) {
          (el as HTMLInputElement).value = ''
        }
      }
    })
    await new Promise((r) => setTimeout(r, 200))
    
    console.log('[LaunchBossSite] 输入消息内容...')
    await chatInputHandle.type(replyMessage, { delay: 50 })
    await new Promise((r) => setTimeout(r, 1000))
    
    // 截图检查输入内容
    const inputScreenshotPath = path.join(debugDir, `reply-input-${Date.now()}.png`)
    await page.screenshot({ path: inputScreenshotPath, fullPage: true })
    console.log('[LaunchBossSite] 输入后截图已保存:', inputScreenshotPath)
    
    console.log('[LaunchBossSite] 点击发送按钮...')
    // 使用测试确认的选择器
    const sendButtonSelector = '.chat-conversation .btn-send:not(.disabled)'
    let sendButton = await page.$(sendButtonSelector)
    
    if (!sendButton) {
      console.log('[LaunchBossSite] 未找到发送按钮，尝试备用选择器...')
      const altButtonSelectors = [
        '.btn-send',
        '[class*="send"]',
        'button:has-text("发送")',
        '.message-controls button',
        '.chat-op button'
      ]
      for (const sel of altButtonSelectors) {
        sendButton = await page.$(sel)
        if (sendButton) {
          console.log('[LaunchBossSite] 使用备用选择器找到发送按钮:', sel)
          break
        }
      }
    }
    
    if (!sendButton) {
      // 尝试通过文本内容找到发送按钮
      console.log('[LaunchBossSite] 尝试通过文本查找发送按钮...')
      sendButton = await page.evaluateHandle(() => {
        const buttons = document.querySelectorAll('button, div[role="button"]')
        for (const btn of buttons) {
          const text = btn.textContent?.trim()
          if (text === '发送' || text?.includes('发送')) {
            return btn
          }
        }
        return null
      })
      if (sendButton) {
        console.log('[LaunchBossSite] 通过文本找到发送按钮')
      }
    }
    
    if (!sendButton) {
      const errorScreenshotPath = path.join(debugDir, `reply-error-no-button-${Date.now()}.png`)
      await page.screenshot({ path: errorScreenshotPath, fullPage: true })
      console.log('[LaunchBossSite] 未找到发送按钮，错误截图:', errorScreenshotPath)
      throw new Error('未找到发送按钮')
    }
    
    console.log('[LaunchBossSite] 找到发送按钮，准备点击')
    await sendButton.click()

    // 等待消息发送成功
    console.log('[LaunchBossSite] 等待发送完成...')
    await new Promise((r) => setTimeout(r, 3000))
    
    // 截图确认发送成功
    const afterScreenshotPath = path.join(debugDir, `reply-after-${Date.now()}.png`)
    await page.screenshot({ path: afterScreenshotPath, fullPage: true })
    console.log('[LaunchBossSite] 发送后截图已保存:', afterScreenshotPath)

    console.log('[LaunchBossSite] ====== 消息发送成功 ======')
    console.log('[LaunchBossSite] 发送内容:', replyMessage.substring(0, 100) + '...')
  } catch (error) {
    console.error('[LaunchBossSite] ====== 发送过程中出错 ======')
    console.error('[LaunchBossSite] 错误:', error)
    throw error
  } finally {
    console.log('[LaunchBossSite] 正在关闭浏览器...')
    await browser.close()
    console.log('[LaunchBossSite] 浏览器已关闭')
  }
}

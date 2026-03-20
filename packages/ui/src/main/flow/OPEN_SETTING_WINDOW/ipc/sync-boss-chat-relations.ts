/**
 * BOSS沟通记录同步功能
 * 支持 headless 模式运行
 */

import { readStorageFile, getPublicDbFilePath } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { getAnyAvailablePuppeteerExecutable } from '../../DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
import { initDb, saveBossChatRelationList } from '@geekgeekrun/sqlite-plugin/dist/index.js'
import { initPuppeteer } from '@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs'

interface SyncOptions {
  headless?: boolean
}

export async function syncBossChatRelations(options: SyncOptions = {}): Promise<{
  success: boolean
  error?: string
  data?: {
    syncedCount: number
    syncTime: number
  }
}> {
  const { headless = false } = options
  const dbInitPromise = initDb(getPublicDbFilePath())
  let browser: any = null
  
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
      headless: headless,
      executablePath: browserInfo.executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // 设置cookie
    await page.setCookie(...cookies.map((c: any) => ({
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
    
    // 检查是否登录
    console.log('[SyncBossChat] Checking login status...')
    const isLoggedIn = await page.evaluate(() => {
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
    
    // 尝试等待聊天列表加载
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
    
    // 获取当前用户信息
    console.log('[SyncBossChat] Getting user info...')
    const userInfo = await page.evaluate(() => {
      const mainWrap = document.querySelector('.main-wrap, #app, #container')
      const vueStore = (mainWrap as any)?.__vue__?.$store
      if (vueStore?.state?.userInfo) {
        return vueStore.state.userInfo
      }
      
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
    let allChatList: any[] = await page.evaluate(() => {
      try {
        const chatUserEl = document.querySelector('.chat-user, .chat-list')
        const vueData = (chatUserEl as any)?.__vue__
        
        if (vueData?.list && Array.isArray(vueData.list)) {
          return vueData.list
        }
        
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
        
        const apiEndpoints = [
          (page: number, size: number) => `/wapi/zprelation/friend/geekFilterByLabel?labelId=0&page=${page}&pageSize=${size}`,
          (page: number, size: number) => `/wapi/zprelation/friend/getGeekFriendList?page=${page}&pageSize=${size}`,
          (page: number, size: number) => `/wapi/zprelation/friend/list?page=${page}&pageSize=${size}&scene=1`
        ]
        
        for (const getEndpoint of apiEndpoints) {
          if (allList.length > 0) break
          
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
      try {
        await browser.close()
      } catch {}
    }
    
    console.error('[SyncBossChat] Error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

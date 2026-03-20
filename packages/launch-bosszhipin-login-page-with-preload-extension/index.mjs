import {
  initPuppeteer
} from '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
import {
  sleep,
  sleepWithRandomDelay
} from '@dagegong/utils/sleep.mjs'
import { blockNavigation } from '@dagegong/utils/puppeteer/block-navigation.mjs'
import {
  writeStorageFile
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

import JSON5 from 'json5'
import url from 'url';
import {
  runtimeFolderPath,
  ensureEditThisCookie,
  editThisCookieExtensionPath,
} from './utils.mjs'

import { EventEmitter } from 'node:events'

export const loginEventBus = new EventEmitter()

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

// 获取页面的 localStorage
async function getLocalStorage(page) {
  try {
    const localStorage = await page.evaluate(() => {
      const items = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        items[key] = localStorage.getItem(key)
      }
      return items
    })
    return localStorage
  } catch (err) {
    console.log('获取 localStorage 失败:', err)
    return {}
  }
}

// 获取页面的 sessionStorage
async function getSessionStorage(page) {
  try {
    const sessionStorage = await page.evaluate(() => {
      const items = {}
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        items[key] = sessionStorage.getItem(key)
      }
      return items
    })
    return sessionStorage
  } catch (err) {
    console.log('获取 sessionStorage 失败:', err)
    return {}
  }
}

// 检测是否已登录
async function checkIsLoggedIn(page) {
  try {
    // 方法1: 检测页面URL
    const currentUrl = page.url()
    if (currentUrl.startsWith('https://www.zhipin.com/web/geek/chat') ||
        currentUrl.startsWith('https://www.zhipin.com/') && !currentUrl.includes('/web/user/') && !currentUrl.includes('/login')) {
      
      // 方法2: 检测页面上是否有登录用户的特征元素
      const hasUserElement = await page.evaluate(() => {
        // 检测是否有用户头像、用户名等登录后的元素
        const avatar = document.querySelector('.avatar-wrap, .user-avatar, .header-avatar, [class*="avatar"]')
        const userName = document.querySelector('.user-name, .username, [class*="user-name"]')
        const chatEntry = document.querySelector('.chat-entry, [class*="chat"]')
        
        // 检测localStorage中是否有用户信息
        const hasUserInfo = localStorage.getItem('userInfo') || localStorage.getItem('user') || localStorage.getItem('token')
        
        return !!(avatar || userName || chatEntry || hasUserInfo)
      })
      
      return hasUserElement
    }
    return false
  } catch (err) {
    console.log('检测登录状态失败:', err)
    return false
  }
}

// 等待登录成功
async function waitForLoginSuccess(page, timeout = 0) {
  const loginSuccessPromiseList = [
    // 二维码登录确认
    page.waitForResponse(
      (response) =>
        response.url().startsWith('https://www.zhipin.com/wapi/zppassport/qrcode/loginConfirm'),
      { timeout: 0 }
    ).catch(() => {}),
    // 二维码分发器
    page.waitForResponse(
      (response) =>
        response.url().startsWith('https://www.zhipin.com/wapi/zppassport/qrcode/dispatcher'),
      { timeout: 0 }
    ).catch(() => {}),
    // 手机号登录
    page.waitForResponse(
      (response) =>
        response.url().startsWith('https://www.zhipin.com/wapi/zppassport/login/phoneV2'),
      { timeout: 0 }
    ).catch(() => {}),
    // 新的扫码登录API
    page.waitForResponse(
      (response) =>
        response.url().startsWith('https://www.zhipin.com/wapi/zppassport/login/miniprogram') ||
        response.url().includes('miniprogram'),
      { timeout: 0 }
    ).catch(() => {}),
    // 其他登录成功API
    page.waitForResponse(
      (response) =>
        response.url().includes('/login') && response.status() === 200,
      { timeout: 0 }
    ).catch(() => {})
  ]

  // 同时启动轮询检测
  const pollPromise = new Promise(async (resolve) => {
    const startTime = Date.now()
    while (true) {
      if (timeout > 0 && Date.now() - startTime > timeout) {
        break
      }
      
      const isLoggedIn = await checkIsLoggedIn(page)
      if (isLoggedIn) {
        resolve()
        break
      }
      
      await sleep(1000)
    }
  })

  // 等待任一方式检测到登录成功
  return Promise.race([
    Promise.any([...loginSuccessPromiseList, pollPromise]),
    // 兜底：等待页面导航到非登录页
    new Promise(async (resolve) => {
      const checkNavigation = async () => {
        const currentUrl = page.url()
        if (!currentUrl.includes('/web/user/') && !currentUrl.includes('/login')) {
          // 等待一下确保页面加载完成
          await sleep(2000)
          const isLoggedIn = await checkIsLoggedIn(page)
          if (isLoggedIn) {
            resolve()
          } else {
            // 继续检测
            setTimeout(checkNavigation, 1000)
          }
        } else {
          setTimeout(checkNavigation, 1000)
        }
      }
      checkNavigation()
    })
  ])
}

export async function main() {
  await ensureEditThisCookie()
  const { puppeteer } = await initPuppeteer()
  const browser = await puppeteer.launch({
    headless: false,
    pipe: true,
    ignoreDefaultArgs: ['--enable-automation'],
    enableExtensions: [editThisCookieExtensionPath],
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

  const closeAttachedSet = new WeakSet()
  browser.on('targetcreated', async function closeNewTabs(target) {
    let targetBrowser = target.browser();
    const pages = await targetBrowser.pages()
    console.log(pages)
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i]
      if (!closeAttachedSet.has(page)) {
        closeAttachedSet.add(page)
        page.once('domcontentloaded', () => {
          page.close()
        })
      }
    }
  })

  const [page] = await browser.pages();

  page.once('close', async () => {
    browser.close()
    const electron = await import('electron')
    electron.app.quit()
  })

  const { dispose: disposeNavigationLock } = await blockNavigation(page, (req) => !req.url().startsWith('https://www.zhipin.com'))
  
  console.log('[LoginAssistant] 正在打开登录页面...')
  await page.goto('https://www.zhipin.com/web/user/');

  console.log('[LoginAssistant] 等待用户登录...')
  
  try {
    // 等待登录成功
    await waitForLoginSuccess(page)
    console.log('[LoginAssistant] 检测到登录成功！')
    
    // 等待页面稳定
    await sleep(3000)
    
    // 尝试跳转到首页以获取完整的cookie
    const currentUrl = page.url()
    if (!currentUrl.startsWith('https://www.zhipin.com/web/geek/chat')) {
      console.log('[LoginAssistant] 正在跳转到首页获取完整数据...')
      try {
        await page.goto('https://www.zhipin.com/web/geek/chat', { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        })
        await sleep(2000)
      } catch (err) {
        console.log('[LoginAssistant] 跳转失败，使用当前页面:', err.message)
      }
    }
    
    // 处理安全检查页面
    if (page.url().includes('security-check')) {
      console.log('[LoginAssistant] 等待安全检查完成...')
      await page.waitForNavigation({ timeout: 60000 }).catch(() => {})
      await sleep(2000)
    }

    console.log('[LoginAssistant] 正在收集登录数据...')
    
    // 获取 cookies
    const cookies = await page.cookies()
    console.log(`[LoginAssistant] 获取到 ${cookies.length} 个 cookies`)
    
    // 获取 localStorage
    const localStorage = await getLocalStorage(page)
    console.log(`[LoginAssistant] 获取到 ${Object.keys(localStorage).length} 个 localStorage 项`)
    
    // 获取 sessionStorage
    const sessionStorage = await getSessionStorage(page)
    console.log(`[LoginAssistant] 获取到 ${Object.keys(sessionStorage).length} 个 sessionStorage 项`)

    // 保存 cookies
    await writeStorageFile('boss-cookies.json', cookies)
    console.log('[LoginAssistant] Cookies 已保存')
    
    // 保存 localStorage
    await writeStorageFile('boss-local-storage.json', localStorage)
    console.log('[LoginAssistant] LocalStorage 已保存')
    
    // 发送事件通知
    loginEventBus.emit('cookie-collected', cookies)
    loginEventBus.emit('login-data-collected', {
      cookies,
      localStorage,
      sessionStorage
    })
    
    console.log('[LoginAssistant] 登录数据收集完成，正在关闭浏览器...')
    
    // 关闭浏览器
    await browser.close()
    
    // 退出electron应用
    const electron = await import('electron')
    electron.app.quit()
    
  } catch (err) {
    console.error('[LoginAssistant] 登录过程出错:', err)
    // 出错时保持浏览器打开，让用户可以手动操作
  }
}

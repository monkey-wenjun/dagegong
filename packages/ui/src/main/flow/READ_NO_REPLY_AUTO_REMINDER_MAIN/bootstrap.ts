import { Browser } from 'puppeteer'
import { initPuppeteer } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
import { pageMapByName } from './index'

import { readStorageFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { setDomainLocalStorage } from '@dagegong/utils/puppeteer/local-storage.mjs'

const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const bossChatUiUrl = `https://www.zhipin.com/web/geek/chat`

export async function bootstrap() {
  const { puppeteer } = await initPuppeteer()

  // 从环境变量读取无头模式配置
  const headlessMode = process.env.DAGEGONG_BROWSER_HEADLESS === '1'
  if (headlessMode) {
    console.log('[Browser] 以无头模式启动浏览器')
  }

  const browser = await puppeteer.launch({
    headless: headlessMode ? 'new' : false,
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--enable-automation'],
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
    ],
    devtools: process.env.NODE_ENV === 'development'
  })

  return browser
}

export async function launchBoss(browser: Browser) {
  const page = (await browser.pages())[0]
  const bossCookies = readStorageFile('boss-cookies.json')
  const bossLocalStorage = readStorageFile('boss-local-storage.json')
  //set cookies
  for (let i = 0; i < bossCookies.length; i++) {
    await page.setCookie(bossCookies[i])
  }
  await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
  try {
    await Promise.all([
      page.goto(bossChatUiUrl, { timeout: 0 }),
      page.waitForNavigation({ timeout: 120 * 1000 })
    ])
  } catch (error) {
    if (error?.message?.startsWith('net::ERR_INTERNET_DISCONNECTED')) {
      throw new Error('ERR_INTERNET_DISCONNECTED')
    }
    throw error
  }
  pageMapByName['boss'] = page
  page.once('close', () => {
    pageMapByName['boss'] = null
    const cp = browser.process()
    cp?.kill()
  })
  return page
}

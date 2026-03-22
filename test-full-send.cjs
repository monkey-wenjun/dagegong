/**
 * 完整发送流程测试
 * 使用真实未读消息数据测试整个发送流程
 */

const puppeteer = require('puppeteer-core')
const sqlite3 = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug', 'full-send-test')
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true })
}

// 获取 Chrome 路径
function getChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('未找到 Chrome 或 Edge')
}

// 读取 Cookie
function getCookies() {
  const cookiePath = path.join(os.homedir(), '.dagegong', 'storage', 'boss-cookies.json')
  return JSON.parse(fs.readFileSync(cookiePath, 'utf8'))
}

// 从数据库获取真实未读消息
function getUnreadBoss() {
  const dbPath = path.join(os.homedir(), '.dagegong', 'storage', 'public.db')
  const db = sqlite3(dbPath)
  const result = db.prepare(`
    SELECT encryptBossId, bossName, lastText, unreadCount
    FROM v_boss_chat_relation 
    WHERE unreadCount > 0
    ORDER BY updateTime DESC
    LIMIT 1
  `).get()
  db.close()
  return result
}

// 主测试函数
async function testFullSend() {
  console.log('========== 完整发送流程测试 ==========\n')
  
  const target = getUnreadBoss()
  if (!target) {
    console.log('❌ 没有未读消息，无法测试')
    return
  }
  
  console.log('[Test] 测试目标:')
  console.log('  BOSS:', target.bossName)
  console.log('  ID:', target.encryptBossId.slice(0, 15) + '...')
  console.log('  消息:', target.lastText)
  console.log('  未读:', target.unreadCount)
  console.log('')
  
  const chromePath = getChromePath()
  const cookies = getCookies()
  
  console.log('[Test] 启动浏览器...')
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    slowMo: 100
  })
  
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    
    // 设置 Cookie
    for (const cookie of cookies) {
      try { await page.setCookie(cookie) } catch (e) {}
    }
    
    // 打开聊天页面
    console.log('[Test] 打开聊天页面...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    await new Promise(r => setTimeout(r, 5000))
    
    // ====== 步骤 1：点击未读标签 ======
    console.log('\n[Test] 步骤 1：点击"未读"标签...')
    try {
      const unreadSelector = '#container > div > div > div.list-warp.v2 > div > div.label-list > ul > li:nth-child(2) > span'
      await page.click(unreadSelector)
      console.log('✅ 已点击未读标签')
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) {
      console.log('❌ 点击未读标签失败:', e.message)
    }
    
    await page.screenshot({ path: path.join(debugDir, '01-after-unread.png') })
    
    // ====== 步骤 2：搜索 BOSS ======
    console.log('\n[Test] 步骤 2：搜索 BOSS...')
    try {
      const searchSelector = '#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input'
      const searchTerm = target.bossName.slice(0, 4) // 用名字前4个字搜索
      
      await page.click(searchSelector)
      await page.type(searchSelector, searchTerm, { delay: 100 })
      console.log('✅ 已输入搜索词:', searchTerm)
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) {
      console.log('❌ 搜索失败:', e.message)
    }
    
    await page.screenshot({ path: path.join(debugDir, '02-after-search.png') })
    
    // ====== 步骤 3：点击搜索结果 ======
    console.log('\n[Test] 步骤 3：点击搜索结果...')
    
    // 查找并点击第一个对话项
    const chatClicked = await page.evaluate(() => {
      const selectors = [
        '.chat-list .chat-item',
        '.friend-list .friend-item',
        '.conversation-item',
        '.chat-user-item',
        '[class*="list"] > [class*="item"]'
      ]
      
      for (const sel of selectors) {
        const items = document.querySelectorAll(sel)
        if (items.length > 0) {
          items[0].click()
          return { clicked: true, selector: sel, count: items.length }
        }
      }
      return { clicked: false }
    })
    
    console.log('点击结果:', chatClicked)
    await new Promise(r => setTimeout(r, 3000))
    await page.screenshot({ path: path.join(debugDir, '03-chat-opened.png') })
    
    // ====== 步骤 4：查找输入框并输入消息 ======
    console.log('\n[Test] 步骤 4：查找输入框...')
    
    const inputInfo = await page.evaluate(() => {
      const selectors = [
        '.chat-conversation .message-controls .chat-input',
        '.chat-input',
        '[contenteditable="true"]',
        '.editor-input',
        'div[role="textbox"]',
        '.message-editor'
      ]
      
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          return { found: true, selector: sel, tagName: el.tagName }
        }
      }
      return { found: false }
    })
    
    console.log('输入框:', inputInfo)
    
    if (inputInfo.found) {
      console.log('[Test] 输入测试消息...')
      await page.click(inputInfo.selector)
      await new Promise(r => setTimeout(r, 500))
      
      // 清空并输入
      await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (el) {
          el.innerHTML = ''
          el.textContent = '您好，请问这个岗位还招人吗？'
        }
      }, inputInfo.selector)
      
      console.log('✅ 已输入消息')
      await new Promise(r => setTimeout(r, 1000))
    }
    
    await page.screenshot({ path: path.join(debugDir, '04-message-typed.png') })
    
    // ====== 步骤 5：查找发送按钮 ======
    console.log('\n[Test] 步骤 5：查找发送按钮...')
    
    const buttonInfo = await page.evaluate(() => {
      const selectors = [
        '.chat-conversation .btn-send:not(.disabled)',
        '.btn-send:not(.disabled)',
        '[class*="send"]:not(.disabled)',
        '.message-controls button'
      ]
      
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el && !el.disabled) {
          return { found: true, selector: sel, text: el.textContent?.trim() }
        }
      }
      return { found: false }
    })
    
    console.log('发送按钮:', buttonInfo)
    
    if (buttonInfo.found) {
      console.log('[Test] 准备点击发送按钮...')
      console.log('⚠️  请在浏览器中确认是否发送，或按 Ctrl+C 取消')
      
      // 等待用户确认（不自动点击）
      await new Promise(r => setTimeout(r, 5000))
      
      // 如需自动发送，取消下面注释：
      // await page.click(buttonInfo.selector)
      // console.log('✅ 已点击发送')
    }
    
    await page.screenshot({ path: path.join(debugDir, '05-ready-to-send.png') })
    
    console.log('\n========== 测试完成 ==========')
    console.log('截图保存在:', debugDir)
    console.log('\n请检查截图确认流程是否正确')
    console.log('按 Ctrl+C 关闭浏览器')
    
    await new Promise(() => {})
    
  } catch (error) {
    console.error('[Test] 测试失败:', error)
    await browser.close()
  }
}

testFullSend().catch(console.error)

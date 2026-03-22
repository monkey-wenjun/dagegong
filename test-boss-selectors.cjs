/**
 * BOSS 直聘选择器测试脚本
 * 测试用户提供的搜索和标签选择器是否有效
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug', 'selector-test')
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
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('未找到 Chrome 或 Edge 浏览器')
}

// 读取 Cookie
function getCookies() {
  const cookiePath = path.join(os.homedir(), '.dagegong', 'storage', 'boss-cookies.json')
  if (!fs.existsSync(cookiePath)) {
    throw new Error('Cookie 文件不存在')
  }
  return JSON.parse(fs.readFileSync(cookiePath, 'utf8'))
}

// 测试选择器
async function testSelectors() {
  console.log('========== BOSS 直聘选择器测试 ==========\n')
  
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
    console.log('[Test] 设置 Cookie...')
    for (const cookie of cookies) {
      try { await page.setCookie(cookie) } catch (e) {}
    }
    
    // 打开聊天页面
    console.log('[Test] 打开 BOSS 直聘聊天页面...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    await new Promise(r => setTimeout(r, 5000))
    
    // 截图 1：初始页面
    await page.screenshot({ path: path.join(debugDir, '01-initial.png'), fullPage: true })
    console.log('[Test] 初始页面截图已保存')
    
    // ====== 测试 1：查找未读标签 ======
    console.log('\n[Test] ====== 测试 1：查找未读标签 ======')
    const unreadLabelInfo = await page.evaluate(() => {
      // 用户提供的选择器
      const selector = '#container > div > div > div.list-warp.v2 > div > div.label-list > ul > li:nth-child(2) > span'
      const el = document.querySelector(selector)
      
      if (el) {
        return {
          found: true,
          selector,
          text: el.textContent?.trim(),
          className: el.className,
          clickable: true
        }
      }
      
      // 备用：查找包含"未读"的元素
      const allElements = document.querySelectorAll('*')
      for (const el of allElements) {
        if (el.textContent?.trim() === '未读') {
          return {
            found: true,
            selector: 'text-search',
            text: el.textContent?.trim(),
            className: el.className,
            tagName: el.tagName
          }
        }
      }
      
      return { found: false }
    })
    
    console.log('[Test] 未读标签查找结果:', JSON.stringify(unreadLabelInfo, null, 2))
    
    // 点击未读标签
    if (unreadLabelInfo.found) {
      console.log('[Test] 点击未读标签...')
      await page.click(unreadLabelInfo.selector)
      await new Promise(r => setTimeout(r, 2000))
      
      await page.screenshot({ path: path.join(debugDir, '02-after-unread-click.png'), fullPage: true })
      console.log('[Test] 点击后截图已保存')
    }
    
    // ====== 测试 2：查找搜索框 ======
    console.log('\n[Test] ====== 测试 2：查找搜索框 ======')
    const searchInputInfo = await page.evaluate(() => {
      // 用户提供的选择器
      const selector = '#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input'
      const el = document.querySelector(selector)
      
      if (el) {
        return {
          found: true,
          selector,
          tagName: el.tagName,
          className: el.className,
          placeholder: el.placeholder,
          type: el.type
        }
      }
      
      // 备用：查找 input
      const inputs = document.querySelectorAll('input')
      for (const input of inputs) {
        if (input.placeholder?.includes('搜索') || input.className?.includes('search')) {
          return {
            found: true,
            selector: 'backup',
            tagName: input.tagName,
            className: input.className,
            placeholder: input.placeholder
          }
        }
      }
      
      return { found: false }
    })
    
    console.log('[Test] 搜索框查找结果:', JSON.stringify(searchInputInfo, null, 2))
    
    // 测试输入搜索词
    if (searchInputInfo.found) {
      console.log('[Test] 在搜索框输入测试内容...')
      await page.click(searchInputInfo.selector)
      await page.type(searchInputInfo.selector, '测试', { delay: 100 })
      await new Promise(r => setTimeout(r, 2000))
      
      await page.screenshot({ path: path.join(debugDir, '03-after-search.png'), fullPage: true })
      console.log('[Test] 搜索后截图已保存')
      
      // 清空搜索框
      await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (el) el.value = ''
      }, searchInputInfo.selector)
    }
    
    // ====== 测试 3：查找对话列表项 ======
    console.log('\n[Test] ====== 测试 3：查找对话列表项 ======')
    const chatListInfo = await page.evaluate(() => {
      const selectors = [
        '.chat-list .chat-item',
        '.friend-list .friend-item',
        '.conversation-list .conversation-item',
        '[class*="list"] [class*="item"]'
      ]
      
      for (const selector of selectors) {
        const items = document.querySelectorAll(selector)
        if (items.length > 0) {
          return {
            found: true,
            selector,
            count: items.length,
            firstItemHTML: items[0].outerHTML?.substring(0, 200)
          }
        }
      }
      
      return { found: false }
    })
    
    console.log('[Test] 对话列表查找结果:', JSON.stringify(chatListInfo, null, 2))
    
    // 尝试点击第一个对话
    if (chatListInfo.found) {
      console.log('[Test] 点击第一个对话...')
      await page.click(`${chatListInfo.selector}:first-child`)
      await new Promise(r => setTimeout(r, 2000))
      
      await page.screenshot({ path: path.join(debugDir, '04-chat-opened.png'), fullPage: true })
      console.log('[Test] 打开对话后截图已保存')
    }
    
    // ====== 测试 4：查找输入框和发送按钮 ======
    console.log('\n[Test] ====== 测试 4：查找输入框和发送按钮 ======')
    const inputButtonInfo = await page.evaluate(() => {
      const result = { input: null, button: null }
      
      // 查找输入框
      const inputSelectors = [
        '.chat-conversation .message-controls .chat-input',
        '.chat-input',
        '[contenteditable="true"]',
        '.editor-input',
        'div[role="textbox"]'
      ]
      
      for (const sel of inputSelectors) {
        const el = document.querySelector(sel)
        if (el) {
          result.input = {
            selector: sel,
            tagName: el.tagName,
            className: el.className?.substring(0, 50)
          }
          break
        }
      }
      
      // 查找发送按钮
      const buttonSelectors = [
        '.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)',
        '.btn-send',
        '[class*="send"]'
      ]
      
      for (const sel of buttonSelectors) {
        const el = document.querySelector(sel)
        if (el && !el.disabled) {
          result.button = {
            selector: sel,
            tagName: el.tagName,
            className: el.className?.substring(0, 50),
            text: el.textContent?.trim()
          }
          break
        }
      }
      
      return result
    })
    
    console.log('[Test] 输入框和按钮查找结果:', JSON.stringify(inputButtonInfo, null, 2))
    
    // 保存测试报告
    const report = {
      timestamp: new Date().toISOString(),
      unreadLabel: unreadLabelInfo,
      searchInput: searchInputInfo,
      chatList: chatListInfo,
      inputButton: inputButtonInfo
    }
    
    fs.writeFileSync(
      path.join(debugDir, 'test-report.json'),
      JSON.stringify(report, null, 2)
    )
    
    console.log('\n========== 测试完成 ==========')
    console.log('截图保存在:', debugDir)
    console.log('\n请查看:')
    console.log('  - 01-initial.png: 初始页面')
    console.log('  - 02-after-unread-click.png: 点击未读后')
    console.log('  - 03-after-search.png: 搜索后')
    console.log('  - 04-chat-opened.png: 打开对话后')
    console.log('  - test-report.json: 详细报告')
    
    // 显示关键结果
    console.log('\n========== 关键发现 ==========')
    if (unreadLabelInfo.found) {
      console.log('✅ 未读标签:', unreadLabelInfo.selector)
    } else {
      console.log('❌ 未找到未读标签')
    }
    
    if (searchInputInfo.found) {
      console.log('✅ 搜索框:', searchInputInfo.selector)
    } else {
      console.log('❌ 未找到搜索框')
    }
    
    if (chatListInfo.found) {
      console.log(`✅ 对话列表: ${chatListInfo.selector} (${chatListInfo.count} 项)`)
    } else {
      console.log('❌ 未找到对话列表')
    }
    
    if (inputButtonInfo.input) {
      console.log('✅ 输入框:', inputButtonInfo.input.selector)
    } else {
      console.log('❌ 未找到输入框')
    }
    
    if (inputButtonInfo.button) {
      console.log('✅ 发送按钮:', inputButtonInfo.button.selector)
    } else {
      console.log('❌ 未找到发送按钮')
    }
    
    console.log('\n按 Ctrl+C 关闭浏览器，或手动关闭窗口')
    await new Promise(() => {})
    
  } catch (error) {
    console.error('[Test] 测试失败:', error)
    await browser.close()
    process.exit(1)
  }
}

testSelectors().catch(console.error)

/**
 * AI 自动回复发送诊断脚本
 * 自动打开浏览器，截图保存页面结构，用于分析选择器
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug', 'diagnose')
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
    if (fs.existsSync(p)) {
      console.log('[Diagnose] 找到浏览器:', p)
      return p
    }
  }
  
  throw new Error('未找到 Chrome 或 Edge 浏览器')
}

// 读取 Cookie
function getCookies() {
  try {
    const cookiePath = path.join(os.homedir(), '.dagegong', 'storage', 'boss-cookies.json')
    if (!fs.existsSync(cookiePath)) {
      throw new Error('Cookie 文件不存在: ' + cookiePath)
    }
    return JSON.parse(fs.readFileSync(cookiePath, 'utf8'))
  } catch (e) {
    throw new Error('读取 Cookie 失败: ' + e.message)
  }
}

// 主诊断函数
async function diagnose() {
  console.log('========== AI 自动回复发送诊断 ==========\n')
  
  const chromePath = getChromePath()
  const cookies = getCookies()
  
  console.log('[Diagnose] Cookie 数量:', cookies.length)
  console.log('[Diagnose] 启动浏览器...')
  
  const browser = await puppeteer.launch({
    headless: false, // 非 headless 模式，你可以看到浏览器
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    slowMo: 50
  })
  
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    
    // 设置 Cookie
    console.log('[Diagnose] 设置 Cookie...')
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie)
      } catch (e) {
        // 忽略无效 cookie
      }
    }
    
    // 打开聊天页面
    console.log('[Diagnose] 打开 BOSS 直聘聊天页面...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    // 等待加载
    console.log('[Diagnose] 等待页面加载...')
    await new Promise(r => setTimeout(r, 5000))
    
    // 截图 1：整体页面
    const screenshot1 = path.join(debugDir, `01-page-overview.png`)
    await page.screenshot({ path: screenshot1, fullPage: true })
    console.log('[Diagnose] 截图已保存:', screenshot1)
    
    // 获取页面 HTML 结构（用于分析）
    const html = await page.content()
    const htmlPath = path.join(debugDir, 'page-html.html')
    fs.writeFileSync(htmlPath, html)
    console.log('[Diagnose] HTML 已保存:', htmlPath)
    
    // 尝试获取对话列表
    console.log('[Diagnose] 尝试获取对话列表...')
    const chatList = await page.evaluate(() => {
      const results = []
      const selectors = [
        '.chat-list .chat-item',
        '.conversation-list .conversation-item',
        '.friend-list .friend-item',
        '[class*="chat"] [class*="item"]'
      ]
      
      for (const selector of selectors) {
        const items = document.querySelectorAll(selector)
        if (items.length > 0) {
          results.push({
            selector,
            count: items.length,
            firstItem: items[0]?.outerHTML?.substring(0, 200)
          })
        }
      }
      
      return results
    })
    
    console.log('[Diagnose] 找到的对话列表:', JSON.stringify(chatList, null, 2))
    
    // 尝试点击第一个对话
    console.log('[Diagnose] 尝试点击第一个对话...')
    await page.evaluate(() => {
      const firstItem = document.querySelector('.chat-list .chat-item, .conversation-list .conversation-item, .friend-list .friend-item')
      if (firstItem) {
        firstItem.click()
        return true
      }
      return false
    })
    
    await new Promise(r => setTimeout(r, 3000))
    
    // 截图 2：打开对话后
    const screenshot2 = path.join(debugDir, `02-chat-opened.png`)
    await page.screenshot({ path: screenshot2, fullPage: true })
    console.log('[Diagnose] 截图已保存:', screenshot2)
    
    // 尝试查找输入框
    console.log('[Diagnose] 尝试查找输入框...')
    const inputInfo = await page.evaluate(() => {
      const selectors = [
        '.chat-conversation .message-controls .chat-input',
        '.chat-input',
        '[contenteditable="true"]',
        '.editor-input',
        'div[role="textbox"]',
        '.message-controls textarea',
        '.chat-editor'
      ]
      
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (el) {
          return {
            found: true,
            selector,
            tagName: el.tagName,
            className: el.className,
            outerHTML: el.outerHTML?.substring(0, 300)
          }
        }
      }
      
      return { found: false }
    })
    
    console.log('[Diagnose] 输入框信息:', JSON.stringify(inputInfo, null, 2))
    
    // 尝试查找发送按钮
    console.log('[Diagnose] 尝试查找发送按钮...')
    const buttonInfo = await page.evaluate(() => {
      const selectors = [
        '.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)',
        '.chat-conversation .btn-send',
        '.btn-send',
        '[class*="send"]',
        '.message-controls button'
      ]
      
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (el && !el.disabled) {
          return {
            found: true,
            selector,
            tagName: el.tagName,
            className: el.className,
            textContent: el.textContent?.trim(),
            outerHTML: el.outerHTML?.substring(0, 300)
          }
        }
      }
      
      // 查找所有按钮
      const allButtons = document.querySelectorAll('button, div[role="button"]')
      const sendButtons = []
      for (const btn of allButtons) {
        const text = btn.textContent?.trim()
        if (text?.includes('发送')) {
          sendButtons.push({
            tagName: btn.tagName,
            className: btn.className,
            text: text,
            disabled: btn.disabled
          })
        }
      }
      
      return { found: false, allSendButtons: sendButtons }
    })
    
    console.log('[Diagnose] 发送按钮信息:', JSON.stringify(buttonInfo, null, 2))
    
    // 保存诊断报告
    const report = {
      timestamp: new Date().toISOString(),
      chatList,
      inputInfo,
      buttonInfo
    }
    
    const reportPath = path.join(debugDir, 'diagnose-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log('[Diagnose] 报告已保存:', reportPath)
    
    console.log('\n========== 诊断完成 ==========')
    console.log('所有截图和报告保存在:', debugDir)
    console.log('\n请查看以下文件:')
    console.log('  1. 01-page-overview.png - 整体页面截图')
    console.log('  2. 02-chat-opened.png - 打开对话后截图')
    console.log('  3. diagnose-report.json - 详细的诊断报告')
    console.log('  4. page-html.html - 页面 HTML 源码')
    console.log('\n按 Ctrl+C 关闭浏览器，或手动关闭窗口')
    
    // 保持浏览器打开，方便用户查看
    await new Promise(() => {})
    
  } catch (error) {
    console.error('[Diagnose] 诊断失败:', error)
    await browser.close()
    process.exit(1)
  }
}

diagnose().catch(console.error)

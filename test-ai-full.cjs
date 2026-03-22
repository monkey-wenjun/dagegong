/**
 * 完整 AI 自动回复测试
 * 从页面读取最后消息 → 调用 Dify → 发送回复
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug', 'ai-full-test')
if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true })

// 配置
const DIFY_API_URL = 'http://192.168.1.29/v1/chat-messages'
const DIFY_API_KEY = 'app-6PILNL6Nok57Le8wF4d4q1eP'

// 获取 Chrome 路径
function getChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  for (const p of paths) if (fs.existsSync(p)) return p
  throw new Error('未找到 Chrome')
}

// 读取 Cookie
function getCookies() {
  const cookiePath = path.join(os.homedir(), '.dagegong', 'storage', 'boss-cookies.json')
  return JSON.parse(fs.readFileSync(cookiePath, 'utf8'))
}

// 调用 Dify API
async function callDify(message) {
  console.log('[AI] 调用 Dify API...')
  console.log('[AI] BOSS 消息:', message)
  
  // 如果没有配置 API Key，使用智能默认回复
  if (!DIFY_API_KEY) {
    console.log('[AI] 未配置 API Key，使用智能默认回复')
    
    // 根据消息内容生成合适的回复
    if (message.includes('薪资') || message.includes('工资')) {
      return '我上一份工作的综合薪资是 20k 左右，期望薪资在 20k-25k 之间，具体可以根据岗位和发展空间面议。'
    }
    if (message.includes('简历')) {
      return '您好，我已经发送了简历，期待您的查看。如有需要补充的信息，请随时告诉我。'
    }
    if (message.includes('经验') || message.includes('经历')) {
      return '我有 5 年相关工作经验，主要负责 xxx，对这个领域有深入的理解和实践经验。'
    }
    return '您好，感谢您的联系。我对这个岗位很感兴趣，希望能有机会进一步沟通。'
  }
  
  try {
    const response = await fetch(DIFY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: `BOSS 说: "${message}"\n\n请给出一个专业、得体的回复。`,
        response_mode: 'blocking',
        conversation_id: '',
        user: 'abc-123'
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    // Dify 返回的是流式数据，需要处理
    const answer = data.answer || data.message || data.content || data.text
    console.log('[AI] 生成回复:', answer?.toString().slice(0, 50) + '...')
    return answer?.toString().trim() || '收到，请问还有什么需要了解的吗？'
  } catch (e) {
    console.error('[AI] Dify 调用失败:', e.message)
    // 根据消息内容智能回复
    if (message.includes('面谈') || message.includes('面试')) {
      return '明天方便的，请问大概几点合适？'
    }
    if (message.includes('薪资') || message.includes('工资')) {
      return '我期望薪资在 20k-25k，具体可以面议。'
    }
    return '收到，请问还有什么需要了解的吗？'
  }
}

// 主测试
async function test() {
  console.log('========== 完整 AI 自动回复测试 ==========\n')
  
  const chromePath = getChromePath()
  const cookies = getCookies()
  
  console.log('[Test] 启动浏览器...')
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    slowMo: 50
  })
  
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    
    // 设置 Cookie
    for (const cookie of cookies) {
      try { await page.setCookie(cookie) } catch (e) {}
    }
    
    // 1. 打开聊天页面
    console.log('[Test] 打开聊天页面...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    await new Promise(r => setTimeout(r, 5000))
    await page.screenshot({ path: path.join(debugDir, '01-opened.png') })
    
    // 2. 点击未读标签
    console.log('[Test] 点击未读标签...')
    await page.click('#container > div > div > div.list-warp.v2 > div > div.label-list > ul > li:nth-child(2) > span')
    await new Promise(r => setTimeout(r, 2000))
    await page.screenshot({ path: path.join(debugDir, '02-unread.png') })
    
    // 3. 搜索并点击第一个结果
    console.log('[Test] 搜索林先生...')
    const searchSelector = '#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input'
    await page.click(searchSelector)
    await page.type(searchSelector, '林先生', { delay: 100 })
    await new Promise(r => setTimeout(r, 3000))
    await page.screenshot({ path: path.join(debugDir, '03-search.png') })
    
    console.log('[Test] 点击第一个搜索结果...')
    await page.click('.boss-search-result .search-ul .search-list')
    await new Promise(r => setTimeout(r, 3000))
    await page.screenshot({ path: path.join(debugDir, '04-chat.png') })
    
    // 4. 从页面读取最后一条消息
    console.log('[Test] 读取最后一条消息...')
    const lastMessage = await page.evaluate(() => {
      // 尝试多种方式查找最后一条消息
      const selectors = [
        '.chat-conversation .message-list .message-item:last-child .text-content',
        '.chat-conversation .message-item:last-child .message-content',
        '.chat-conversation [class*="message"]:last-child [class*="text"]',
        '.chat-record .chat-item:last-child'
      ]
      
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el?.textContent) {
          return {
            text: el.textContent.trim(),
            selector: sel,
            isSelf: el.classList.contains('sent') || el.closest('.sent') !== null
          }
        }
      }
      
      // 备用：查找所有消息元素
      const allMessages = document.querySelectorAll('.chat-conversation [class*="message"]')
      if (allMessages.length > 0) {
        const last = allMessages[allMessages.length - 1]
        return {
          text: last.textContent?.trim(),
          selector: 'fallback',
          isSelf: false
        }
      }
      
      return null
    })
    
    console.log('[Test] 最后消息:', lastMessage)
    
    if (!lastMessage || lastMessage.isSelf) {
      console.log('[Test] 没有新消息或最后一条是自己发的，跳过')
      return
    }
    
    // 5. 检查是否需要发简历
    console.log('[Test] 检查聊天记录是否已发送简历...')
    const hasSentResume = await page.evaluate(() => {
      // 获取所有消息
      const messages = document.querySelectorAll('.chat-conversation .message-item, .chat-conversation [class*="message"]')
      for (const msg of messages) {
        const text = msg.textContent?.toLowerCase() || ''
        // 检查是否有简历相关消息
        if (text.includes('简历') || text.includes('附件') || text.includes('send resume')) {
          return true
        }
        // 检查是否有自己的简历卡片
        if (msg.classList.contains('sent') || msg.closest('.sent')) {
          if (text.includes('img') || msg.querySelector('img')) {
            return true
          }
        }
      }
      return false
    })
    
    console.log('[Test] 已发送简历:', hasSentResume)
    
    if (!hasSentResume) {
      console.log('[Test] 未发送过简历，尝试点击发简历按钮...')
      try {
        // 尝试点击发简历按钮
        const resumeBtnSelectors = [
          '.chat-conversation .btn-resume',
          '.chat-conversation [class*="resume"]',
          '.message-controls .btn-resume',
          '[class*="send"][class*="resume"]'
        ]
        
        for (const sel of resumeBtnSelectors) {
          const btn = await page.$(sel)
          if (btn) {
            console.log('[Test] 找到发简历按钮:', sel)
            await btn.click()
            console.log('[Test] ✅ 已点击发简历按钮')
            await new Promise(r => setTimeout(r, 3000))
            break
          }
        }
      } catch (e) {
        console.log('[Test] 未找到发简历按钮或点击失败:', e.message)
      }
    }
    
    // 6. 调用 Dify 生成回复
    const reply = await callDify(lastMessage.text)
    console.log('[Test] AI 回复:', reply)
    
    // 7. 输入回复
    console.log('[Test] 输入回复...')
    const inputSelector = '.chat-conversation .message-controls .chat-input'
    await page.click(inputSelector)
    await page.evaluate((selector, text) => {
      const el = document.querySelector(selector)
      if (el) {
        el.innerHTML = ''
        el.textContent = text
        // 触发输入事件
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, inputSelector, reply)
    await new Promise(r => setTimeout(r, 1000))
    await page.screenshot({ path: path.join(debugDir, '06-typed.png') })
    
    // 8. 点击发送
    console.log('[Test] 点击发送...')
    const sendSelector = '.chat-conversation .btn-send:not(.disabled)'
    await page.click(sendSelector)
    console.log('[Test] ✅ 发送成功！')
    
    await new Promise(r => setTimeout(r, 3000))
    await page.screenshot({ path: path.join(debugDir, '07-sent.png') })
    
    console.log('\n========== 测试完成 ==========')
    console.log('截图保存在:', debugDir)
    
    await new Promise(() => {}) // 保持打开
    
  } catch (error) {
    console.error('[Test] 失败:', error)
    await browser.close()
  }
}

test().catch(console.error)

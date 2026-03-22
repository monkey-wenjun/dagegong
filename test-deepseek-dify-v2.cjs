/**
 * DeepSeek + Dify 批量回复测试 (v2)
 * 1. 打开聊天页面
 * 2. 点击每个聊天项进入聊天
 * 3. 从 DOM 获取消息内容
 * 4. DeepSeek 总结 + Dify 回复
 * 5. 填入输入框（不发送）
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug', 'deepseek-dify-test')
if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true })

// 读取配置
function loadAppConfig() {
  const configDir = path.join(os.homedir(), '.dagegong', 'config')
  
  const llmPath = path.join(configDir, 'llm.json')
  let llmConfig = null
  if (fs.existsSync(llmPath)) {
    const data = JSON.parse(fs.readFileSync(llmPath, 'utf8'))
    llmConfig = data.find(c => c.enabled) || data[0]
  }
  
  const aiReplyPath = path.join(configDir, 'ai-auto-reply.json')
  let aiReplyConfig = null
  if (fs.existsSync(aiReplyPath)) {
    aiReplyConfig = JSON.parse(fs.readFileSync(aiReplyPath, 'utf8'))
  }
  
  return { llmConfig, aiReplyConfig }
}

// 调用 DeepSeek
async function callDeepSeek(messages, config) {
  const messagesText = messages.map(m => `${m.role}: ${m.content}`).join('\n')
  
  if (!config?.providerCompleteApiUrl || !config?.providerApiSecret) {
    return { summary: '双方沟通中', keyPoints: ['工作机会'], shouldReject: false }
  }
  
  const prompt = `分析以下招聘对话：
${messagesText}

输出JSON：
{
  "shouldReject": false,
  "rejectReason": "",
  "rejectReply": "",
  "summary": "一句话总结",
  "keyPoints": ["要点1"],
  "advantages": ["优势1"]
}
注意：如涉及保险销售岗位，shouldReject设为true并生成婉拒回复。只输出JSON。`

  try {
    const apiUrl = config.providerCompleteApiUrl.endsWith('/v1') 
      ? `${config.providerCompleteApiUrl}/chat/completions`
      : `${config.providerCompleteApiUrl}/v1/chat/completions`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.providerApiSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是专业的对话分析助手。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    })
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || data.message?.content
    
    try {
      const clean = content.replace(/```json\n?|\n?```/g, '').trim()
      return JSON.parse(clean)
    } catch {
      return { summary: content?.slice(0, 100) || '', shouldReject: false }
    }
  } catch (e) {
    return { summary: '分析失败', shouldReject: false }
  }
}

// 调用 Dify
async function callDify(latestMessage, summary, config) {
  if (!config?.apiUrl || !config?.apiKey) {
    return '收到，请问还有什么需要了解的吗？'
  }
  
  try {
    const query = `【对话背景】${summary.summary}\n关键信息：${summary.keyPoints?.join(',')}\n\n【最新消息】BOSS说："${latestMessage}"\n\n请给出专业、得体的回复。`
    
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: 'blocking',
        user: 'deepseek-dify-test'
      })
    })
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const data = await response.json()
    return data.answer?.toString().trim() || '收到，请问还有什么需要了解的吗？'
  } catch (e) {
    return '收到，请问还有什么需要了解的吗？'
  }
}

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 主测试
async function test() {
  console.log('========== DeepSeek + Dify 批量回复测试 ==========\n')
  
  const { llmConfig, aiReplyConfig } = loadAppConfig()
  console.log('DeepSeek:', llmConfig ? '✅' : '❌')
  console.log('Dify:', aiReplyConfig?.enabled ? '✅' : '❌')
  
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: getChromePath(),
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1400,900',
      '--disable-infobars',
    ],
    slowMo: 50
  })
  
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    
    // 反爬设置
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} }
      Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'Chrome PDF Plugin' }] })
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] })
    })
    
    // 设置 Cookie
    const cookies = getCookies()
    for (const cookie of cookies) {
      try {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: 'Lax'
        })
      } catch {}
    }
    
    // 打开聊天页面
    console.log('\n[Test] 打开聊天页面...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    // 检查验证页面
    const currentUrl = page.url()
    console.log('[Test] 当前 URL:', currentUrl)
    
    if (currentUrl.includes('verify-slider')) {
      console.log('⚠️ 需要手动验证，请在浏览器中完成验证...')
      await page.screenshot({ path: path.join(debugDir, 'verify.png') })
      await new Promise(resolve => process.stdin.once('data', resolve))
    }
    
    // 等待聊天列表加载 - 等待 API 响应
    console.log('[Test] 等待聊天列表加载...')
    
    // 等待聊天列表 API 响应
    let chatListLoaded = false
    for (let i = 0; i < 30; i++) {
      await sleep(500)
      const hasChatItems = await page.evaluate(() => {
        // 检查是否有包含聊天名字的元素
        const allText = document.body.innerText
        return allText.includes('杨女士') || allText.includes('梁女士') || 
               document.querySelectorAll('.list-warp .item, .list-warp [class*="item"]').length > 5
      })
      if (hasChatItems) {
        chatListLoaded = true
        console.log(`[Test] 聊天列表已加载，等待了 ${(i + 1) * 0.5} 秒`)
        break
      }
    }
    
    if (!chatListLoaded) {
      console.log('[Test] ⚠️ 聊天列表可能未完全加载，继续尝试...')
    }
    
    await sleep(2000)
    
    // 调试：获取页面结构信息
    const pageInfo = await page.evaluate(() => {
      // 获取所有类名包含 item 的元素
      const itemElements = Array.from(document.querySelectorAll('[class*="item"]')).slice(0, 10)
      const itemSamples = itemElements.map(el => ({
        className: el.className,
        tagName: el.tagName,
        textContent: el.textContent?.slice(0, 50)
      }))
      
      return {
        bodyClass: document.body.className,
        chatListContainers: [
          '.chat-list', '.friend-list', '.list-warp', '.main-wrap', 
          '.left-panel', '.chat-sidebar', '.sidebar'
        ].map(sel => ({ sel, found: !!document.querySelector(sel) })),
        allItemsCount: document.querySelectorAll('[class*="item"]').length,
        itemSamples: itemSamples,
        bodyHTML: document.body.innerHTML.slice(0, 3000)
      }
    })
    fs.writeFileSync(path.join(debugDir, 'page-info.json'), JSON.stringify(pageInfo, null, 2))
    console.log('[Debug] 页面信息已保存到:', path.join(debugDir, 'page-info.json'))
    
    // 获取 .list-warp 内部的 HTML 用于调试
    const listWarpHTML = await page.evaluate(() => {
      const warp = document.querySelector('.list-warp')
      return warp ? warp.innerHTML.slice(0, 3000) : 'not found'
    })
    fs.writeFileSync(path.join(debugDir, 'list-warp.html'), listWarpHTML)
    console.log('[Debug] list-warp HTML 已保存')
    
    // 获取聊天列表 - 尝试多种选择器
    const chatList = await page.evaluate(() => {
      const items = []
      
      // 尝试在 body 中查找所有可能的选择器
      const selectors = [
        '.chat-user-item',           // 可能的聊天用户项
        '.friend-item',              // 朋友项
        '.chat-item',                // 聊天项
        '.user-list .item',          // 用户列表项
        '.list-warp .item',          // list-warp 内的 item
        '.main-wrap .chat-user-item',
        '.chat-sidebar .item',
        '[class*="user-item"]',      // 类名包含 user-item
        '[class*="friend-item"]',    // 类名包含 friend-item
        '.list-warp > div > div',    // list-warp 的直接子元素
      ]
      
      let elements = []
      for (const sel of selectors) {
        elements = document.querySelectorAll(sel)
        if (elements.length > 3) break  // 找到足够多的元素就停止
      }
      
      // 如果没找到，尝试获取所有包含头像的 div
      if (elements.length === 0) {
        elements = document.querySelectorAll('img[src*="avatar"], img[src*="boss"], img[src*="zhipin"]')
        elements = Array.from(elements).map(img => img.closest('div')).filter(Boolean)
      }
      
      elements.forEach((el, index) => {
        // 跳过过滤器和按钮
        const className = el.className || ''
        if (className.includes('filter') || className.includes('label') || className.includes('search')) {
          return
        }
        
        // 获取文本内容
        const text = el.textContent?.trim() || ''
        if (!text || text.length < 3) return
        
        // 分割成行
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && l.length > 0 && l.length < 30)
        
        // 找可能是名字的行（通常是中文名字，2-4个字）
        const name = lines.find(l => /^[\u4e00-\u9fa5]{2,5}$/.test(l) || l.includes('女士') || l.includes('先生'))
        
        if (name) {
          items.push({ 
            index, 
            name, 
            className: className.slice(0, 50),
            textPreview: text.slice(0, 60)
          })
        }
      })
      
      return { itemCount: elements.length, items }
    })
    
    console.log('[Debug] 聊天列表查询结果:', JSON.stringify(chatList, null, 2).slice(0, 800))
    
    // 提取 items 数组
    const chatItems = chatList.items || []
    
    console.log(`[Test] 找到 ${chatItems.length} 个聊天`)
    if (chatItems.length === 0) {
      await page.screenshot({ path: path.join(debugDir, 'no-chat-list.png'), fullPage: true })
      console.log('截图已保存:', path.join(debugDir, 'no-chat-list.png'))
      throw new Error('未找到聊天列表')
    }
    
    // 打印前5个
    console.log('\n前5个聊天:')
    chatItems.slice(0, 5).forEach((c, i) => console.log(`  ${i + 1}. ${c.name}`))
    
    // 处理每个聊天
    const maxChats = Math.min(chatItems.length, 10)
    const needReplyChats = []
    
    for (let i = 0; i < maxChats; i++) {
      const chat = chatItems[i]
      console.log(`\n========== 检查 ${i + 1}/${maxChats}: ${chat.name} ==========`)
      
      try {
        // 点击聊天项
        const chatItems = await page.$$('.chat-list .chat-item, .list-warp .chat-item')
        if (!chatItems[i]) {
          console.log('❌ 找不到聊天项元素')
          continue
        }
        
        await chatItems[i].click()
        console.log('[Test] 已点击聊天项')
        
        // 等待消息加载
        await sleep(3000)
        
        // 获取消息
        const messages = await page.evaluate(() => {
          const msgs = []
          const elements = document.querySelectorAll('.chat-conversation .message-item, .message-list .message-item')
          
          elements.forEach(el => {
            const isMyself = el.classList.contains('item-myself')
            const textEl = el.querySelector('.message-content, .text-content, .content')
            const text = textEl?.textContent?.trim()
            
            if (text) {
              msgs.push({ role: isMyself ? '我' : 'BOSS', content: text })
            }
          })
          
          return msgs
        })
        
        console.log(`[Test] 获取到 ${messages.length} 条消息`)
        
        if (messages.length === 0) {
          console.log('⚠️ 无消息，跳过')
          continue
        }
        
        // 检查最后一条
        const lastMsg = messages[messages.length - 1]
        console.log(`[Test] 最后一条: [${lastMsg.role}] ${lastMsg.content.slice(0, 40)}`)
        
        if (lastMsg.role !== 'BOSS') {
          console.log('[Test] 最后一条是我发的，跳过')
          continue
        }
        
        // 需要回复
        console.log('[Test] ✅ 需要回复')
        needReplyChats.push({ name: chat.name, messages, lastMsg })
        
      } catch (err) {
        console.error('❌ 失败:', err.message)
      }
    }
    
    console.log(`\n========== 找到 ${needReplyChats.length} 个需要回复的聊天 ==========`)
    
    if (needReplyChats.length === 0) {
      console.log('✅ 没有需要回复的聊天')
      await new Promise(() => {})
      return
    }
    
    // 处理需要回复的聊天
    for (let i = 0; i < needReplyChats.length; i++) {
      const chat = needReplyChats[i]
      console.log(`\n========== 处理 ${i + 1}/${needReplyChats.length}: ${chat.name} ==========`)
      
      // DeepSeek 总结
      const historyMsgs = chat.messages.slice(0, -1)
      let summary = { summary: '初次沟通', keyPoints: [], shouldReject: false }
      
      if (historyMsgs.length > 0) {
        summary = await callDeepSeek(historyMsgs, llmConfig)
      }
      
      if (summary.shouldReject) {
        console.log('🚫 婉拒:', summary.rejectReason)
      }
      
      // Dify 生成回复
      const reply = summary.shouldReject 
        ? (summary.rejectReply || '感谢您的联系，但这个岗位与我的职业规划不太匹配。')
        : await callDify(chat.lastMsg.content, summary, aiReplyConfig)
      
      console.log('[Test] 生成回复:', reply.slice(0, 80) + '...')
      
      // 找到对应的聊天项并点击
      const chatItems = await page.$$('.chat-list .chat-item, .list-warp .chat-item')
      for (let j = 0; j < chatItems.length; j++) {
        const name = await chatItems[j].evaluate(el => el.querySelector('.name')?.textContent?.trim())
        if (name === chat.name) {
          await chatItems[j].click()
          await sleep(2000)
          break
        }
      }
      
      // 填入输入框
      const inputSelectors = ['.chat-input', '.message-controls .chat-input', '.chat-conversation .chat-input']
      for (const sel of inputSelectors) {
        const input = await page.$(sel)
        if (input) {
          await input.click()
          await page.evaluate((s, text) => {
            const el = document.querySelector(s)
            if (el) {
              el.innerHTML = ''
              el.textContent = text
              el.dispatchEvent(new Event('input', { bubbles: true }))
            }
          }, sel, reply)
          break
        }
      }
      
      await sleep(1000)
      await page.screenshot({ path: path.join(debugDir, `reply-${i + 1}-${chat.name}.png`) })
      console.log('✅ 截图已保存')
      
      if (i < needReplyChats.length - 1) {
        await sleep(3000)
      }
    }
    
    console.log('\n========== 全部完成 ==========')
    console.log('截图保存在:', debugDir)
    
    await new Promise(() => {})
    
  } catch (error) {
    console.error('[Test] 错误:', error)
    await browser.close()
  }
}

test().catch(console.error)

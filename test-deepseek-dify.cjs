/**
 * DeepSeek + Dify 批量回复测试
 * 1. 通过 API 获取所有聊天列表 (zprelation/friend/geekFilterByLabel)
 * 2. 筛选最后一条是 BOSS 发的对话
 * 3. 逐个打开，通过 API 获取历史消息 (zpchat/geek/historyMsg)
 * 4. DeepSeek 总结历史会话
 * 5. 结合最新会话让 Dify 回答
 * 6. 填入输入框（不发送）
 */

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug', 'deepseek-dify-test')
if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true })

// 读取应用配置
function loadAppConfig() {
  const configDir = path.join(os.homedir(), '.dagegong', 'config')
  
  const llmPath = path.join(configDir, 'llm.json')
  let llmConfig = null
  if (fs.existsSync(llmPath)) {
    const data = JSON.parse(fs.readFileSync(llmPath, 'utf8'))
    llmConfig = data.find(c => c.enabled) || data[0]
    console.log('[Config] 加载 llm.json:', llmConfig?.model || '未配置')
  }
  
  const aiReplyPath = path.join(configDir, 'ai-auto-reply.json')
  let aiReplyConfig = null
  if (fs.existsSync(aiReplyPath)) {
    aiReplyConfig = JSON.parse(fs.readFileSync(aiReplyPath, 'utf8'))
    console.log('[Config] 加载 ai-auto-reply.json:', aiReplyConfig?.enabled ? '已启用' : '未启用')
  }
  
  return { llmConfig, aiReplyConfig }
}

// 调用 DeepSeek API
async function callDeepSeek(messages, config) {
  console.log('\n[DeepSeek] 调用 DeepSeek 总结对话...')
  console.log('[DeepSeek] 对话轮数:', messages.length)
  
  if (!config || !config.providerCompleteApiUrl || !config.providerApiSecret) {
    console.log('[DeepSeek] 未配置 DeepSeek，使用简单总结')
    return {
      summary: '双方正在沟通工作机会，BOSS 询问了候选人的情况。',
      keyPoints: ['工作机会沟通中']
    }
  }
  
  try {
    const messagesText = messages.map(m => `${m.role}: ${m.content}`).join('\n')
    
    const prompt = `请分析以下招聘对话记录，并提取关键信息。

【对话记录】
${messagesText}

【分析任务】
1. 首先检查对话内容是否涉及"保险销售"相关岗位（如：保险代理人、保险销售、销售代表、业务经理等保险行业销售性质岗位）
2. 如果涉及保险销售岗位，设置 shouldReject 为 true，并生成婉拒回复
3. 如果不涉及保险销售，正常总结对话

【输出格式】
必须输出以下 JSON 格式：
{
  "shouldReject": false/true,
  "rejectReason": "如果 shouldReject 为 true，填写原因，如'保险销售岗位'",
  "rejectReply": "如果 shouldReject 为 true，生成一段委婉拒绝的回复（礼貌表示不感兴趣）",
  "summary": "一句话总结对话状态",
  "keyPoints": ["关键信息点1", "关键信息点2", "关键信息点3"],
  "advantages": ["候选人应该强调的优势1", "优势2"]
}

注意：
- 只有确定是保险销售岗位时才设置 shouldReject: true
- 婉拒回复要礼貌、简洁，不要伤害对方
- 如果不涉及保险销售，shouldReject 为 false，reject 相关字段可为空
- 只输出 JSON，不要其他内容`

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
          { role: 'system', content: '你是一个专业的对话分析助手。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || data.message?.content || data.answer
    
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim()
      const result = JSON.parse(cleanContent)
      
      if (result.shouldReject) {
        console.log('[DeepSeek] ⚠️ 检测到需要拒绝的岗位:', result.rejectReason)
      } else {
        console.log('[DeepSeek] 总结结果:', result.summary)
      }
      
      return result
    } catch {
      return { summary: content.slice(0, 200), keyPoints: [], advantages: [], shouldReject: false }
    }
  } catch (e) {
    console.error('[DeepSeek] 调用失败:', e.message)
    return {
      summary: '对话总结获取失败',
      keyPoints: [],
      advantages: []
    }
  }
}

// 调用 Dify API
async function callDifyWithContext(latestMessage, deepSeekSummary, difyConfig) {
  console.log('\n[Dify] 调用 Dify 生成回复...')
  
  if (!difyConfig?.apiUrl || !difyConfig?.apiKey) {
    console.log('[Dify] 未配置 Dify，使用默认回复')
    return '收到，请问还有什么需要了解的吗？'
  }
  
  try {
    const query = `【对话背景】
${deepSeekSummary.summary}

关键信息：
${deepSeekSummary.keyPoints?.map(p => `- ${p}`).join('\n') || '无'}

【最新消息】
BOSS 说："${latestMessage}"

请基于以上背景，给出一个专业、得体且针对性的回复。回复要：
1. 体现对岗位的了解和兴趣
2. 回应 BOSS 的具体问题
3. 展示匹配的优势
4. 保持礼貌和专业`

    const response = await fetch(difyConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${difyConfig.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: 'blocking',
        conversation_id: '',
        user: 'deepseek-dify-test'
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    const answer = data.answer || data.message || data.content
    console.log('[Dify] 生成回复:', answer?.toString().slice(0, 100) + '...')
    return answer?.toString().trim() || '收到，请问还有什么需要了解的吗？'
  } catch (e) {
    console.error('[Dify] 调用失败:', e.message)
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

// 等待函数
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 主测试
async function test() {
  console.log('========== DeepSeek + Dify 批量回复测试 ==========\n')
  
  const { llmConfig, aiReplyConfig } = loadAppConfig()
  console.log('\n配置状态:')
  console.log('  DeepSeek (llm.json):', llmConfig ? '✅ 已配置' : '❌ 未配置')
  console.log('  Dify (ai-auto-reply.json):', aiReplyConfig?.enabled ? '✅ 已启用' : '❌ 未启用')
  
  const chromePath = getChromePath()
  const cookies = getCookies()
  
  console.log('\n[Test] 启动浏览器...')
  
  // 启动浏览器 - 使用反爬参数
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
      '--window-size=1400,900',
      '--disable-infobars',
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
      '--password-store=basic',
      '--use-mock-keychain'
    ],
    slowMo: 50
  })
  
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 900 })
    
    // ===== 反爬设置 =====
    // 设置反爬 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.36')
    
    // 覆盖 navigator.webdriver 等自动化标志
    await page.evaluateOnNewDocument(() => {
      // 删除 webdriver 标志
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      
      // 模拟 chrome 对象
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {}
      }
      
      // 覆盖 permissions API
      const originalQuery = window.navigator.permissions.query
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' 
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      )
      
      // 模拟 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: 'Native Client module' }
        ]
      })
      
      // 设置语言
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] })
      
      // 覆盖 notification permission
      const originalNotification = window.Notification
      Object.defineProperty(window, 'Notification', {
        get: function() {
          if (arguments.callee && arguments.callee.caller && 
              arguments.callee.caller.toString().includes('webdriver')) {
            return undefined
          }
          return originalNotification
        }
      })
      
      // 覆盖 console.debug (某些检测会用到)
      const originalDebug = console.debug
      console.debug = function() {
        if (arguments[0] && arguments[0].includes && arguments[0].includes('webdriver')) {
          return
        }
        return originalDebug.apply(this, arguments)
      }
    })
    
    // 设置 Cookie
    console.log('[Test] 设置 Cookie...')
    for (const cookie of cookies) {
      try {
        // 只设置必要的字段
        const cookieData = {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: 'Lax'
        }
        await page.setCookie(cookieData)
      } catch (e) {
        // 忽略无效 cookie
      }
    }
    
    // 设置 API 拦截 - 在导航前设置
    console.log('[Test] 设置 API 拦截...')
    
    let chatListData = null
    let historyMsgData = null
    let chatListResolve = null
    let historyMsgResolve = null
    
    const chatListPromise = new Promise(resolve => { chatListResolve = resolve })
    const historyMsgPromise = new Promise(resolve => { historyMsgResolve = resolve })
    
    // 存储所有拦截到的聊天列表数据，取第一个非空的
    const chatListResults = []
    
    await page.setRequestInterception(true)
    
    page.on('request', request => {
      request.continue()
    })
    
    page.on('response', async response => {
      const url = response.url()
      
      // 拦截聊天列表 API: zprelation/friend/geekFilterByLabel
      if (url.includes('zprelation/friend/geekFilterByLabel')) {
        console.log('\n[API] ✅ 拦截到聊天列表:', url)
        
        // 打印请求信息
        const request = response.request()
        console.log('[API] 请求方法:', request.method())
        console.log('[API] URL 参数:', url.split('?')[1] || '无')
        
        try {
          const data = await response.json()
          console.log('[API] 响应状态:', response.status(), 'code:', data?.code)
          
          if (data?.zpData?.friendList && data.zpData.friendList.length > 0) {
            chatListResults.push(data.zpData)
            console.log(`[API] friendList 长度: ${data.zpData.friendList.length}`)
            
            // 第一个有数据的响应就作为最终结果
            if (!chatListData) {
              chatListData = data.zpData
              console.log('[API] 设置 chatListData，第一条:', JSON.stringify(data.zpData.friendList[0], null, 2).slice(0, 600))
              chatListResolve && chatListResolve(data)
            }
          } else {
            console.log('[API] friendList 为空或无数据')
          }
        } catch (e) {
          console.log('[API] 解析失败:', e.message)
        }
      }
      
      // 拦截历史消息 API: zpchat/geek/historyMsg
      if (url.includes('zpchat/geek/historyMsg') || url.includes('historyMsg')) {
        console.log('\n[API] ✅ 拦截到历史消息:', url)
        try {
          const data = await response.json()
          console.log('[API] 历史消息响应 code:', data?.code)
          if (data?.zpData?.messageList) {
            historyMsgData = data.zpData.messageList
            console.log(`[API] 历史消息条数: ${historyMsgData.length}`)
            historyMsgResolve && historyMsgResolve(data)
          } else {
            console.log('[API] 历史消息响应结构:', Object.keys(data?.zpData || {}))
          }
        } catch (e) {
          console.log('[API] 历史消息解析失败:', e.message)
        }
      }
      
      // 调试：打印所有 wapi 请求
      if (url.includes('wapi')) {
        console.log('[API-Debug] wapi 请求:', url.split('/').pop())
      }
    })
    
    // 打开聊天页面
    console.log('[Test] 打开聊天页面...')
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    // 检查是否被重定向到验证页面
    const currentUrl = page.url()
    console.log('[Test] 当前页面 URL:', currentUrl)
    
    if (currentUrl.includes('verify-slider') || currentUrl.includes('user/safe')) {
      console.log('⚠️ 检测到滑块验证，需要手动验证或更新 Cookie')
      await page.screenshot({ path: path.join(debugDir, 'verify-slider.png') })
      console.log('截图已保存:', path.join(debugDir, 'verify-slider.png'))
      console.log('请在浏览器中完成验证，然后按 Enter 继续...')
      
      // 等待用户验证
      await new Promise(resolve => {
        process.stdin.once('data', () => resolve())
      })
      
      // 验证后保存新 cookie
      const newCookies = await page.cookies()
      fs.writeFileSync(
        path.join(os.homedir(), '.dagegong', 'storage', 'boss-cookies.json'),
        JSON.stringify(newCookies, null, 2)
      )
      console.log('[Test] 新 Cookie 已保存')
    }
    
    // 等待聊天列表 API 响应
    console.log('[Test] 等待聊天列表 API 响应 (最多15秒)...')
    try {
      await Promise.race([
        chatListPromise,
        sleep(15000)
      ])
    } catch (e) {
      console.log('[Test] 等待超时:', e.message)
    }
    
    // 处理聊天列表
    let chatList = []
    
    if (chatListData) {
      // 从 zpData.friendList 获取聊天列表
      const friendsList = chatListData.friendList || []
      
      console.log(`[Test] 从 API 获取到 ${friendsList.length} 个聊天`)
      
      if (friendsList.length > 0) {
        console.log('[Test] 第一条数据示例:', JSON.stringify(friendsList[0], null, 2).slice(0, 800))
      }
      
      chatList = friendsList.map((item, index) => {
        // friendList 中的结构 - 注意字段名是 encryptFriendId 不是 encryptBossId
        const encryptFriendId = item.encryptFriendId
        const bossName = item.name || '未知'
        const jobName = item.jobName || ''
        const brandName = item.brandName || ''
        
        // API 返回的数据中没有 lastMsg 和 lastIsSelf
        // 这些需要从历史消息 API 获取
        // 这里先标记为 undefined，后面通过历史消息 API 判断
        
        return {
          index,
          bossName,
          jobName,
          brandName,
          encryptFriendId,  // 注意：这是 friendId 不是 bossId
          encryptBossId: encryptFriendId, // 别名，兼容后面的代码
          lastMsg: '',
          unreadCount: 0,
          isSelfLast: undefined, // 未知，需要通过历史消息 API 判断
          rawData: item
        }
      }).filter(chat => chat.encryptFriendId)
    } else {
      console.log('[Test] ⚠️ 未获取到聊天列表 API 数据')
      console.log('[Test] 尝试从 DOM 获取...')
      
      // DOM 解析作为降级
      chatList = await page.evaluate(() => {
        const items = []
        const selectors = ['.chat-list .chat-item', '.list-warp .chat-item', '.main-wrap .chat-user-item']
        
        let elements = []
        for (const sel of selectors) {
          elements = document.querySelectorAll(sel)
          if (elements.length > 0) break
        }
        
        elements.forEach((el, index) => {
          const nameEl = el.querySelector('.name, .user-name, .boss-name')
          const bossName = nameEl?.textContent?.trim() || `未知${index}`
          
          const lastMsgEl = el.querySelector('.last-msg, .message, .preview')
          const lastMsg = lastMsgEl?.textContent?.trim() || ''
          
          const isSelfLast = lastMsg.includes('已读') || lastMsg.includes('我:') || el.classList.contains('self-last')
          
          items.push({
            index,
            bossName,
            jobName: '',
            lastMsg: lastMsg.replace('已读', '').replace('我:', '').trim(),
            unreadCount: 0,
            isSelfLast
          })
        })
        
        return items
      })
    }
    
    console.log(`[Test] 最终获取到 ${chatList.length} 个有效聊天`)
    
    console.log(`\n[Test] 共获取 ${chatList.length} 个聊天，需要通过历史消息判断最后一条是谁发的`)
    
    // 打印前5个聊天
    console.log('\n========== 前5个聊天 ==========')
    chatList.slice(0, 5).forEach((chat, i) => {
      console.log(`${i + 1}. ${chat.bossName} @ ${chat.brandName}`)
      console.log(`   职位: ${chat.jobName}`)
      console.log(`   Friend ID: ${chat.encryptFriendId?.slice(0, 30)}...`)
    })
    console.log('===============================\n')
    
    // 逐个处理所有聊天，通过历史消息判断是否需要回复
    const needReplyChats = []
    const maxChatsToCheck = 20 // 最多检查前20个
    
    for (let i = 0; i < Math.min(chatList.length, maxChatsToCheck); i++) {
      const chat = chatList[i]
      console.log(`\n========== 检查第 ${i + 1}/${Math.min(chatList.length, maxChatsToCheck)} 个: ${chat.bossName} ==========`)
      
      try {
        // 重置历史消息
        historyMsgData = null
        historyMsgResolve = null
        const currentHistoryPromise = new Promise(resolve => { historyMsgResolve = resolve })
        
        // 导航到具体聊天 - 使用 encryptFriendId
        const url = `https://www.zhipin.com/web/geek/chat?bossId=${chat.encryptFriendId}`
        console.log(`[Test] 导航到: ${url}`)
        await page.goto(url, { waitUntil: 'networkidle2' })
        
        // 等待历史消息 API 或 DOM 加载
        console.log('[Test] 等待历史消息加载...')
        try {
          await Promise.race([currentHistoryPromise, sleep(8000)])
        } catch (e) {
          console.log('[Test] API 等待超时')
        }
        
        await sleep(3000)
        
        // 获取对话记录 - 优先使用 API 数据，否则使用 DOM
        let messages = []
        
        if (historyMsgData && historyMsgData.length > 0) {
          console.log('[Test] 使用 API 数据')
          messages = historyMsgData.map(msg => {
            // from: 0 = 我(Geek), 1 = BOSS
            const isFromBoss = msg.from === 1 || msg.from === '1'
            return {
              role: isFromBoss ? 'BOSS' : '我',
              content: msg.body?.text || msg.content || msg.pushText || '',
              timeText: msg.createTime || ''
            }
          }).filter(m => m.content)
        } else {
          // DOM 降级方案
          console.log('[Test] API 无数据，尝试从 DOM 获取...')
          messages = await page.evaluate(() => {
            const msgs = []
            // 尝试多种选择器
            const selectors = [
              '.chat-message-list .message-item',
              '.chat-conversation .message-item',
              '.message-list .message-item',
              '.chat-content .message'
            ]
            
            let elements = []
            for (const sel of selectors) {
              elements = document.querySelectorAll(sel)
              if (elements.length > 0) {
                console.log('[DOM] 找到消息元素，选择器:', sel, '数量:', elements.length)
                break
              }
            }
            
            elements.forEach(el => {
              // 判断是否是我发的消息
              const isMyself = el.classList.contains('item-myself') || 
                               el.classList.contains('my-message') ||
                               el.classList.contains('self') ||
                               el.querySelector('.avatar-myself') !== null
              
              // 获取消息内容
              const contentSelectors = [
                '.message-content .text',
                '.message-content',
                '.text-content',
                '.content',
                '.text'
              ]
              
              let text = ''
              for (const sel of contentSelectors) {
                const contentEl = el.querySelector(sel)
                if (contentEl) {
                  text = contentEl.textContent?.trim()
                  if (text) break
                }
              }
              
              if (text) {
                msgs.push({ 
                  role: isMyself ? '我' : 'BOSS', 
                  content: text 
                })
              }
            })
            
            return msgs
          })
          
          if (messages.length === 0) {
            // 打印 DOM 调试信息
            const debugInfo = await page.evaluate(() => {
              return {
                html: document.querySelector('.chat-conversation, .chat-message-list, .message-list')?.innerHTML?.slice(0, 500),
                selectors: [
                  '.chat-message-list .message-item',
                  '.chat-conversation .message-item', 
                  '.message-list .message-item'
                ].map(s => ({ sel: s, count: document.querySelectorAll(s).length }))
              }
            })
            console.log('[Test] DOM 调试:', JSON.stringify(debugInfo, null, 2))
          }
        }
        
        console.log(`[Test] 最终获取到 ${messages.length} 条消息`)
        
        if (messages.length === 0) {
          console.log('⚠️ 未获取到消息，跳过')
          continue
        }
        
        // 检查最后一条
        const latestMessage = messages[messages.length - 1]
        console.log(`[Test] 最后一条消息: [${latestMessage.role}] ${latestMessage.content.slice(0, 50)}`)
        
        if (latestMessage.role !== 'BOSS') {
          console.log(`[Test] 最后一条是我发的，跳过`)
          continue
        }
        
        // 是需要回复的聊天
        console.log(`[Test] ✅ 需要回复，加入处理列表`)
        needReplyChats.push({ ...chat, messages, latestMessage })
        
      } catch (err) {
        console.error(`❌ 检查 ${chat.bossName} 失败:`, err.message)
        continue
      }
    }
    
    // 开始处理需要回复的聊天
    console.log(`\n========== 共找到 ${needReplyChats.length} 个需要回复的聊天 ==========`)
    
    if (needReplyChats.length === 0) {
      console.log('✅ 没有需要回复的聊天')
      await new Promise(() => {})
      return
    }
    
    // 打印列表
    console.log('\n需要回复的聊天列表:')
    needReplyChats.forEach((chat, i) => {
      console.log(`${i + 1}. ${chat.bossName} @ ${chat.brandName}`)
      console.log(`   最后消息: ${chat.latestMessage.content.slice(0, 50)}${chat.latestMessage.content.length > 50 ? '...' : ''}`)
    })
    console.log('========================================\n')
    
    // 逐个处理
    for (let i = 0; i < needReplyChats.length; i++) {
      const chat = needReplyChats[i]
      console.log(`\n========== 处理第 ${i + 1}/${needReplyChats.length} 个: ${chat.bossName} ==========`)
      
      try {
        // 重新导航到聊天页面
        const url = `https://www.zhipin.com/web/geek/chat?bossId=${chat.encryptFriendId}`
        await page.goto(url, { waitUntil: 'networkidle2' })
        await sleep(2000)
        
        const messages = chat.messages
        const latestMessage = chat.latestMessage
        
        // DeepSeek 总结 & Dify 回复...
        const historyMessages = messages.slice(0, -1)
        
        console.log('\n[Test] 调用 DeepSeek 总结...')
        let deepSeekResult = { summary: '', keyPoints: [], advantages: [], shouldReject: false }
        if (historyMessages.length > 0) {
          deepSeekResult = await callDeepSeek(historyMessages, llmConfig)
        } else {
          deepSeekResult = {
            summary: '这是对话的开始，BOSS 主动发起沟通。',
            keyPoints: ['初次沟通'],
            advantages: [],
            shouldReject: false
          }
        }
        
        // 生成回复
        let reply
        if (deepSeekResult.shouldReject) {
          console.log('\n🚫 检测到需要婉拒:', deepSeekResult.rejectReason)
          reply = deepSeekResult.rejectReply || '感谢您的联系，但这个岗位与我的职业规划不太匹配，祝您早日找到合适的候选人。'
        } else {
          console.log('\n[Test] 调用 Dify 生成回复...')
          reply = await callDifyWithContext(latestMessage.content, deepSeekResult, aiReplyConfig)
        }
        
        // 填入输入框
        console.log('\n[Test] 将回复填入输入框...')
        console.log('回复:', reply.slice(0, 100) + (reply.length > 100 ? '...' : ''))
        
        const inputSelector = '.chat-conversation .message-controls .chat-input'
        await page.click(inputSelector)
        await page.evaluate((sel, text) => {
          const el = document.querySelector(sel)
          if (el) {
            el.innerHTML = ''
            el.textContent = text
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }, inputSelector, reply)
        
        await sleep(1000)
        await page.screenshot({ path: path.join(debugDir, `reply-${i + 1}-${chat.bossName}.png`) })
        
        console.log(`✅ 第 ${i + 1} 个处理完成`)
        
        if (i < needReplyChats.length - 1) {
          console.log('\n[Test] 等待 5 秒后处理下一个...')
          await sleep(5000)
        }
        
      } catch (err) {
        console.error(`❌ 处理 ${chat.bossName} 失败:`, err.message)
        continue
      }
    }
    
    console.log('\n========== 所有聊天处理完成 ==========')
    console.log('截图保存在:', debugDir)
    
    await new Promise(() => {})
    
  } catch (error) {
    console.error('[Test] 失败:', error)
    await browser.close()
  }
}

test().catch(console.error)

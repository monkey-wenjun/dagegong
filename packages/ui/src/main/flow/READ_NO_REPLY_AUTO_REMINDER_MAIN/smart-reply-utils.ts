import { Page } from 'puppeteer'
import { sleepWithRandomDelay } from '@dagegong/utils/sleep.mjs'
import { completes } from '@dagegong/utils/gpt-request.mjs'
import { recordGptCompletionRequest, RequestSceneEnum } from '../../features/llm-request-log'
import {
  readConfigFile,
  readStorageFile,
  writeStorageFile
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { formatResumeJsonToMarkdown } from '../../../common/utils/resume'
import { SINGLE_ITEM_DEFAULT_SERVE_WEIGHT } from '../../../common/constant'
import { LlmModelUsageRecord } from '@dagegong/sqlite-plugin/dist/entity/LlmModelUsageRecord.js'
import gtag from '../../utils/gtag'

const RESUME_PLACEHOLDER = `__REPLACE_REAL_RESUME_HERE__`

// 智能回复BOSS消息的默认提示词模板
export const smartReplyDefaultTemplate = `**角色设定：**
你是一位正在求职的候选人，需要根据简历内容和BOSS的消息生成自然、得体的回复。

**简历信息：**
\`\`\`markdown
${RESUME_PLACEHOLDER}
\`\`\`

**回复原则：**
1. 语气谦逊礼貌，符合职场礼仪
2. 基于简历中的真实经历回答，不编造信息
3. 如果BOSS询问简历中没有的信息（如具体薪资期望、到岗时间），给出合理的模糊回答或询问对方意向
4. 控制字数在30-80字，简洁明了
5. 避免过度热情的感叹号和表情符号
6. 针对不同场景：
   - 面试邀请：表达感谢并确认时间
   - 薪资询问：给出合理范围或询问对方预算
   - 技术问题：基于简历中的技术栈简要回答
   - 到岗时间：根据实际情况说明
   - 常规聊天：礼貌回应，保持积极态度

**质量控制：**
- 不要透露当前薪资具体数字
- 不要表现出过于急切的求职态度
- 不要编造项目经验或技能
- 如果无法回答，可回复"这方面我们可以详细聊聊"或"请问您方便电话沟通吗"

**输出格式：**
请仅输出回复内容，以JSON格式返回，不要包含任何解释；数据结构参考：\`{"response": "这里是回复内容"}\``

const SMART_REPLY_TEMPLATE_FILE = 'smart-reply-boss-template.md'

// 获取或创建智能回复模板
export const getSmartReplyTemplate = async () => {
  let template = await readStorageFile(SMART_REPLY_TEMPLATE_FILE, { isJson: false })
  if (!template) {
    await writeStorageFile(SMART_REPLY_TEMPLATE_FILE, smartReplyDefaultTemplate, { isJson: false })
    template = smartReplyDefaultTemplate
  }
  if (!template.includes(RESUME_PLACEHOLDER)) {
    const e = new Error(`简历内容占位符字符串不存在。占位字符串是 ${RESUME_PLACEHOLDER}`)
    e.name = `RESUME_PLACEHOLDER_NOT_EXIST`
    throw e
  }
  return template
}

// 从LLM配置列表中随机选择一个
const pickLlmConfigFromList = (llmConfigList, blockModelSet) => {
  if (llmConfigList.length === 1) {
    llmConfigList[0].enabled = true
    llmConfigList[0].serveWeight = SINGLE_ITEM_DEFAULT_SERVE_WEIGHT
  }
  llmConfigList = llmConfigList.filter((it) => it.enabled && !blockModelSet.has(it.id))
  if (!llmConfigList.length) {
    return null
  }
  llmConfigList.forEach((conf) => {
    if (!Number(conf.serveWeight) || conf.serveWeight < 1) {
      conf.serveWeight = 1
    }
    if (conf.serveWeight > 100) {
      conf.serveWeight = 100
    }
  })
  const pool = []
  for (let i = 0; i < llmConfigList.length; i++) {
    for (let j = 0; j < Math.floor(llmConfigList[i].serveWeight); j++) {
      pool.push(llmConfigList[i].id)
    }
  }
  if (!pool.length) {
    return null
  }
  const index = Math.floor(pool.length * Math.random())
  return llmConfigList.find((it) => it.id === pool[index]) ?? null
}

// 生成智能回复
export const generateSmartReply = async (
  bossMessage: string,
  chatHistory: Array<{ role: 'boss' | 'me'; content: string }>,
  options: {
    requestScene?: RequestSceneEnum
    llmConfigIdForPick?: string[]
  } = {}
) => {
  const systemMessageTemplate = await getSmartReplyTemplate()
  const resumeObject = (await readConfigFile('resumes.json'))?.[0]
  const resumeContent = formatResumeJsonToMarkdown(resumeObject)
  
  // 构建对话历史
  const chatList = [
    {
      role: 'system',
      content: systemMessageTemplate.replace(RESUME_PLACEHOLDER, resumeContent)
    }
  ]
  
  // 添加历史对话上下文（最近5条）
  const recentHistory = chatHistory.slice(-5)
  for (const msg of recentHistory) {
    chatList.push({
      role: msg.role === 'boss' ? 'user' : 'assistant',
      content: msg.content
    })
  }
  
  // 添加当前BOSS消息
  chatList.push({
    role: 'user',
    content: `BOSS最新消息：${bossMessage}\n\n请根据简历内容生成得体回复。`
  })
  
  console.log('[SmartReply] Generating reply for:', bossMessage.substring(0, 50))
  
  let res, llmConfig
  const llmRequestRecord = {}
  const blockModelSet = new Set()
  
  while (!res) {
    let llmConfigList = await readConfigFile('llm.json')
    if (options.llmConfigIdForPick?.length) {
      llmConfigList = llmConfigList.filter((it) => {
        return options.llmConfigIdForPick.includes(it.id)
      })
    }
    llmConfig = pickLlmConfigFromList(llmConfigList, blockModelSet)
    if (!llmConfig) {
      throw new Error(`CANNOT_FIND_A_USABLE_MODEL`)
    }
    
    Object.assign(llmRequestRecord, {
      providerCompleteApiUrl: llmConfig.providerCompleteApiUrl,
      model: llmConfig.model,
      providerApiSecret: llmConfig.providerApiSecret,
      requestStartTime: new Date(),
      hasError: false,
      errorMessage: '',
      requestScene: options.requestScene || RequestSceneEnum.smart_reply
    })
    
    try {
      res = await completes(chatList, {
        providerCompleteApiUrl: llmConfig.providerCompleteApiUrl,
        model: llmConfig.model,
        providerApiSecret: llmConfig.providerApiSecret
      })
      
      // 解析JSON响应
      let replyContent = ''
      try {
        const parsed = JSON.parse(res)
        replyContent = parsed.response || parsed.content || res
      } catch {
        // 如果不是JSON格式，直接使用返回内容
        replyContent = res
      }
      
      console.log('[SmartReply] Generated reply:', replyContent)
      
      return {
        reply: replyContent,
        model: llmConfig.model,
        provider: llmConfig.providerCompleteApiUrl
      }
      
    } catch (error) {
      console.error('[SmartReply] LLM request failed:', error)
      blockModelSet.add(llmConfig.id)
      llmRequestRecord.hasError = true
      llmRequestRecord.errorMessage = String(error?.message || error)
    }
  }
}

// 发送消息给BOSS
export const sendMessageToBoss = async (page: Page, message: string) => {
  try {
    // 找到输入框
    const inputBox = await page.$('.chat-conversation .chat-input .input-box')
    if (!inputBox) {
      throw new Error('找不到消息输入框')
    }
    
    // 聚焦并输入消息
    await inputBox.click()
    await sleepWithRandomDelay(300)
    await inputBox.type(message, { delay: 50 })
    await sleepWithRandomDelay(500)
    
    // 点击发送按钮
    const sendButton = await page.$('.chat-conversation .chat-input .btn-send')
    if (sendButton) {
      await sendButton.click()
      console.log('[SmartReply] Message sent:', message.substring(0, 30))
      return true
    }
    
    // 如果没有发送按钮，尝试按回车
    await inputBox.press('Enter')
    console.log('[SmartReply] Message sent (Enter key):', message.substring(0, 30))
    return true
    
  } catch (error) {
    console.error('[SmartReply] Failed to send message:', error)
    return false
  }
}

// 获取对话列表中的最新消息
export const getLatestBossMessage = async (page: Page) => {
  try {
    // 通过页面Vue数据获取消息列表
    const messages = await page.evaluate(() => {
      const chatContainer = document.querySelector('.chat-conversation .message-list')
      const vueData = (chatContainer as any)?.__vue__
      return vueData?.messageList || []
    })
    
    if (!messages.length) return null
    
    // 找到最后一条BOSS消息
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      // 判断是否是BOSS发送的消息（通常通过消息类型或发送者标识）
      if (msg.from?.encryptBossId || msg.from?.isBoss || msg.type === 'boss') {
        return {
          content: msg.body?.content || msg.content,
          timestamp: msg.time,
          sender: 'boss'
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('[SmartReply] Failed to get messages:', error)
    return null
  }
}

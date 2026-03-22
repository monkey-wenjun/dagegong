/**
 * AI 自动回复服务 - 基于本地数据库优化版
 * 轮询检测HR新消息，调用Dify AI自动回复
 * 
 * 优化点：
 * 1. 直接从本地 SQLite 查询 BossChatRelation，无需启动浏览器
 * 2. 从本地 ChatMessageRecord 获取完整聊天记录作为上下文
 * 3. 每2分钟检查一次，响应更及时
 * 4. 自动获取当前用户ID，无需页面交互
 */

import { ipcMain } from 'electron'
import {
  readStorageFile,
  readConfigFile,
  writeConfigFile
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { runningLogManager } from './running-log'
import { 
  getBossChatRelationList,
  getChatMessageList 
} from '../flow/OPEN_SETTING_WINDOW/utils/db'

// 配置接口
interface AiAutoReplyConfig {
  enabled: boolean
  apiUrl: string
  apiKey: string
  // 对话总结配置（使用 llm.json 中配置的模型）
  enableSummary: boolean
  summaryPrompt: string
}

// 默认提示词模板
const defaultSummaryPrompt = `请分析以下招聘对话记录，并提取关键信息。

【对话记录】
{messages}

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

// 默认配置
const defaultConfig: AiAutoReplyConfig = {
  enabled: false,
  apiUrl: 'http://192.168.1.29/v1/chat-messages',
  apiKey: '',
  enableSummary: false,
  summaryPrompt: defaultSummaryPrompt
}

// 服务状态
let checkTimer: NodeJS.Timeout | null = null
const CHECK_INTERVAL = 2 * 60 * 1000 // 2分钟检查一次（更频繁）

// 记录已回复的消息，防止重复回复（内存缓存）
let repliedMessageIds = new Set<string>()

// 记录正在处理中的消息，防止并发重复处理
const processingMessageIds = new Set<string>()

// 已回复记录文件路径
const REPLIED_MESSAGES_FILE = 'ai-auto-replied-messages.json'

// 加载已回复记录
async function loadRepliedMessages(): Promise<Set<string>> {
  try {
    const data = readStorageFile(REPLIED_MESSAGES_FILE) as string[] || []
    console.log(`[AiAutoReply] 加载已回复记录: ${data.length} 条`)
    return new Set(data)
  } catch {
    console.log('[AiAutoReply] 没有已回复记录或加载失败')
    return new Set()
  }
}

// 清除已回复记录缓存（用于调试或重置）
export async function clearRepliedMessagesCache(): Promise<void> {
  try {
    repliedMessageIds.clear()
    await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs')
      .then(m => m.writeStorageFile(REPLIED_MESSAGES_FILE, []))
    console.log('[AiAutoReply] 已清空回复缓存')
  } catch (error) {
    console.error('[AiAutoReply] 清空缓存失败:', error)
  }
}

// 保存已回复记录
async function saveRepliedMessages(ids: Set<string>): Promise<void> {
  try {
    // 只保留最近 1000 条记录，防止文件过大
    const arr = Array.from(ids)
    if (arr.length > 1000) {
      arr.splice(0, arr.length - 1000)
    }
    await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs')
      .then(m => m.writeStorageFile(REPLIED_MESSAGES_FILE, arr))
  } catch (error) {
    console.error('[AiAutoReply] 保存已回复记录失败:', error)
  }
}

// 当前用户ID缓存
let currentUserId: string | null = null

// 读取配置
function getConfig(): AiAutoReplyConfig {
  try {
    const config = readConfigFile('ai-auto-reply.json') || {}
    return { ...defaultConfig, ...config }
  } catch {
    return defaultConfig
  }
}

// 保存配置
async function saveConfig(config: Partial<AiAutoReplyConfig>): Promise<void> {
  try {
    const currentConfig = getConfig()
    const newConfig = { ...currentConfig, ...config }
    console.log('[AiAutoReply] 保存配置:', { 
      enableSummary: newConfig.enableSummary,
      summaryPromptLength: newConfig.summaryPrompt?.length 
    })
    await writeConfigFile('ai-auto-reply.json', newConfig)
    console.log('[AiAutoReply] 配置保存成功')
  } catch (error) {
    console.error('[AiAutoReply] 保存配置失败:', error)
  }
}

// 检查是否已登录
function isLoggedIn(): boolean {
  try {
    const cookies = readStorageFile('boss-cookies.json') || []
    return cookies.length > 0
  } catch {
    return false
  }
}

// 获取当前用户ID
async function getCurrentUserId(): Promise<string | null> {
  if (currentUserId) {
    console.log('[AiAutoReply] 使用缓存的用户ID:', currentUserId)
    return currentUserId
  }
  
  console.log('[AiAutoReply] 正在获取当前用户ID...')
  
  try {
    // 从对话列表获取用户ID
    console.log('[AiAutoReply] 调用 getBossChatRelationList...')
    const result = await getBossChatRelationList({
      pageNo: 1,
      pageSize: 1
    })
    
    console.log('[AiAutoReply] getBossChatRelationList 返回:', {
      hasResult: !!result,
      hasData: !!(result?.data),
      dataLength: result?.data?.length,
      totalItemCount: result?.totalItemCount
    })
    
    const conversations = result?.data || []
    if (conversations.length > 0) {
      currentUserId = conversations[0].encryptUserId
      console.log('[AiAutoReply] 当前用户ID:', currentUserId)
      return currentUserId
    }
    
    console.log('[AiAutoReply] 从对话列表未获取到用户ID，conversations为空')
    return null
  } catch (error) {
    console.error('[AiAutoReply] 获取用户ID失败:', error)
    return null
  }
}

// 从本地数据库获取需要回复的对话列表
// 优化：直接查询本地 SQLite，无需启动浏览器
async function getUnreadBossesFromDB(): Promise<Array<{
  encryptBossId: string
  encryptJobId: string | undefined
  bossName: string
  jobName: string
  lastText: string
  lastIsSelf: boolean
  unreadCount: number
}>> {
  console.log('[AiAutoReply] 从本地数据库查询需要回复的对话...')
  
  let encryptUserId: string | null = null
  try {
    encryptUserId = await getCurrentUserId()
  } catch (e) {
    console.error('[AiAutoReply] getCurrentUserId 抛出异常:', e)
    return []
  }
  
  if (!encryptUserId) {
    console.log('[AiAutoReply] 未找到当前用户ID，跳过')
    return []
  }
  
  try {
    // 先查询所有数据（不限制用户ID）用于调试
    console.log(`[AiAutoReply] 查询所有对话（调试用）...`)
    const allResult = await getBossChatRelationList({
      pageNo: 1,
      pageSize: 100
    })
    console.log(`[AiAutoReply] 所有对话数: ${allResult.data?.length || 0}, 总数: ${allResult.totalItemCount}`)
    
    if (allResult.data?.length > 0) {
      console.log(`[AiAutoReply] 前3条的用户ID:`, allResult.data.slice(0, 3).map((c: any) => c.encryptUserId))
    }
    
    // 获取当前用户的对话列表
    console.log(`[AiAutoReply] 查询当前用户对话，用户ID: ${encryptUserId}`)
    const result = await getBossChatRelationList({
      pageNo: 1,
      pageSize: 100,
      encryptUserId: encryptUserId
    })
    
    console.log(`[AiAutoReply] 数据库返回结果:`, {
      total: result.totalItemCount,
      pageNo: result.pageNo,
      dataLength: result.data?.length
    })
    
    const conversations = result.data || []
    
    console.log(`[AiAutoReply] 当前用户对话数: ${conversations.length}`)
    
    if (conversations.length === 0) {
      console.log('[AiAutoReply] 数据库返回0条对话，可能原因：')
      console.log('  1. 该用户ID下没有对话记录')
      console.log('  2. 数据库视图未更新（缺少lastIsSelf字段）')
      console.log('  3. encryptUserId不匹配')
      return []
    }
    
    console.log(`[AiAutoReply] 原始数据前3条:`, conversations.slice(0, 3).map((c: any) => ({
      bossName: c.bossName,
      unreadCount: c.unreadCount,
      lastIsSelf: c.lastIsSelf,
      lastIsSelfType: typeof c.lastIsSelf,
      lastText: c.lastText?.slice(0, 20),
      updateTime: c.updateTime
    })))
    
    // 检查是否有未读消息的记录
    const unreadConvs = conversations.filter((c: any) => c.unreadCount > 0)
    console.log(`[AiAutoReply] 未读消息对话数: ${unreadConvs.length}`)
    unreadConvs.forEach((c: any) => {
      console.log(`[AiAutoReply] 未读: ${c.bossName}, unread=${c.unreadCount}, lastIsSelf=${c.lastIsSelf}(${typeof c.lastIsSelf})`)
    })
    
    // 不过滤时间，先看所有数据
    console.log(`[AiAutoReply] 不过滤时间，总对话数: ${conversations.length}`)
    
    // 过滤最近7天内的活跃对话
    // 注意：数据库中的 updateTime 可能是秒级时间戳，需要转换为毫秒
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recentConversations = conversations.filter((conv: any) => {
      // 处理时间戳可能是秒或毫秒的情况
      const updateTime = conv.updateTime > 1000000000000 ? conv.updateTime : conv.updateTime * 1000
      return updateTime > sevenDaysAgo
    })
    
    console.log(`[AiAutoReply] 7天内对话数: ${recentConversations.length}, 7天前对话数: ${conversations.length - recentConversations.length}`)
    
    // 打印所有对话的详细信息用于调试
    console.log('[AiAutoReply] 所有对话详情（前10个）:')
    recentConversations.slice(0, 10).forEach((conv: any, i: number) => {
      const lastText = conv.lastText?.slice(0, 30) || '无消息'
      const lastIsSelfValue = conv.lastIsSelf
      // 判断最后一条是否是自己发的（处理布尔值和数字）
      const isLastFromSelf = lastIsSelfValue === true || lastIsSelfValue === 1
      const needReply = conv.unreadCount > 0 && !isLastFromSelf
      console.log(`  [${i+1}] ${conv.bossName} | unread: ${conv.unreadCount} | lastIsSelf: ${lastIsSelfValue}(${typeof lastIsSelfValue}) | needReply: ${needReply} | lastText: ${lastText}`)
    })
    
    // 过滤出需要回复的对话
    console.log(`[AiAutoReply] 开始过滤需要回复的对话，总记录数: ${recentConversations.length}`)
    const needReply = recentConversations.filter((conv: any) => {
      // 注意：lastIsSelf 可能是数字 0/1 或布尔值
      const lastIsSelfValue = conv.lastIsSelf
      const isLastFromSelf = lastIsSelfValue === true || lastIsSelfValue === 1
      
      // 调试日志
      if (conv.unreadCount > 0) {
        console.log(`[AiAutoReply] 检查 ${conv.bossName}: unread=${conv.unreadCount}, lastIsSelf=${lastIsSelfValue}(${typeof lastIsSelfValue}), isLastFromSelf=${isLastFromSelf}`)
      }
      
      // 有未读消息，且最后一条不是自己的
      if (conv.unreadCount > 0 && !isLastFromSelf) {
        console.log(`[AiAutoReply] ✓ ${conv.bossName} 需要回复 (有未读且不是自己发的)`)
        return true
      }
      // 虽然没有未读标记，但最后一条是对方发的
      if (!isLastFromSelf && conv.lastText) {
        console.log(`[AiAutoReply] ✓ ${conv.bossName} 需要回复 (无未读但对方发的最后一条)`)
        return true
      }
      return false
    })
    
    console.log(`[AiAutoReply] 其中 ${needReply.length} 个需要回复`)
    
    return needReply.map((conv: any) => ({
      encryptBossId: conv.encryptBossId,
      encryptJobId: conv.encryptJobId || undefined,
      bossName: conv.bossName,
      jobName: conv.jobName || '',
      lastText: conv.lastText || '',
      lastIsSelf: conv.lastIsSelf,
      unreadCount: conv.unreadCount,
      updateTime: conv.updateTime  // 添加时间戳用于生成唯一键
    }))
  } catch (error) {
    console.error('[AiAutoReply] 查询数据库失败:', error)
    return []
  }
}

// 获取聊天记录作为上下文
// 从本地 ChatMessageRecord 获取，无需调用 API
async function getChatHistory(
  encryptBossId: string,
  encryptUserId: string
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    // 使用 worker 获取聊天记录
    const messages = await getChatMessageList({
      encryptBossId: encryptBossId,
      encryptUserId: encryptUserId
    })
    
    // 取最近20条
    const recentMessages = messages.slice(0, 20)
    
    // 转换为 AI 上下文格式
    const history = recentMessages.map((msg: any) => ({
      role: msg.style === 'sent' ? 'assistant' : 'user',
      content: msg.text || '[图片/文件]'
    }))
    
    console.log(`[AiAutoReply] 获取到 ${history.length} 条历史消息`)
    return history
  } catch (error) {
    console.error('[AiAutoReply] 获取聊天记录失败:', error)
    return []
  }
}

// 解析 Dify streaming 响应
async function parseDifyStream(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法读取响应流')
  }

  let fullAnswer = ''
  const decoder = new TextDecoder()

  console.log('[AiAutoReply] 开始解析流式响应...')

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.answer) {
            fullAnswer = parsed.answer
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  }

  console.log('[AiAutoReply] 流式响应解析完成:', fullAnswer.slice(0, 100) + '...')
  return fullAnswer
}

// 调用 Dify API（直接传入 query）
async function callDifyApiWithQuery(
  query: string,
  config: AiAutoReplyConfig
): Promise<string | null> {
  console.log('[AiAutoReply] [CallDifyApi] ====== 开始调用 Dify API ======')
  console.log('[AiAutoReply] [CallDifyApi] Query 长度:', query.length)
  console.log('[AiAutoReply] [CallDifyApi] Query 预览:', query.substring(0, 150) + '...')
  console.log('[AiAutoReply] [CallDifyApi] API URL:', config.apiUrl)
  console.log('[AiAutoReply] [CallDifyApi] API Key 存在:', !!config.apiKey)
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    console.log('[AiAutoReply] [CallDifyApi] 构建请求...')
    
    const requestBody = {
      inputs: {},
      query: query,
      response_mode: 'blocking',
      conversation_id: '',
      user: 'dagegong-auto-reply'
    }
    console.log('[AiAutoReply] [CallDifyApi] 请求体:', JSON.stringify(requestBody).substring(0, 200) + '...')

    console.log('[AiAutoReply] [CallDifyApi] 发送 fetch 请求...')
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    console.log('[AiAutoReply] [CallDifyApi] 收到响应:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      contentType: response.headers.get('content-type')
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AiAutoReply] [CallDifyApi] HTTP 错误:', response.status, errorText)
      throw new Error(`HTTP ${response.status}: ${errorText || '请求失败'}`)
    }

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      console.log('[AiAutoReply] [CallDifyApi] 检测到 streaming 响应，开始解析...')
      const fullAnswer = await parseDifyStream(response)
      console.log('[AiAutoReply] [CallDifyApi] Stream 解析完成，答案长度:', fullAnswer.length)
      console.log('[AiAutoReply] [CallDifyApi] ====== 调用成功 ======')
      return fullAnswer.trim() || null
    }

    console.log('[AiAutoReply] [CallDifyApi] 解析 JSON 响应...')
    const data = await response.json()
    console.log('[AiAutoReply] [CallDifyApi] 响应数据:', JSON.stringify(data, null, 2).substring(0, 300))
    
    const answer = data.answer?.trim()
    console.log('[AiAutoReply] [CallDifyApi] 提取的答案:', answer ? answer.substring(0, 100) + '...' : '无')
    console.log('[AiAutoReply] [CallDifyApi] ====== 调用成功 ======')
    return answer || null
  } catch (error) {
    console.error('[AiAutoReply] [CallDifyApi] ====== 调用失败 ======')
    console.error('[AiAutoReply] [CallDifyApi] 错误信息:', error)
    if (error instanceof Error) {
      console.error('[AiAutoReply] [CallDifyApi] 错误堆栈:', error.stack)
    }
    return null
  }
}

// LLM 总结结果接口
interface LlmSummaryResult {
  shouldReject: boolean
  rejectReason?: string
  rejectReply?: string
  summary: string
  keyPoints: string[]
  advantages: string[]
}

// LLM 配置接口
interface LlmConfig {
  id: string
  providerCompleteApiUrl: string
  providerApiSecret: string
  model: string
  enabled: boolean
}

// 从 llm.json 获取启用的 LLM 配置
function getLlmConfig(): LlmConfig | null {
  try {
    const llmConfigList = readConfigFile('llm.json') as LlmConfig[] || []
    // 找到第一个启用的配置
    const enabledConfig = llmConfigList.find(c => c.enabled)
    return enabledConfig || llmConfigList[0] || null
  } catch (error) {
    console.error('[AiAutoReply] 读取 llm.json 失败:', error)
    return null
  }
}

// 调用 LLM API 进行对话总结
async function callLlmSummary(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  config: AiAutoReplyConfig
): Promise<LlmSummaryResult | null> {
  if (!config.enableSummary) {
    console.log('[AiAutoReply] [LLM总结] 未启用，跳过总结')
    return null
  }

  // 从 llm.json 获取 LLM 配置
  const llmConfig = getLlmConfig()
  if (!llmConfig) {
    console.log('[AiAutoReply] [LLM总结] 未找到 LLM 配置，跳过总结')
    return null
  }

  console.log('[AiAutoReply] [LLM总结] ====== 开始调用 LLM 总结 ======')
  console.log('[AiAutoReply] [LLM总结] 对话轮数:', messages.length)
  console.log('[AiAutoReply] [LLM总结] 使用模型:', llmConfig.model)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    // 格式化消息
    const messagesText = messages.map(m => {
      const role = m.role === 'user' ? 'BOSS' : '我'
      return `${role}: ${m.content}`
    }).join('\n')

    // 替换提示词模板
    const prompt = (config.summaryPrompt || defaultSummaryPrompt).replace('{messages}', messagesText)

    // 构建 API URL
    const apiUrl = llmConfig.providerCompleteApiUrl.endsWith('/v1')
      ? `${llmConfig.providerCompleteApiUrl}/chat/completions`
      : `${llmConfig.providerCompleteApiUrl}/v1/chat/completions`

    console.log('[AiAutoReply] [LLM总结] API URL:', apiUrl)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${llmConfig.providerApiSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'system', content: '你是一个专业的对话分析助手。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AiAutoReply] [LLM总结] HTTP 错误:', response.status, errorText)
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    console.log('[AiAutoReply] [LLM总结] 原始回复:', content.slice(0, 200))

    // 解析 JSON
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim()
      const result: LlmSummaryResult = JSON.parse(cleanContent)
      
      if (result.shouldReject) {
        console.log('[AiAutoReply] [LLM总结] ⚠️ 检测到需要拒绝:', result.rejectReason)
      } else {
        console.log('[AiAutoReply] [LLM总结] 总结结果:', result.summary)
      }
      
      console.log('[AiAutoReply] [LLM总结] ====== 调用成功 ======')
      return result
    } catch (parseError) {
      console.error('[AiAutoReply] [LLM总结] JSON 解析失败:', parseError)
      // 返回一个默认结果
      return {
        shouldReject: false,
        summary: content.slice(0, 100),
        keyPoints: [],
        advantages: []
      }
    }
  } catch (error) {
    console.error('[AiAutoReply] [LLM总结] ====== 调用失败 ======')
    console.error('[AiAutoReply] [LLM总结] 错误:', error)
    return null
  }
}

// 发送回复到BOSS
async function sendReply(
  encryptBossId: string,
  encryptJobId: string | undefined,
  message: string
): Promise<boolean> {
  console.log('[AiAutoReply] [SendReply] ====== 开始发送回复 ======')
  console.log('[AiAutoReply] [SendReply] BOSS ID:', encryptBossId?.substring(0, 20) + '...')
  console.log('[AiAutoReply] [SendReply] Job ID:', encryptJobId?.substring(0, 20) + '...' || 'undefined')
  console.log('[AiAutoReply] [SendReply] 消息内容:', message)
  console.log('[AiAutoReply] [SendReply] 消息长度:', message.length)
  
  try {
    console.log('[AiAutoReply] [SendReply] 正在导入 launchBossSiteForReply...')
    const { launchBossSiteForReply } = await import('../flow/LAUNCH_BOSS_SITE/index')
    console.log('[AiAutoReply] [SendReply] 导入成功，准备调用...')
    
    await launchBossSiteForReply(encryptBossId, encryptJobId, message)
    
    console.log('[AiAutoReply] [SendReply] ====== 发送回复成功 ======')
    return true
  } catch (error) {
    console.error('[AiAutoReply] [SendReply] ====== 发送回复失败 ======')
    console.error('[AiAutoReply] [SendReply] 错误信息:', error)
    if (error instanceof Error) {
      console.error('[AiAutoReply] [SendReply] 错误堆栈:', error.stack)
    }
    return false
  }
}

// 处理单个回复
async function processReply(
  boss: {
    encryptBossId: string
    encryptJobId: string | undefined
    bossName: string
    lastText: string
    jobName?: string
    lastIsSelf?: boolean
    updateTime?: number
  },
  config: AiAutoReplyConfig
): Promise<void> {
  // 使用 BOSS ID + 消息内容 + 时间戳 作为唯一键，避免重复回复
  // 如果时间戳不存在，则使用当前时间
  const timeKey = boss.updateTime || Date.now()
  const messageKey = `${boss.encryptBossId}:${timeKey}:${boss.lastText?.slice(0, 50)}`
  
  console.log(`[AiAutoReply] [ProcessReply] 生成消息键: ${boss.encryptBossId?.slice(0, 10)}...:${timeKey}:${boss.lastText?.slice(0, 30)}`)
  
  // 检查是否已回复
  if (repliedMessageIds.has(messageKey)) {
    const msg = `[AiAutoReply] 已回复过 ${boss.bossName} 的这条消息，跳过`
    console.log(msg)
    runningLogManager.logInfo(msg)
    return
  }
  
  // 检查是否正在处理中（防止并发）
  if (processingMessageIds.has(messageKey)) {
    const msg = `[AiAutoReply] ${boss.bossName} 的消息正在处理中，跳过`
    console.log(msg)
    runningLogManager.logInfo(msg)
    return
  }
  
  // 标记为正在处理
  processingMessageIds.add(messageKey)
  console.log(`[AiAutoReply] [ProcessReply] 标记为正在处理，当前处理中数量: ${processingMessageIds.size}`)

  try {
    // 如果最后一条是自己发的，不需要回复
    if (boss.lastIsSelf) {
      const msg = `[AiAutoReply] ${boss.bossName} 的最后一条消息是自己发的，跳过`
      console.log(msg)
      runningLogManager.logInfo(msg)
      return
    }
    
    const detectMsg = `[AiAutoReply] 检测到 ${boss.bossName} 的新消息: ${boss.lastText}`
    console.log(detectMsg)
    runningLogManager.logInfo(detectMsg, { 
      type: 'ai-detect', 
      bossName: boss.bossName, 
      bossId: boss.encryptBossId,
      receivedMessage: boss.lastText 
    })
    
    // 获取聊天记录作为上下文
    const encryptUserId = await getCurrentUserId()
    let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    
    if (encryptUserId) {
      chatHistory = await getChatHistory(boss.encryptBossId, encryptUserId)
    }
    
    // LLM 总结阶段
    let summaryResult: LlmSummaryResult | null = null
    if (config.enableSummary && chatHistory.length > 0) {
      const summaryMsg = `[AiAutoReply] 调用 LLM 总结对话...`
      console.log(summaryMsg)
      runningLogManager.logInfo(summaryMsg, { 
        type: 'ai-summary-calling', 
        bossName: boss.bossName,
        contextLength: chatHistory.length
      })
      
      summaryResult = await callLlmSummary(chatHistory, config)
      
      if (summaryResult) {
        if (summaryResult.shouldReject) {
          const rejectMsg = `[AiAutoReply] LLM 建议婉拒: ${summaryResult.rejectReason}`
          console.log(rejectMsg)
          runningLogManager.logInfo(rejectMsg, { 
            type: 'ai-summary-reject', 
            bossName: boss.bossName,
            rejectReason: summaryResult.rejectReason,
            rejectReply: summaryResult.rejectReply
          })
        } else {
          const summaryMsg = `[AiAutoReply] LLM 总结: ${summaryResult.summary}`
          console.log(summaryMsg)
          runningLogManager.logInfo(summaryMsg, { 
            type: 'ai-summary-result', 
            bossName: boss.bossName,
            summary: summaryResult.summary,
            keyPoints: summaryResult.keyPoints,
            advantages: summaryResult.advantages
          })
        }
      }
    }
    
    // 如果需要婉拒，直接发送婉拒回复
    if (summaryResult?.shouldReject && summaryResult.rejectReply) {
      const rejectReply = summaryResult.rejectReply
      const generatedMsg = `[AiAutoReply] 使用 DeepSeek 建议的婉拒回复: ${rejectReply.slice(0, 100)}${rejectReply.length > 100 ? '...' : ''}`
      console.log(generatedMsg)
      runningLogManager.logInfo(generatedMsg, { 
        type: 'ai-generated-reject', 
        bossName: boss.bossName, 
        aiResponse: rejectReply 
      })
      
      // 随机延迟后发送婉拒回复
      const delay = Math.floor(Math.random() * 5000) + 3000
      await new Promise(r => setTimeout(r, delay))
      
      const sent = await sendReply(boss.encryptBossId, boss.encryptJobId, rejectReply)
      if (sent) {
        repliedMessageIds.add(messageKey)
        await saveRepliedMessages(repliedMessageIds)
        runningLogManager.logAiReply({
          bossName: boss.bossName,
          bossId: boss.encryptBossId,
          jobName: boss.jobName,
          receivedMessage: boss.lastText,
          replyContent: rejectReply,
          aiResponse: rejectReply,
          isReject: true
        })
      }
      return
    }
    
    // 调用AI生成回复
    const callingMsg = `[AiAutoReply] 调用 AI 生成回复...`
    console.log(callingMsg)
    runningLogManager.logInfo(callingMsg, { 
      type: 'ai-calling', 
      bossName: boss.bossName,
      receivedMessage: boss.lastText,
      contextLength: chatHistory.length
    })
    
    // 构建带 LLM 总结的 query
    let query = boss.lastText
    if (summaryResult && !summaryResult.shouldReject) {
      const context = chatHistory.map(h => {
        const role = h.role === 'user' ? 'BOSS' : '我'
        return `${role}: ${h.content}`
      }).join('\n')
      
      query = `【对话背景】
${summaryResult.summary}

关键信息：
${summaryResult.keyPoints?.map(p => `- ${p}`).join('\n') || '无'}

【历史对话】
${context}

【最新消息】
BOSS 说："${boss.lastText}"

请基于以上背景，给出一个专业、得体且针对性的回复。回复要：
1. 体现对岗位的了解和兴趣
2. 回应 BOSS 的具体问题
3. 展示匹配的优势（${summaryResult.advantages?.join('、') || '沟通能力强'}）
4. 保持礼貌和专业`
    } else if (chatHistory.length > 0) {
      // 没有 DeepSeek 总结，使用普通上下文
      const context = chatHistory.map(h => {
        const role = h.role === 'user' ? 'BOSS' : '我'
        return `${role}: ${h.content}`
      }).join('\n')
      
      query = `以下是我与 BOSS 的历史对话：\n\n${context}\n\n现在 BOSS 说: "${boss.lastText}"\n\n请基于以上对话上下文，给出一个自然、得体的回复。`
    }
    
    const reply = await callDifyApiWithQuery(query, config)
    
    if (!reply) {
      const noReplyMsg = `[AiAutoReply] AI 未生成回复`
      console.log(noReplyMsg)
      runningLogManager.logInfo(noReplyMsg, { type: 'ai-no-reply', bossName: boss.bossName })
      return
    }
    
    const generatedMsg = `[AiAutoReply] AI 生成回复: ${reply.slice(0, 100)}${reply.length > 100 ? '...' : ''}`
    console.log(generatedMsg)
    runningLogManager.logInfo(generatedMsg, { 
      type: 'ai-generated', 
      bossName: boss.bossName, 
      aiResponse: reply 
    })
    
    // 随机延迟 3-10 秒，模拟人工
    const delay = Math.floor(Math.random() * 8000) + 3000
    const delayMsg = `[AiAutoReply] 等待 ${delay}ms 后发送...`
    console.log(delayMsg)
    try { runningLogManager.logInfo(delayMsg, { type: 'ai-delay', bossName: boss.bossName, delay }) } catch (e) {}
    await new Promise(r => setTimeout(r, delay))
    
    // 发送完整回复
    console.log('[AiAutoReply] [ProcessReply] ====== 准备发送阶段 ======')
    console.log('[AiAutoReply] [ProcessReply] BOSS:', boss.bossName)
    console.log('[AiAutoReply] [ProcessReply] BOSS ID:', boss.encryptBossId)
    console.log('[AiAutoReply] [ProcessReply] Job ID:', boss.encryptJobId || 'undefined')
    console.log('[AiAutoReply] [ProcessReply] 回复内容:', reply)
    console.log('[AiAutoReply] [ProcessReply] 回复长度:', reply.length)
    
    const sendingMsg = `[AiAutoReply] 发送回复给 ${boss.bossName}...`
    console.log(sendingMsg)
    try {
      runningLogManager.logInfo(sendingMsg, { 
        type: 'ai-sending', 
        bossName: boss.bossName,
        replyContent: reply 
      })
    } catch (e) {}
    
    console.log('[AiAutoReply] [ProcessReply] 调用 sendReply...')
    let sent = false
    try {
      sent = await sendReply(boss.encryptBossId, boss.encryptJobId, reply)
      console.log('[AiAutoReply] [ProcessReply] sendReply 返回:', sent)
    } catch (err) {
      console.error('[AiAutoReply] [ProcessReply] sendReply 抛出异常:', err)
      sent = false
    }
    
    if (sent) {
      repliedMessageIds.add(messageKey)
      console.log(`[AiAutoReply] [ProcessReply] 已添加到已回复集合，当前数量: ${repliedMessageIds.size}`)
      
      // 持久化保存已回复记录
      try { await saveRepliedMessages(repliedMessageIds) } catch (e) {}
      
      const successMsg = `[AiAutoReply] 成功回复 ${boss.bossName}`
      console.log(successMsg)
      
      try {
        runningLogManager.logAiReply({
          bossName: boss.bossName,
          bossId: boss.encryptBossId,
          jobName: boss.jobName,
          receivedMessage: boss.lastText,
          replyContent: reply,
          aiResponse: reply
        })
      } catch (e) {}
    } else {
      const failMsg = `[AiAutoReply] 发送回复给 ${boss.bossName} 失败`
      console.log(failMsg)
      try { runningLogManager.logError(failMsg, { bossName: boss.bossName, bossId: boss.encryptBossId }) } catch (e) {}
    }
  } finally {
    // 无论成功失败，都移除处理中标记
    processingMessageIds.delete(messageKey)
    console.log(`[AiAutoReply] [ProcessReply] 移除处理中标记，当前处理中数量: ${processingMessageIds.size}`)
  }
}

// 执行检查（基于本地数据库）
async function doCheck(): Promise<void> {
  const config = getConfig()
  if (!config.enabled || !config.apiKey) {
    return
  }
  
  if (!isLoggedIn()) {
    const msg = '[AiAutoReply] 未登录，跳过检查'
    console.log(msg)
    runningLogManager.logInfo(msg)
    return
  }
  
  // 检查自动同步任务是否正在运行（避免冲突）
  const { getSyncStatus } = await import('./auto-sync-boss-chat-relations')
  const syncStatus = getSyncStatus()
  if (syncStatus.isRunning) {
    const msg = '[AiAutoReply] 自动同步任务运行中，跳过本次检查'
    console.log(msg)
    runningLogManager.logInfo(msg)
    return
  }
  
  try {
    const startMsg = '[AiAutoReply] ====== 开始检查未读消息（基于本地数据库） ======'
    console.log(startMsg)
    runningLogManager.logInfo(startMsg)
    
    // 从本地数据库获取需要回复的对话
    console.log('[AiAutoReply] 从本地数据库查询...')
    const bosses = await getUnreadBossesFromDB()
    console.log(`[AiAutoReply] 获取到 ${bosses.length} 个需要回复的对话`)
    
    if (!bosses || bosses.length === 0) {
      const noMsg = '[AiAutoReply] 没有需要回复的消息'
      console.log(noMsg)
      runningLogManager.logInfo(noMsg)
      return
    }
    
    // 过滤掉已经回复过的
    const newBosses = bosses.filter(b => {
      const messageKey = `${b.encryptBossId}:${b.lastText}`
      if (repliedMessageIds.has(messageKey)) {
        console.log(`[AiAutoReply] 已回复过 ${b.bossName} 的这条消息，跳过`)
        return false
      }
      return true
    })
    
    if (newBosses.length === 0) {
      const allRepliedMsg = '[AiAutoReply] 所有消息都已回复过'
      console.log(allRepliedMsg)
      runningLogManager.logInfo(allRepliedMsg)
      return
    }
    
    const foundMsg = `[AiAutoReply] 发现 ${bosses.length} 个未读消息，其中 ${newBosses.length} 个需要回复`
    console.log(foundMsg)
    runningLogManager.logInfo(foundMsg, { 
      type: 'ai-check-result', 
      count: newBosses.length,
      bosses: newBosses.map(b => ({ name: b.bossName, job: b.jobName, message: b.lastText }))
    })
    
    // 逐个处理
    for (let i = 0; i < newBosses.length; i++) {
      const boss = newBosses[i]
      const processingMsg = `[AiAutoReply] 处理第 ${i + 1}/${newBosses.length} 个: ${boss.bossName}`
      console.log(processingMsg)
      runningLogManager.logInfo(processingMsg, { 
        type: 'ai-processing', 
        bossName: boss.bossName,
        progress: `${i + 1}/${newBosses.length}`
      })
      
      await processReply(boss, config)
      
      // 间隔5秒处理下一个
      if (i < newBosses.length - 1) {
        await new Promise(r => setTimeout(r, 5000))
      }
    }
    
    const completeMsg = '[AiAutoReply] ====== 检查完成 ======'
    console.log(completeMsg)
    runningLogManager.logInfo(completeMsg)
  } catch (error) {
    const errorMsg = '[AiAutoReply] 检查出错'
    console.error(errorMsg, error)
    runningLogManager.logError(errorMsg, error)
  }
}

// 启动服务
export async function startAiAutoReply(): Promise<void> {
  if (checkTimer) {
    return
  }
  
  const config = getConfig()
  if (!config.enabled || !config.apiKey) {
    console.log('[AiAutoReply] 未启用或缺少API Key')
    return
  }
  
  console.log('[AiAutoReply] 启动服务（基于本地数据库），检查间隔:', CHECK_INTERVAL / 60000, '分钟')
  
  // 加载已回复记录
  repliedMessageIds = await loadRepliedMessages()
  
  // 首次启动时运行数据库调试
  try {
    console.log('[AiAutoReply] 运行数据库调试...')
    const { debugQueryBossChatRelation } = await import('./ai-auto-reply-debug')
    const debugResult = await debugQueryBossChatRelation()
    console.log('[AiAutoReply] 数据库调试结果:', debugResult)
  } catch (e) {
    console.error('[AiAutoReply] 数据库调试失败:', e)
  }
  
  checkTimer = setInterval(() => {
    doCheck().catch(err => {
      console.error('[AiAutoReply] 检查执行失败:', err)
    })
  }, CHECK_INTERVAL)
  
  // 异步执行首次检查
  setTimeout(() => {
    doCheck().catch(err => {
      console.error('[AiAutoReply] 首次检查执行失败:', err)
    })
  }, 5000) // 延迟5秒执行首次检查（等调试完成）
}

// 停止服务
export function stopAiAutoReply(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  console.log('[AiAutoReply] 停止服务')
}

// 初始化 IPC
export function initAiAutoReplyIpc(): void {
  // 获取配置
  ipcMain.handle('get-ai-auto-reply-config', () => {
    try {
      const config = getConfig()
      console.log('[AiAutoReply] 获取配置:', { 
        enableSummary: config.enableSummary,
        summaryPromptLength: config.summaryPrompt?.length 
      })
      return config
    } catch (error) {
      console.error('[AiAutoReply] 获取配置失败:', error)
      throw error
    }
  })

  // 保存配置
  ipcMain.handle('save-ai-auto-reply-config', async (_, config: Partial<AiAutoReplyConfig>) => {
    try {
      console.log('[AiAutoReply] 收到保存请求:', { 
        enableSummary: config.enableSummary,
        summaryPromptLength: config.summaryPrompt?.length 
      })
      await saveConfig(config)
      const savedConfig = getConfig()
      console.log('[AiAutoReply] 保存后配置:', { 
        enableSummary: savedConfig.enableSummary 
      })
      if (savedConfig.enabled) {
        stopAiAutoReply()
        await startAiAutoReply()
      }
      return savedConfig
    } catch (error) {
      console.error('[AiAutoReply] 保存配置失败:', error)
      throw error
    }
  })

  // 启用/禁用
  ipcMain.handle('set-ai-auto-reply-enabled', async (_, enabled: boolean) => {
    try {
      console.log(`[AiAutoReply] 设置启用状态: ${enabled}`)
      await saveConfig({ enabled })
      if (enabled) {
        await startAiAutoReply()
      } else {
        stopAiAutoReply()
      }
      return getConfig()
    } catch (error) {
      console.error('[AiAutoReply] 设置启用状态失败:', error)
      throw error
    }
  })

  // 清除已回复消息缓存
  ipcMain.handle('clear-ai-auto-reply-cache', async () => {
    try {
      await clearRepliedMessagesCache()
      return { success: true }
    } catch (error) {
      console.error('[AiAutoReply] 清除缓存失败:', error)
      throw error
    }
  })
}

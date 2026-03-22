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
}

// 默认配置
const defaultConfig: AiAutoReplyConfig = {
  enabled: false,
  apiUrl: 'http://192.168.1.29/v1/chat-messages',
  apiKey: ''
}

// 服务状态
let checkTimer: NodeJS.Timeout | null = null
const CHECK_INTERVAL = 2 * 60 * 1000 // 2分钟检查一次（更频繁）

// 记录已回复的消息，防止重复回复
const repliedMessageIds = new Set<string>()

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
    await writeConfigFile('ai-auto-reply.json', newConfig)
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
  if (currentUserId) return currentUserId
  
  try {
    // 从对话列表获取用户ID
    const result = await getBossChatRelationList({
      pageNo: 1,
      pageSize: 1
    })
    
    const conversations = result.data || []
    if (conversations.length > 0) {
      currentUserId = conversations[0].encryptUserId
      console.log('[AiAutoReply] 当前用户ID:', currentUserId)
      return currentUserId
    }
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
  
  const encryptUserId = await getCurrentUserId()
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
      lastText: c.lastText?.slice(0, 20),
      updateTime: c.updateTime
    })))
    
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
    const needReply = recentConversations.filter((conv: any) => {
      // 注意：lastIsSelf 可能是数字 0/1 或布尔值
      const isLastFromSelf = conv.lastIsSelf === true || conv.lastIsSelf === 1
      
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
      unreadCount: conv.unreadCount
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

// 调用 Dify API
async function callDifyApi(
  message: string,
  config: AiAutoReplyConfig,
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    console.log('[AiAutoReply] 调用 AI API，消息:', message.slice(0, 50) + '...')
    if (chatHistory?.length) {
      console.log(`[AiAutoReply] 包含 ${chatHistory.length} 条历史消息作为上下文`)
    }

    // 构建带上下文的 query
    let query = message
    if (chatHistory && chatHistory.length > 0) {
      const context = chatHistory.map(h => {
        const role = h.role === 'user' ? 'BOSS' : '我'
        return `${role}: ${h.content}`
      }).join('\n')
      
      query = `以下是我与 BOSS 的历史对话：\n\n${context}\n\n现在 BOSS 说: "${message}"\n\n请基于以上对话上下文，给出一个自然、得体的回复。`
    }

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: 'blocking',
        conversation_id: '',
        user: 'dagegong-auto-reply'
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText || '请求失败'}`)
    }

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      console.log('[AiAutoReply] 检测到 streaming 响应')
      const fullAnswer = await parseDifyStream(response)
      return fullAnswer.trim() || null
    }

    const data = await response.json()
    return data.answer?.trim() || null
  } catch (error) {
    console.error('[AiAutoReply] AI API 调用失败:', error)
    return null
  }
}

// 发送回复到BOSS
async function sendReply(
  encryptBossId: string,
  encryptJobId: string | undefined,
  message: string
): Promise<boolean> {
  try {
    const { launchBossSiteForReply } = await import('../flow/LAUNCH_BOSS_SITE/index')
    await launchBossSiteForReply(encryptBossId, encryptJobId, message)
    return true
  } catch (error) {
    console.error('[AiAutoReply] 发送回复失败:', error)
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
  },
  config: AiAutoReplyConfig
): Promise<void> {
  const messageKey = `${boss.encryptBossId}:${boss.lastText}`
  
  // 检查是否已回复
  if (repliedMessageIds.has(messageKey)) {
    const msg = `[AiAutoReply] 已回复过 ${boss.bossName} 的这条消息`
    console.log(msg)
    runningLogManager.logInfo(msg)
    return
  }

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
  
  // 调用AI生成回复
  const callingMsg = `[AiAutoReply] 调用 AI 生成回复...`
  console.log(callingMsg)
  runningLogManager.logInfo(callingMsg, { 
    type: 'ai-calling', 
    bossName: boss.bossName,
    receivedMessage: boss.lastText,
    contextLength: chatHistory.length
  })
  
  const reply = await callDifyApi(boss.lastText, config, chatHistory)
  
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
  runningLogManager.logInfo(delayMsg, { type: 'ai-delay', bossName: boss.bossName, delay })
  await new Promise(r => setTimeout(r, delay))
  
  // 发送完整回复
  const sendingMsg = `[AiAutoReply] 发送回复给 ${boss.bossName}...`
  console.log(sendingMsg)
  runningLogManager.logInfo(sendingMsg, { 
    type: 'ai-sending', 
    bossName: boss.bossName,
    replyContent: reply 
  })
  
  const sent = await sendReply(boss.encryptBossId, boss.encryptJobId, reply)
  
  if (sent) {
    repliedMessageIds.add(messageKey)
    const successMsg = `[AiAutoReply] 成功回复 ${boss.bossName}`
    console.log(successMsg)
    
    runningLogManager.logAiReply({
      bossName: boss.bossName,
      bossId: boss.encryptBossId,
      jobName: boss.jobName,
      receivedMessage: boss.lastText,
      replyContent: reply,
      aiResponse: reply
    })
    
    // 限制缓存大小
    if (repliedMessageIds.size > 500) {
      const firstKey = repliedMessageIds.values().next().value
      if (firstKey) {
        repliedMessageIds.delete(firstKey)
      }
    }
  } else {
    const failMsg = `[AiAutoReply] 发送回复给 ${boss.bossName} 失败`
    console.log(failMsg)
    runningLogManager.logError(failMsg, { bossName: boss.bossName, bossId: boss.encryptBossId })
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
      return getConfig()
    } catch (error) {
      console.error('[AiAutoReply] 获取配置失败:', error)
      throw error
    }
  })

  // 保存配置
  ipcMain.handle('save-ai-auto-reply-config', async (_, config: Partial<AiAutoReplyConfig>) => {
    try {
      await saveConfig(config)
      if (getConfig().enabled) {
        stopAiAutoReply()
        await startAiAutoReply()
      }
      return getConfig()
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
}

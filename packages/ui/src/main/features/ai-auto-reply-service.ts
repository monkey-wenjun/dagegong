/**
 * AI 自动回复服务 - 简化版
 * 轮询检测HR新消息，调用Dify AI自动回复
 * 
 * 支持两种响应模式：
 * 1. blocking - 直接返回完整JSON
 * 2. streaming - 返回SSE流，需要收集完整内容后统一发送
 */

import { ipcMain } from 'electron'
import {
  readStorageFile,
  readConfigFile,
  writeConfigFile
} from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { initDb } from '@dagegong/sqlite-plugin'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { DataSource } from 'typeorm'
import { BossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/BossChatRelation'
import { runningLogManager } from './running-log'

// 配置接口
interface AiAutoReplyConfig {
  enabled: boolean
  apiUrl: string
  apiKey: string
}

// 默认配置 - HTTP 默认端口 80
const defaultConfig: AiAutoReplyConfig = {
  enabled: false,
  apiUrl: 'http://192.168.1.29/v1/chat-messages',
  apiKey: ''
}

// 服务状态
let checkTimer: NodeJS.Timeout | null = null
const CHECK_INTERVAL = 30 * 1000 // 30秒检查一次
let dbInitPromise: Promise<DataSource> | null = null

// 记录已回复的消息，防止重复回复
const repliedMessageIds = new Set<string>()

// 获取数据库连接
async function getDb(): Promise<DataSource> {
  if (!dbInitPromise) {
    dbInitPromise = initDb(getPublicDbFilePath())
  }
  const ds = await dbInitPromise
  if (!ds) {
    throw new Error('数据库初始化失败')
  }
  return ds
}

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

// 获取有未读消息的BOSS列表
async function getUnreadBosses(): Promise<Array<{
  encryptBossId: string
  encryptJobId: string | undefined
  bossName: string
  jobName: string
  lastText: string
  lastMessageId?: string
}>> {
  try {
    const ds = await getDb()
    const repo = ds.getRepository(BossChatRelation)
    
    // 查询有未读消息且最后一条不是自己的记录
    const records = await repo.find({
      where: {
        unreadCount: 1,
        lastIsSelf: false
      },
      order: { updateTime: 'DESC' }
    })
    
    return records.map(r => ({
      encryptBossId: r.encryptBossId,
      encryptJobId: r.encryptJobId || undefined,
      bossName: r.bossName,
      jobName: r.jobName || '',
      lastText: r.lastText || '',
      lastMessageId: r.lastMessageId
    }))
  } catch (error) {
    console.error('[AiAutoReply] 获取未读消息失败:', error)
    runningLogManager.logError('[AiAutoReply] 获取未读消息失败', error)
    return []
  }
}

// 解析 Dify streaming 响应
// 收集所有流式片段，整合成完整的答案后返回
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
      // SSE 格式: data: {...}
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          // Dify streaming 格式中，answer 字段包含当前累积的完整答案
          if (parsed.answer) {
            fullAnswer = parsed.answer
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  }

  console.log('[AiAutoReply] 流式响应解析完成，完整答案:', fullAnswer.slice(0, 100) + '...')
  return fullAnswer
}

// 调用 Dify API
// 自动检测响应类型（blocking 或 streaming）并正确处理
async function callDifyApi(message: string, config: AiAutoReplyConfig): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    console.log('[AiAutoReply] 调用 AI API，消息:', message.slice(0, 50) + '...')

    // 请求时尝试 blocking 模式
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: message,
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

    // 检查是否是 streaming 响应（text/event-stream）
    if (contentType.includes('text/event-stream') || contentType.includes('stream')) {
      console.log('[AiAutoReply] 检测到 streaming 响应')
      // 收集完整内容后返回
      const fullAnswer = await parseDifyStream(response)
      return fullAnswer.trim() || null
    }

    // blocking 模式 - 直接返回 JSON
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
async function processReply(boss: {
  encryptBossId: string
  encryptJobId: string | undefined
  bossName: string
  lastText: string
  jobName?: string
  lastMessageId?: string
}, config: AiAutoReplyConfig): Promise<void> {
  const messageKey = boss.lastMessageId || `${boss.encryptBossId}:${boss.lastText}`
  
  // 检查是否已回复
  if (repliedMessageIds.has(messageKey)) {
    const msg = `[AiAutoReply] 已回复过 ${boss.bossName} 的这条消息`
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
  
  // 调用AI生成回复
  const callingMsg = `[AiAutoReply] 调用 AI 生成回复...`
  console.log(callingMsg)
  runningLogManager.logInfo(callingMsg, { 
    type: 'ai-calling', 
    bossName: boss.bossName,
    receivedMessage: boss.lastText 
  })
  
  const reply = await callDifyApi(boss.lastText, config)
  
  if (!reply) {
    const noReplyMsg = `[AiAutoReply] AI 未生成回复`
    console.log(noReplyMsg)
    runningLogManager.logInfo(noReplyMsg, { type: 'ai-no-reply', bossName: boss.bossName })
    return
  }
  
  const generatedMsg = `[AiAutoReply] AI 生成完整回复: ${reply.slice(0, 100)}${reply.length > 100 ? '...' : ''}`
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
  const sendingMsg = `[AiAutoReply] 发送完整回复给 ${boss.bossName}...`
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
    
    // 使用专门的 AI 回复日志类型
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

// 执行检查
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
  
  try {
    const startMsg = '[AiAutoReply] ====== 开始检查未读消息 ======'
    console.log(startMsg)
    runningLogManager.logInfo(startMsg)
    
    const bosses = await getUnreadBosses()
    
    if (bosses.length === 0) {
      const noMsg = '[AiAutoReply] 没有新消息'
      console.log(noMsg)
      runningLogManager.logInfo(noMsg)
      return
    }
    
    const foundMsg = `[AiAutoReply] 发现 ${bosses.length} 个未读消息`
    console.log(foundMsg)
    runningLogManager.logInfo(foundMsg, { 
      type: 'ai-check-result', 
      count: bosses.length,
      bosses: bosses.map(b => ({ name: b.bossName, job: b.jobName, message: b.lastText }))
    })
    
    // 逐个处理
    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i]
      const processingMsg = `[AiAutoReply] 处理第 ${i + 1}/${bosses.length} 个: ${boss.bossName}`
      console.log(processingMsg)
      runningLogManager.logInfo(processingMsg, { 
        type: 'ai-processing', 
        bossName: boss.bossName,
        progress: `${i + 1}/${bosses.length}`
      })
      
      await processReply(boss, config)
      
      // 间隔5秒处理下一个
      if (i < bosses.length - 1) {
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
export function startAiAutoReply(): void {
  if (checkTimer) {
    return
  }
  
  const config = getConfig()
  if (!config.enabled || !config.apiKey) {
    console.log('[AiAutoReply] 未启用或缺少API Key')
    return
  }
  
  console.log('[AiAutoReply] 启动服务')
  checkTimer = setInterval(doCheck, CHECK_INTERVAL)
  doCheck() // 立即执行一次
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
      // 重启服务以应用新配置
      if (getConfig().enabled) {
        stopAiAutoReply()
        startAiAutoReply()
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
        startAiAutoReply()
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

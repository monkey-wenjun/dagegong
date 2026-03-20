/**
 * 每日统计通知模块
 * 支持飞书和钉钉机器人推送
 */

import { ipcMain } from 'electron'
import { readConfigFile, writeConfigFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { initDb } from '@dagegong/sqlite-plugin'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { DataSource } from 'typeorm'

// 定时任务句柄
let dailyStatsTimer: NodeJS.Timeout | null = null
let currentConfig: DailyStatsConfig | null = null

export interface DailyStatsConfig {
  dailyStatsNotificationEnabled: boolean
  dailyStatsNotificationType: 'feishu' | 'dingtalk'
  dailyStatsWebhookUrl: string
  dailyStatsPushTime: string
  dailyStatsTemplate: string
}

interface NotificationPayload {
  type: 'feishu' | 'dingtalk'
  webhookUrl: string
  resumeCount: number
  bossCount: number
  template: string
}

/**
 * 获取当天的沟通统计
 */
export async function getTodayStats(): Promise<{ resumeCount: number; bossCount: number }> {
  try {
    const db = await initDb(getPublicDbFilePath()) as DataSource
    
    // 获取今天开始和结束时间
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    
    console.log('[DailyStats] Querying stats from', startOfDay.toISOString(), 'to', endOfDay.toISOString())
    
    // 查询今天AI自动找工作的数量（投递简历数）
    const resumeResult = await db.query(
      `SELECT COUNT(*) as count FROM chat_startup_log 
       WHERE date >= ? AND date <= ?`,
      [startOfDay.toISOString(), endOfDay.toISOString()]
    )
    const resumeCount = resumeResult[0]?.count || 0
    
    // 查询今天沟通的BOSS数量（从BOSS沟通记录表中查询今天有更新的记录）
    // 注意：boss_chat_relation 表的 updateTime 是毫秒级时间戳
    const bossResult = await db.query(
      `SELECT COUNT(*) as count FROM boss_chat_relation 
       WHERE updateTime >= ? AND updateTime <= ?`,
      [startOfDay.getTime(), endOfDay.getTime()]
    )
    const bossCount = bossResult[0]?.count || 0
    
    console.log(`[DailyStats] Query result: ${resumeCount} resumes, ${bossCount} bosses`)
    
    return { resumeCount, bossCount }
  } catch (error) {
    console.error('[DailyStats] Get today stats error:', error?.message || error)
    return { resumeCount: 0, bossCount: 0 }
  }
}

/**
 * 替换模板变量
 */
function renderTemplate(template: string, data: { resumeCount: number; bossCount: number }): string {
  return template
    .replace(/\{\{resumeCount\}\}/g, String(data.resumeCount))
    .replace(/\{\{bossCount\}\}/g, String(data.bossCount))
}

/**
 * 发送飞书机器人消息
 */
async function sendFeishuMessage(webhookUrl: string, content: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: content
      }
    })
  })
  
  if (!response.ok) {
    throw new Error(`飞书API返回错误: ${response.status} ${response.statusText}`)
  }
  
  const result = await response.json()
  if (result.code !== 0) {
    throw new Error(`飞书API错误: ${result.msg || result.message}`)
  }
}

/**
 * 发送钉钉机器人消息
 */
async function sendDingtalkMessage(webhookUrl: string, content: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: {
        content: content
      }
    })
  })
  
  if (!response.ok) {
    throw new Error(`钉钉API返回错误: ${response.status} ${response.statusText}`)
  }
  
  const result = await response.json()
  if (result.errcode !== 0) {
    throw new Error(`钉钉API错误: ${result.errmsg}`)
  }
}

/**
 * 发送每日统计通知
 */
export async function sendDailyStatsNotification(payload: NotificationPayload): Promise<void> {
  const { type, webhookUrl, resumeCount, bossCount, template } = payload
  
  console.log(`[DailyStats] Sending notification: type=${type}, webhook=${webhookUrl?.substring(0, 30)}...`)
  
  if (!webhookUrl) {
    throw new Error('Webhook 地址不能为空')
  }
  
  const content = renderTemplate(template, { resumeCount, bossCount })
  console.log('[DailyStats] Rendered content:', content)
  
  if (type === 'feishu') {
    await sendFeishuMessage(webhookUrl, content)
  } else if (type === 'dingtalk') {
    await sendDingtalkMessage(webhookUrl, content)
  } else {
    throw new Error(`不支持的通知类型: ${type}`)
  }
  
  console.log('[DailyStats] Notification sent successfully')
}

/**
 * 执行每日统计推送
 */
async function executeDailyStatsPush(): Promise<void> {
  if (!currentConfig || !currentConfig.dailyStatsNotificationEnabled) {
    console.log('[DailyStats] Push skipped: config not available or disabled')
    return
  }
  
  console.log('[DailyStats] Executing daily stats push at', new Date().toLocaleString())
  console.log('[DailyStats] Current config:', {
    type: currentConfig.dailyStatsNotificationType,
    pushTime: currentConfig.dailyStatsPushTime,
    hasWebhook: !!currentConfig.dailyStatsWebhookUrl
  })
  
  try {
    const { resumeCount, bossCount } = await getTodayStats()
    console.log(`[DailyStats] Today stats: ${resumeCount} resumes, ${bossCount} bosses`)
    
    await sendDailyStatsNotification({
      type: currentConfig.dailyStatsNotificationType,
      webhookUrl: currentConfig.dailyStatsWebhookUrl,
      resumeCount,
      bossCount,
      template: currentConfig.dailyStatsTemplate
    })
    
    console.log(`[DailyStats] Push successful: ${resumeCount} resumes, ${bossCount} bosses`)
  } catch (error) {
    console.error('[DailyStats] Push failed:', error?.message || error)
  }
}

/**
 * 计算下次执行时间（毫秒）
 */
function calculateNextRunTime(pushTime: string): number {
  const now = new Date()
  const [hours, minutes] = pushTime.split(':').map(Number)
  
  let nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0)
  
  // 如果今天的时间已过，设置为明天
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1)
  }
  
  const delay = nextRun.getTime() - now.getTime()
  console.log(`[DailyStats] Next run scheduled at ${nextRun.toLocaleString()}, delay: ${Math.round(delay / 1000 / 60)} minutes`)
  
  return delay
}

/**
 * 设置定时任务
 */
function scheduleDailyTask(pushTime: string): void {
  // 清除现有定时器
  if (dailyStatsTimer) {
    clearTimeout(dailyStatsTimer)
    dailyStatsTimer = null
  }
  
  const delay = calculateNextRunTime(pushTime)
  console.log(`[DailyStats] Next push scheduled in ${Math.round(delay / 1000 / 60)} minutes`)
  
  dailyStatsTimer = setTimeout(async () => {
    await executeDailyStatsPush()
    // 重新设置明天的定时任务
    scheduleDailyTask(pushTime)
  }, delay)
}

/**
 * 设置或更新每日统计通知
 */
export async function setupDailyStatsNotification(config: DailyStatsConfig): Promise<void> {
  currentConfig = config
  
  console.log('[DailyStats] Setting up notification:', {
    enabled: config.dailyStatsNotificationEnabled,
    type: config.dailyStatsNotificationType,
    pushTime: config.dailyStatsPushTime,
    hasWebhook: !!config.dailyStatsWebhookUrl
  })
  
  // 清除现有定时器
  if (dailyStatsTimer) {
    clearTimeout(dailyStatsTimer)
    dailyStatsTimer = null
    console.log('[DailyStats] Cleared existing timer')
  }
  
  if (!config.dailyStatsNotificationEnabled) {
    console.log('[DailyStats] Notification disabled, skipping setup')
    return
  }
  
  if (!config.dailyStatsWebhookUrl) {
    console.log('[DailyStats] No webhook URL configured, skipping setup')
    return
  }
  
  // 设置新的定时任务
  scheduleDailyTask(config.dailyStatsPushTime || '20:00')
  console.log('[DailyStats] Notification scheduled successfully')
}

/**
 * 初始化每日统计通知（应用启动时调用）
 */
export async function initDailyStatsNotification(): Promise<void> {
  try {
    console.log('[DailyStats] Initializing daily stats notification...')
    const config = await readConfigFile('daily-stats-notification.json')
    console.log('[DailyStats] Config loaded:', config ? 'found' : 'not found', config?.dailyStatsNotificationEnabled ? '(enabled)' : '(disabled)')
    
    if (config) {
      await setupDailyStatsNotification(config as DailyStatsConfig)
    } else {
      console.log('[DailyStats] No config found, skipping initialization')
    }
  } catch (error) {
    console.error('[DailyStats] Init error:', error)
  }
}

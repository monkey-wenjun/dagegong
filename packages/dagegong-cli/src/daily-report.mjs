/**
 * 每日投递统计报告
 * 每天 21:00 自动发送飞书汇总
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sendFeishuNotification, sendRichNotification } from './feishu-notifier.mjs';

const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');
const STATS_DIR = CLI_RUNTIME_DIR;
const REPORT_LOCK_FILE = path.join(CLI_RUNTIME_DIR, '.daily-report-sent');

/**
 * 获取今天的日期字符串
 */
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 获取统计文件路径
 */
function getStatsFilePath(date) {
  return path.join(STATS_DIR, `stats-${date}.json`);
}

/**
 * 读取今日统计
 */
function readTodayStats() {
  const today = getTodayStr();
  const statsFile = getStatsFilePath(today);
  
  if (!fs.existsSync(statsFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statsFile, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[DailyReport] 读取统计失败:', err.message);
    return null;
  }
}

/**
 * 读取 AI 回复统计
 */
function readAiReplyStats() {
  const today = getTodayStr();
  const logFile = path.join(CLI_RUNTIME_DIR, 'logs', 'ai-auto-reply.log');
  
  if (!fs.existsSync(logFile)) {
    return { count: 0, rejectCount: 0 };
  }

  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const todayLogs = content.split('\n').filter(line => line.includes(today));
    
    // 统计回复次数
    const replyMatches = todayLogs.filter(line => line.includes('✓ 回复成功'));
    const rejectMatches = todayLogs.filter(line => line.includes('婉拒回复成功'));
    
    return {
      count: replyMatches.length,
      rejectCount: rejectMatches.length
    };
  } catch (err) {
    return { count: 0, rejectCount: 0 };
  }
}

/**
 * 检查今日报告是否已发送
 */
function isTodayReportSent() {
  if (!fs.existsSync(REPORT_LOCK_FILE)) {
    return false;
  }
  
  try {
    const content = fs.readFileSync(REPORT_LOCK_FILE, 'utf8').trim();
    return content === getTodayStr();
  } catch (err) {
    return false;
  }
}

/**
 * 标记今日报告已发送
 */
function markTodayReportSent() {
  try {
    fs.writeFileSync(REPORT_LOCK_FILE, getTodayStr(), 'utf8');
  } catch (err) {
    console.error('[DailyReport] 标记报告状态失败:', err.message);
  }
}

/**
 * 生成并发送每日报告
 */
export async function sendDailyReport(webhookUrl, options = {}) {
  const { force = false, dryRun = false } = options;
  
  // 检查是否已发送（除非强制发送或 dryRun）
  if (!force && !dryRun && isTodayReportSent()) {
    console.log('[DailyReport] 今日报告已发送，跳过');
    return { sent: false, reason: 'already_sent' };
  }

  // 读取统计数据
  const stats = readTodayStats();
  const aiStats = readAiReplyStats();
  
  if (!stats && aiStats.count === 0) {
    console.log('[DailyReport] 今日无数据');
    return { sent: false, reason: 'no_data', stats: null };
  }

  const app = stats?.applications?.[0] || { total: 0, success: 0, failed: 0, details: [] };
  const today = getTodayStr();
  
  // 构建统计数据
  const total = app.total || 0;
  const success = app.success || 0;
  const failed = app.failed || 0;
  const aiCount = aiStats.count || 0;
  const aiReject = aiStats.rejectCount || 0;

  // 如果只是查询统计，不发送
  if (dryRun) {
    return { 
      sent: false, 
      reason: 'dry_run', 
      stats: { total, success, failed, aiCount, aiReject }
    };
  }

  if (!webhookUrl || webhookUrl === 'dummy') {
    return { sent: false, reason: 'no_webhook', stats: { total, success, failed, aiCount, aiReject } };
  }

  let content = `📅 ${today} 投递日报\n\n`;
  content += `📊 投递统计\n`;
  content += `━━━━━━━━━━━━━━\n`;
  content += `总计: ${total} 个职位\n`;
  content += `✅ 成功: ${success}\n`;
  content += `❌ 失败: ${failed}\n\n`;
  
  if (aiCount > 0) {
    content += `🤖 AI 自动回复\n`;
    content += `━━━━━━━━━━━━━━\n`;
    content += `总计: ${aiCount} 条\n`;
    content += `婉拒回复: ${aiReject} 条\n\n`;
  }

  // 添加详细列表（最多显示10个）
  const details = app.details || [];
  if (details.length > 0) {
    content += `📋 投递详情\n`;
    content += `━━━━━━━━━━━━━━\n`;
    
    details.slice(0, 10).forEach((item, index) => {
      const status = item.status === 'success' ? '✅' : '❌';
      const salary = item.salary ? ` (${item.salary})` : '';
      content += `${index + 1}. ${status} ${item.jobName} @ ${item.company}${salary}\n`;
    });
    
    if (details.length > 10) {
      content += `... 还有 ${details.length - 10} 个职位\n`;
    }
  }

  // 发送通知
  try {
    await sendFeishuNotification(webhookUrl, {
      title: `📧 Dagegong 每日投递报告 (${today})`,
      content: content
    });
    
    console.log('[DailyReport] 报告发送成功');
    markTodayReportSent();
    
    return { 
      sent: true, 
      stats: { total, success, failed, aiCount, aiReject }
    };
  } catch (err) {
    console.error('[DailyReport] 发送失败:', err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * 检查是否应该发送报告（每天 21:00）
 */
export function shouldSendReport() {
  const now = new Date();
  const hour = now.getHours();
  
  // 在 21:00-21:59 之间发送
  return hour === 21;
}

/**
 * 运行报告任务（用于定时任务）
 */
export async function runDailyReportTask(webhookUrl) {
  // 如果不是 21 点，不发送
  if (!shouldSendReport()) {
    return { sent: false, reason: 'not_time' };
  }

  return sendDailyReport(webhookUrl);
}

export default { sendDailyReport, shouldSendReport, runDailyReportTask };

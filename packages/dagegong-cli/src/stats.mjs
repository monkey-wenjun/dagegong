/**
 * 统计和定时任务模块
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import cron from 'node-cron';
import { sendRichNotification } from './feishu-notifier.mjs';
import { calculateEffectiveConfig } from './config-mapper.mjs';

const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');

/**
 * 获取统计文件路径
 */
function getStatsFile(date) {
  return path.join(CLI_RUNTIME_DIR, `stats-${date}.json`);
}

/**
 * 读取某天的统计
 */
function readStats(date) {
  const file = getStatsFile(date);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }
  return null;
}

/**
 * 计算统计数据
 */
function calculateStats(statsData) {
  if (!statsData || !statsData.applications) {
    return { total: 0, success: 0, failed: 0, skipped: 0, details: [] };
  }

  let total = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const allDetails = [];

  statsData.applications.forEach(app => {
    total += app.total || 0;
    success += app.success || 0;
    failed += app.failed || 0;
    skipped += app.skipped || 0;
    if (app.details) {
      allDetails.push(...app.details);
    }
  });

  return { total, success, failed, skipped, details: allDetails };
}

/**
 * 显示统计信息
 */
export async function showStats(options) {
  const { today, date, recent } = options;
  
  if (today) {
    // 显示今日统计
    const todayStr = new Date().toISOString().split('T')[0];
    const stats = readStats(todayStr);
    
    console.log(chalk.cyan(`\n📊 ${todayStr} 投递统计\n`));
    
    if (!stats) {
      console.log(chalk.yellow('今日暂无投递记录'));
      return;
    }

    const result = calculateStats(stats);
    
    console.log(`总计职位: ${chalk.cyan(result.total)}`);
    console.log(`${chalk.green('✅ 成功')}: ${result.success}`);
    console.log(`${chalk.red('❌ 失败')}: ${result.failed}`);
    if (result.skipped > 0) {
      console.log(`${chalk.yellow('⚠ 跳过')}: ${result.skipped}`);
    }
    
    if (result.details.length > 0) {
      console.log(chalk.gray('\n投递详情:'));
      result.details.slice(0, 20).forEach((item, i) => {
        const status = item.status === 'success' ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${status} ${item.jobName} @ ${item.company}`);
      });
      
      if (result.details.length > 20) {
        console.log(chalk.gray(`  ... 还有 ${result.details.length - 20} 个职位`));
      }
    }
    console.log('');
    
  } else if (date) {
    // 显示指定日期统计
    const stats = readStats(date);
    
    console.log(chalk.cyan(`\n📊 ${date} 投递统计\n`));
    
    if (!stats) {
      console.log(chalk.yellow('该日期暂无投递记录'));
      return;
    }

    const result = calculateStats(stats);
    
    console.log(`总计职位: ${chalk.cyan(result.total)}`);
    console.log(`${chalk.green('✅ 成功')}: ${result.success}`);
    console.log(`${chalk.red('❌ 失败')}: ${result.failed}`);
    if (result.skipped > 0) {
      console.log(`${chalk.yellow('⚠ 跳过')}: ${result.skipped}`);
    }
    console.log('');
    
  } else if (recent) {
    // 显示最近 N 天统计
    console.log(chalk.cyan(`\n📊 最近 ${recent} 天投递统计\n`));
    
    const dates = [];
    for (let i = 0; i < recent; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    let totalAll = 0;
    let successAll = 0;
    let hasData = false;

    for (const dateStr of dates) {
      const stats = readStats(dateStr);
      if (stats) {
        hasData = true;
        const result = calculateStats(stats);
        totalAll += result.total;
        successAll += result.success;
        
        const indicator = result.total > 0 ? chalk.green('●') : chalk.gray('○');
        console.log(`${indicator} ${dateStr}: ${chalk.cyan(result.total)} 个职位, ${chalk.green(result.success)} 成功${result.skipped > 0 ? `, ${chalk.yellow(result.skipped)} 跳过` : ''}`);
      } else {
        console.log(`${chalk.gray('○')} ${dateStr}: 无记录`);
      }
    }

    if (hasData) {
      console.log(chalk.cyan(`\n总计: ${totalAll} 个职位, ${successAll} 成功投递`));
    } else {
      console.log(chalk.yellow('\n最近无投递记录'));
    }
    console.log('');
  }
}

/**
 * 获取今日统计摘要（用于飞书通知）
 */
export function getTodayStatsSummary() {
  const todayStr = new Date().toISOString().split('T')[0];
  const stats = readStats(todayStr);
  
  if (!stats) {
    return null;
  }

  return calculateStats(stats);
}

/**
 * 启动定时任务
 */
export async function startScheduledTasks(options) {
  const { feishuWebhook } = options;
  
  // 读取 UI 配置获取推送时间
  const effectiveConfig = calculateEffectiveConfig();
  const pushTime = effectiveConfig.dailyStatsPushTime || '21:00';
  const [hour, minute] = pushTime.split(':');
  
  console.log(chalk.cyan('⏰ 定时任务已启动'));
  console.log(chalk.gray(`每日 ${pushTime} 将自动发送投递统计${feishuWebhook ? '到飞书' : ''}`));
  console.log(chalk.gray('按 Ctrl+C 停止\n'));

  // 每天指定时间发送统计
  const cronExpr = `${minute} ${hour} * * *`;
  
  cron.schedule(cronExpr, async () => {
    const now = new Date().toLocaleString();
    console.log(chalk.gray(`[${now}] 执行定时任务...`));
    
    if (!feishuWebhook) {
      console.log(chalk.yellow('未配置飞书 webhook，跳过通知'));
      return;
    }

    const stats = getTodayStatsSummary();
    
    if (!stats || stats.total === 0) {
      console.log(chalk.yellow('今日无投递记录，跳过通知'));
      return;
    }

    try {
      await sendRichNotification(feishuWebhook, {
        title: '📧 Dagegong 今日投递统计',
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        details: stats.details.slice(0, 10)
      });
      console.log(chalk.green('✅ 统计通知已发送'));
    } catch (err) {
      console.error(chalk.red('❌ 发送通知失败:'), err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  // 保持进程运行
  process.stdin.resume();
}

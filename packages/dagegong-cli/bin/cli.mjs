#!/usr/bin/env node

/**
 * Dagegong CLI - 纯命令行版 BOSS 直聘自动投递工具
 * 复用 geek-auto-start-chat-with-boss 核心逻辑
 * 使用 UI 导出的完整配置（含 API 密钥）
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

// ========== 第一步：必须在任何其他导入之前设置环境变量 ==========
const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');
process.env.DAGEGONG_RUNTIME_DIR = CLI_RUNTIME_DIR;

// 确保目录存在
import fs from 'node:fs';
if (!fs.existsSync(CLI_RUNTIME_DIR)) {
  fs.mkdirSync(CLI_RUNTIME_DIR, { recursive: true });
}
const CLI_CONFIG_DIR = path.join(CLI_RUNTIME_DIR, 'config');
if (!fs.existsSync(CLI_CONFIG_DIR)) {
  fs.mkdirSync(CLI_CONFIG_DIR, { recursive: true });
}

// ========== 第二步：现在可以安全地导入其他模块 ==========
import { program } from 'commander';
import chalk from 'chalk';
import { 
  migrateUiConfig, 
  readCliConfig, 
  checkNeedMigration,
  CLI_RUNTIME_DIR as RUNTIME_DIR
} from '../src/config-exporter.mjs';
import { sendFeishuNotification } from '../src/feishu-notifier.mjs';
import { getTodayStatsSummary, showStats } from '../src/stats.mjs';
import { runJobSearch, runJobSearchWithRetry, dryRun } from '../src/job-runner.mjs';
import { testAllAIConfigs, generateGreetingMessage } from '../src/ai-tester.mjs';
import { startLoginFlow } from '../src/login-handler.mjs';
import { getTodayLogs, getRecentStats, log } from '../src/logger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

program
  .name('dagegong-cli')
  .description(chalk.cyan('🔥 Dagegong CLI - BOSS 直聘自动投递工具'))
  .version('1.0.0');

// 初始化/迁移配置
program
  .command('init')
  .description('从 UI 迁移配置到 CLI（包含 API 密钥）')
  .action(async () => {
    console.log(chalk.cyan('\n📝 初始化配置\n'));
    
    try {
      const configFile = await migrateUiConfig();
      console.log(chalk.green(`\n✅ 配置已保存到: ${configFile}`));
      
      const config = readCliConfig();
      const eff = config?.effective;
      
      if (eff?.llmConfig?.[0]?.providerApiSecret) {
        console.log(chalk.gray(`\n🤖 AI 配置:`));
        console.log(chalk.gray(`   提供商: ${eff.llmConfig[0].providerCompleteApiUrl}`));
        console.log(chalk.gray(`   模型: ${eff.llmConfig[0].model}`));
        console.log(chalk.gray(`   API 密钥: ${eff.llmConfig[0].providerApiSecret.substring(0, 10)}...`));
      }
      
      if (eff?.dailyStatsWebhookUrl) {
        console.log(chalk.gray(`\n📱 飞书通知: 已配置`));
      }
      
      console.log(chalk.gray('\n现在可以使用以下命令运行投递:'));
      console.log(chalk.gray('  dagegong-cli config --check'));
      console.log(chalk.gray('  dagegong-cli run\n'));
    } catch (err) {
      console.error(chalk.red('\n❌ 配置迁移失败:'), err.message);
      process.exit(1);
    }
  });

// 检查配置
program
  .command('config')
  .description('查看当前配置')
  .option('-c, --check', '检查配置是否完整（含 API 密钥）')
  .action(async (options) => {
    if (options.check) {
      const needMigration = checkNeedMigration();
      const config = readCliConfig();
      
      console.log(chalk.cyan('\n🔍 配置检查\n'));
      
      if (!config) {
        console.log(chalk.red('❌ 未找到 CLI 配置'));
        if (needMigration) {
          console.log(chalk.yellow('⚠️ 需要从 UI 迁移配置'));
          console.log(chalk.gray('运行: dagegong-cli init\n'));
        }
        return;
      }
      
      console.log(`配置版本: ${config.version || 'unknown'}`);
      console.log(`导出时间: ${config.exportedAt || 'unknown'}`);
      
      const eff = config.effective || {};
      
      // 检查 Cookie
      const hasCookie = eff.cookies && eff.cookies.length > 0;
      console.log(`\n${hasCookie ? chalk.green('✅') : chalk.red('❌')} Cookie: ${hasCookie ? eff.cookies.length + ' 条' : '未配置'}`);
      
      // 检查 AI 配置
      const llm = eff.llmConfig?.[0];
      const hasAI = llm?.providerApiSecret && llm?.providerCompleteApiUrl;
      console.log(`${hasAI ? chalk.green('✅') : chalk.yellow('⚠️')} AI 配置: ${hasAI ? llm.model : '未配置'}`);
      if (hasAI) {
        console.log(chalk.gray(`   API: ${llm.providerCompleteApiUrl}`));
      }
      
      // 检查飞书配置
      const hasWebhook = eff.dailyStatsWebhookUrl;
      console.log(`${hasWebhook ? chalk.green('✅') : chalk.yellow('⚠️')} 飞书通知: ${hasWebhook ? '已配置' : '未配置'}`);
      
      // 职位筛选配置
      console.log(`\n${chalk.cyan('📊 职位筛选配置:')}`);
      console.log(`  职位关键词: ${eff.expectJobNameRegExpStr || '(未设置)'}`);
      console.log(`  职位类型: ${eff.expectJobTypeRegExpStr || '(未设置)'}`);
      console.log(`  目标公司数: ${eff.expectCompanies?.length || 0} 个`);
      console.log(`  期望城市: ${(eff.expectCityList || []).join(', ') || '(未设置)'}`);
      console.log(`  薪资范围: ${eff.expectSalaryLow || '?'} - ${eff.expectSalaryHigh || '?'} k`);
      
      // 功能开关
      console.log(`\n${chalk.cyan('⚙️ 功能开关:')}`);
      console.log(`  打招呼模式: ${['BOSS 默认', '自定义消息', 'AI 生成'][eff.greetingMessageMode]}`);
      console.log(`  自动发送简历: ${eff.autoSendResumeEnabled ? '开启' : '关闭'}`);
      console.log(`  摸鱼模式: ${eff.isSageTimeEnabled ? '开启' : '关闭'}`);
      console.log(`  已读不回复聊: ${eff.autoReminder ? '开启' : '关闭'}`);
      
      // CLI 配置
      const cliCfg = eff.cliConfig || {};
      console.log(`\n${chalk.cyan('📋 CLI 配置:')}`);
      console.log(`  每日投递上限: ${cliCfg.dailyLimit || 150} 个`);
      console.log(`  随机延迟: ${cliCfg.randomDelayMin || 60}-${cliCfg.randomDelayMax || 180} 秒`);
      
      // AI 自动回复配置（从独立配置文件读取）
      const aiModule = await import('../src/ai-auto-reply.mjs');
      const aiCfg = aiModule.default?.getConfig ? aiModule.default.getConfig() : { enabled: false };
      console.log(`\n${chalk.cyan('🤖 AI 自动回复配置:')}`);
      console.log(`  状态: ${aiCfg.enabled ? chalk.green('已启用') : chalk.gray('未启用')}`);
      if (aiCfg.apiUrl) {
        console.log(`  API: ${aiCfg.apiUrl}`);
        console.log(`  API Key: ${aiCfg.apiKey ? aiCfg.apiKey.substring(0, 15) + '...' : chalk.yellow('(未设置)')}`);
        console.log(`  检查间隔: ${(aiCfg.checkInterval || 120000) / 1000} 秒`);
      } else {
        console.log(`  ${chalk.gray('API 未配置')}`);
      }
      
      console.log('');
    }
  });

// 启动自动投递
program
  .command('run')
  .description('启动自动投递（复用 UI 配置和 API 密钥）')
  .option('-l, --limit <number>', '限制投递数量', '0')
  .option('--no-headless', '显示浏览器界面（调试用）')
  .option('--dry-run', '试运行（不实际投递）')
  .option('--retry <number>', '失败重试次数', '3')
  .option('--retry-delay <seconds>', '重试间隔（秒）', '60')
  .action(async (options) => {
    const limit = parseInt(options.limit);
    const maxRetries = parseInt(options.retry);
    const retryDelay = parseInt(options.retryDelay) * 1000;
    
    if (options.dryRun) {
      console.log(chalk.cyan('\n🧪 试运行模式\n'));
      const result = await dryRun();
      console.log('配置预览:', JSON.stringify(result, null, 2));
      return;
    }
    
    // 检查是否已有进程在运行
    const { checkExistingProcess } = await import('../src/process-lock.mjs');
    const existingPid = await checkExistingProcess();
    if (existingPid) {
      console.log(chalk.yellow(`\n⚠️ 检测到已有投递进程在运行 (PID: ${existingPid})`));
      console.log(chalk.gray('   如需重启，请先停止现有进程'));  
      console.log(chalk.gray('   或运行: pkill -f "dagegong-cli"\n'));
      process.exit(1);
    }
    
    console.log(chalk.cyan('\n🔥 启动自动投递\n'));
    
    // 检查是否需要迁移配置
    const needMigration = checkNeedMigration();
    if (needMigration) {
      console.log(chalk.yellow('⚠️ 配置需要更新，正在迁移...'));
      try {
        await migrateUiConfig();
        console.log(chalk.green('✅ 配置迁移完成\n'));
      } catch (err) {
        console.error(chalk.red('❌ 配置迁移失败:'), err.message);
        process.exit(1);
      }
    }
    
    const config = readCliConfig();
    if (!config) {
      console.error(chalk.red('❌ 未找到配置，请先运行: dagegong-cli init'));
      process.exit(1);
    }
    
    const eff = config?.effective;
    
    console.log('📋 当前配置:\n');
    console.log(`  Cookie: ${eff?.cookies?.length || 0} 条`);
    console.log(`  职位关键词: ${eff?.expectJobNameRegExpStr || '(未设置)'}`);
    console.log(`  目标公司: ${eff?.expectCompanies?.length || 0} 个`);
    console.log(`  期望城市: ${(eff?.expectCityList || []).join(', ')}`);
    console.log(`  薪资范围: ${eff?.expectSalaryLow || '?'} - ${eff?.expectSalaryHigh || '?'} k`);
    console.log(`  打招呼模式: ${['BOSS 默认', '自定义消息', 'AI 生成'][eff?.greetingMessageMode]}`);
    console.log(`  AI 模型: ${eff?.llmConfig?.[0]?.model || '未配置'}`);
    console.log(`  失败重试: ${maxRetries} 次, 间隔 ${options.retryDelay} 秒`);
    
    try {
      const result = await runJobSearchWithRetry({
        limit,
        headless: options.headless,
        maxRetries,
        retryDelay,
        onProgress: ({ type, data }) => {
          if (type === 'success') {
            console.log(`✅ 投递成功: ${data.jobName} @ ${data.brandName}`);
          }
        }
      });
      
      if (result.success) {
        console.log(chalk.green('\n✅ 投递完成'));
        console.log(`成功投递: ${result.successCount} 个职位`);
        
        if (result.jobDetails.length > 0) {
          console.log(chalk.gray('\n投递详情:'));
          result.jobDetails.forEach((job, index) => {
            console.log(`  ${index + 1}. ${job.jobName} @ ${job.company} ${job.status === 'success' ? '✅' : '❌'}`);
          });
        }
      }
      
    } catch (err) {
      console.error(chalk.red('\n❌ 投递失败:'), err.message);
      process.exit(1);
    }
  });

// 查看统计
program
  .command('stats')
  .description('查看投递统计')
  .option('-t, --today', '显示今日统计')
  .option('-r, --recent <days>', '显示最近 N 天统计', '7')
  .action(async (options) => {
    await showStats({
      today: options.today,
      recent: parseInt(options.recent)
    });
  });

// 测试飞书通知
program
  .command('test-feishu')
  .description('测试飞书通知')
  .action(async () => {
    const config = readCliConfig();
    const webhook = config?.effective?.dailyStatsWebhookUrl;
    
    if (!webhook) {
      console.error(chalk.red('❌ 未配置飞书 webhook'));
      console.log(chalk.gray('请在 UI 中配置每日统计通知，或运行 dagegong-cli init 迁移配置'));
      process.exit(1);
    }
    
    console.log(chalk.cyan('\n🧪 测试飞书通知\n'));
    console.log(chalk.gray(`Webhook: ${webhook.substring(0, 50)}...\n`));
    
    try {
      await sendFeishuNotification(webhook, {
        title: 'Dagegong CLI 测试消息',
        content: '配置测试成功！\nAPI 密钥和 Webhook 都正常工作。'
      });
      console.log(chalk.green('✅ 发送成功'));
    } catch (err) {
      console.error(chalk.red('❌ 发送失败:'), err.message);
    }
  });

// 测试 AI 配置
program
  .command('test-ai')
  .description('测试 AI API 连接')
  .action(async () => {
    console.log(chalk.cyan('\n🤖 测试 AI API 连接\n'));
    
    try {
      const result = await testAllAIConfigs();
      
      if (result.success) {
        console.log(chalk.green('\n✅ 至少一个 API 配置可用'));
      } else {
        console.log(chalk.red('\n❌ 所有 API 配置都不可用'));
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red('\n❌ 测试失败:'), err.message);
      process.exit(1);
    }
  });

// 生成打招呼消息
program
  .command('generate-greeting')
  .description('使用 AI 生成打招呼消息')
  .argument('<job-name>', '职位名称')
  .argument('<company>', '公司名称')
  .action(async (jobName, company) => {
    console.log(chalk.cyan('\n🤖 生成打招呼消息\n'));
    console.log(`职位: ${jobName}`);
    console.log(`公司: ${company}\n`);
    
    try {
      const message = await generateGreetingMessage(
        { jobName, brandName: company, salaryDesc: '' },
        {}
      );
      
      if (message) {
        console.log(chalk.green('生成的消息:'));
        console.log(message);
      } else {
        console.log(chalk.yellow('未能生成消息，请检查 AI 配置'));
      }
    } catch (err) {
      console.error(chalk.red('❌ 生成失败:'), err.message);
    }
  });

// 登录（Cookie 过期时使用）
program
  .command('login')
  .description('重新登录 BOSS 直聘（Cookie 过期时使用）')
  .option('-f, --force', '强制重新登录（忽略现有 Cookie）')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔐 BOSS 直聘登录\n'));
    
    try {
      const result = await startLoginFlow({
        force: options.force
      });
      
      if (result.skipped) {
        console.log(chalk.green(`\n✅ Cookie 有效（共 ${result.cookieCount} 条）`));
        console.log(chalk.gray('   运行 dagegong-cli login --force 可强制重新登录'));
      } else {
        console.log(chalk.green('\n✅ 登录成功'));
        console.log(`已保存 ${result.cookieCount} 条 Cookie`);
      }
      console.log(chalk.gray('\n现在可以运行: dagegong-cli run'));
      
    } catch (err) {
      console.error(chalk.red('\n❌ 登录失败:'), err.message);
      process.exit(1);
    }
  });

// 查看日志
program
  .command('logs')
  .description('查看运行日志')
  .option('-t, --today', '查看今日日志')
  .option('-s, --stats [days]', '查看最近 N 天统计', '7')
  .action(async (options) => {
    if (options.today) {
      console.log(chalk.cyan('\n📋 今日日志\n'));
      const logs = getTodayLogs();
      if (logs) {
        console.log(logs);
      } else {
        console.log(chalk.gray('今日暂无日志'));
      }
    } else {
      const days = parseInt(options.stats);
      console.log(chalk.cyan(`\n📊 最近 ${days} 天统计\n`));
      
      const stats = getRecentStats(days);
      console.log('日期         | 投递成功 | 登录次数 | 错误次数');
      console.log('-------------|----------|----------|----------');
      stats.forEach(s => {
        console.log(`${s.date} | ${String(s.applies).padStart(8)} | ${String(s.logins).padStart(8)} | ${String(s.errors).padStart(8)}`);
      });
      
      const totalApplies = stats.reduce((sum, s) => sum + s.applies, 0);
      console.log(`\n总计: ${totalApplies} 次投递`);
    }
    console.log('');
  });

// AI 自动回复配置
program
  .command('ai-reply')
  .description('配置 AI 自动回复（使用 Dify API）')
  .option('-e, --enable', '启用 AI 自动回复')
  .option('-d, --disable', '禁用 AI 自动回复')
  .option('--url <url>', '设置 Dify API URL (如: http://192.168.1.29/v1/chat-messages)')
  .option('--key <key>', '设置 Dify API Key')
  .option('--interval <seconds>', '设置检查间隔（秒）', '120')
  .action(async (options) => {
    const aiAutoReplyModule = await import('../src/ai-auto-reply.mjs');
    const { saveConfig, getConfig } = aiAutoReplyModule.default || aiAutoReplyModule;
    
    const currentConfig = getConfig();
    
    // 更新配置
    const updates = {};
    if (options.enable) updates.enabled = true;
    if (options.disable) updates.enabled = false;
    if (options.url) updates.apiUrl = options.url;
    if (options.key) updates.apiKey = options.key;
    if (options.interval) updates.checkInterval = parseInt(options.interval) * 1000;
    
    // 保存配置
    const saved = saveConfig(updates);
    
    if (!saved) {
      console.error(chalk.red('❌ 配置保存失败'));
      process.exit(1);
    }
    
    // 读取最新配置
    const newConfig = getConfig();
    
    console.log(chalk.cyan('\n🤖 AI 自动回复配置\n'));
    console.log(`状态: ${newConfig.enabled ? chalk.green('已启用') : chalk.gray('未启用')}`);
    
    if (newConfig.apiUrl) {
      console.log(`API URL: ${newConfig.apiUrl}`);
      console.log(`API Key: ${newConfig.apiKey ? newConfig.apiKey.substring(0, 15) + '...' : chalk.yellow('(未设置)')}`);
      console.log(`检查间隔: ${(newConfig.checkInterval || 120000) / 1000} 秒`);
    } else {
      console.log(chalk.yellow('\n⚠️ API URL 未设置'));
      console.log(chalk.gray('请运行: dagegong-cli ai-reply --url <url> --key <key>'));
    }
    
    console.log(chalk.green('\n✅ 配置已保存到 ai-auto-reply.json'));
    console.log(chalk.gray('运行 dagegong-cli run 时将自动启动 AI 自动回复服务'));
  });

// AI 自动回复单次检查（调试用）
program
  .command('ai-check')
  .description('单次检查未读消息并回复（调试用）')
  .action(async () => {
    console.log(chalk.cyan('\n🤖 单次检查未读消息\n'));
    console.log(chalk.yellow('注意: 此命令需要在投递过程中运行，或配合 --no-headless 使用'));
    console.log(chalk.gray('建议使用: dagegong-cli run --limit 1 --no-headless\n'));
  });

// AI 自动回复守护进程
program
  .command('ai-daemon')
  .description('AI 自动回复守护进程（持续运行，独立于投递流程）')
  .option('-s, --start', '启动守护进程')
  .option('-t, --stop', '停止守护进程')
  .option('--status', '查看守护进程状态')
  .action(async (options) => {
    const { startAiDaemon, stopAiDaemon, getAiDaemonStatus } = await import('../src/ai-auto-reply-daemon.mjs');
    
    if (options.start) {
      console.log(chalk.cyan('\n🤖 启动 AI 自动回复守护进程\n'));
      const result = await startAiDaemon();
      if (!result.success) {
        console.error(chalk.red(`❌ 启动失败: ${result.reason}`));
        process.exit(1);
      } else {
        console.log(chalk.green(`✅ 守护进程已启动 (PID: ${result.pid})`));
        console.log(chalk.gray('日志: ~/.dagegong-cli/logs/ai-daemon.log'));
      }
    } else if (options.stop) {
      console.log(chalk.cyan('\n🛑 停止 AI 自动回复守护进程\n'));
      const result = stopAiDaemon();
      if (result.success) {
        console.log(chalk.green(`✅ 已停止 (PID: ${result.pid})`));
      } else {
        console.log(chalk.yellow('守护进程未运行'));
      }
    } else if (options.status) {
      const status = getAiDaemonStatus();
      if (status.running) {
        console.log(chalk.green(`✅ 守护进程运行中 (PID: ${status.pid})`));
      } else {
        console.log(chalk.gray('❌ 守护进程未运行'));
      }
    } else {
      console.log(chalk.cyan('\n🤖 AI 自动回复守护进程\n'));
      console.log('用法:');
      console.log('  dagegong-cli ai-daemon --start   启动守护进程');
      console.log('  dagegong-cli ai-daemon --stop    停止守护进程');
      console.log('  dagegong-cli ai-daemon --status  查看状态');
      console.log(chalk.gray('\n守护进程会持续监控未读消息并自动回复，独立于投递流程运行。'));
    }
  });

// 自动发送简历配置
program
  .command('resume')
  .description('配置自动发送简历')
  .option('-e, --enable', '启用自动发送简历')
  .option('-d, --disable', '禁用自动发送简历')
  .option('--label <id>', '使用标签筛选，指定标签ID')
  .option('--label-name <name>', '标签名称', '全部')
  .action(async (options) => {
    const { readCliConfig, saveCliConfig } = await import('../src/config-exporter.mjs');
    
    const config = readCliConfig();
    if (!config) {
      console.error(chalk.red('❌ 未找到配置'));
      process.exit(1);
    }
    
    const eff = config.effective || {};
    const updates = {};
    
    if (options.enable) {
      updates.autoSendResumeEnabled = true;
      console.log(chalk.green('✅ 已启用自动发送简历'));
    }
    
    if (options.disable) {
      updates.autoSendResumeEnabled = false;
      console.log(chalk.gray('❌ 已禁用自动发送简历'));
    }
    
    if (options.label !== undefined) {
      updates.autoSendResumeUseLabelFilter = true;
      updates.autoSendResumeLabelId = parseInt(options.label, 10);
      updates.autoSendResumeLabelName = options.labelName;
      console.log(chalk.cyan(`🏷️ 标签筛选: ${options.labelName} (ID: ${options.label})`));
    }
    
    // 更新配置
    if (Object.keys(updates).length > 0) {
      config.effective = { ...eff, ...updates };
      saveCliConfig(config);
      console.log(chalk.green('\n✅ 配置已保存'));
    } else {
      // 显示当前状态
      console.log(chalk.cyan('\n📋 自动发送简历配置\n'));
      console.log(`状态: ${eff.autoSendResumeEnabled ? chalk.green('已启用') : chalk.gray('未启用')}`);
      if (eff.autoSendResumeEnabled && eff.autoSendResumeUseLabelFilter) {
        console.log(`标签筛选: ${eff.autoSendResumeLabelName || '全部'} (ID: ${eff.autoSendResumeLabelId || 0})`);
      }
      console.log(chalk.gray('\n用法:'));
      console.log('  dagegong-cli resume --enable          启用');
      console.log('  dagegong-cli resume --disable         禁用');
      console.log('  dagegong-cli resume --enable --label 1 --label-name "已投递"');
    }
  });

// 同步 CookieCloud cookies
program
  .command('sync-cookies')
  .description('从 CookieCloud 同步 cookies')
  .option('-s, --server <url>', 'CookieCloud 服务器', 'https://cookies.awen.me')
  .option('-u, --uuid <uuid>', '用户 UUID')
  .option('-p, --password <password>', '端到端密码')
  .action(async (options) => {
    const { syncCookieCloud } = await import('../src/cookiecloud-sync.mjs');
    
    console.log(chalk.cyan('\n🔐 从 CookieCloud 同步 cookies\n'));
    
    // 设置环境变量
    if (options.server) process.env.COOKIECLOUD_SERVER = options.server;
    if (options.uuid) process.env.COOKIECLOUD_UUID = options.uuid;
    if (options.password) process.env.COOKIECLOUD_PASSWORD = options.password;
    
    const result = await syncCookieCloud();
    
    if (result.success) {
      console.log(chalk.green(`\n✅ 同步成功，共 ${result.count} 个 cookies`));
    } else {
      console.log(chalk.red(`\n❌ 同步失败: ${result.reason}`));
      process.exit(1);
    }
  });

// 今日统计
program
  .command('today')
  .description('查看今日投递统计')
  .action(async () => {
    const { sendDailyReport } = await import('../src/daily-report.mjs');
    
    console.log(chalk.cyan('\n📊 今日投递统计\n'));
    
    // 只获取统计，不发送
    const result = await sendDailyReport(null, { dryRun: true });
    
    if (!result.stats) {
      console.log(chalk.gray('今日暂无投递数据'));
    } else {
      const s = result.stats;
      console.log(`📧 投递: ${chalk.green(s.success)}/${s.total} 成功${s.failed > 0 ? chalk.red(` (${s.failed} 失败)`) : ''}`);
      if (s.aiCount > 0) {
        console.log(`🤖 AI回复: ${s.aiCount} 条${s.aiReject > 0 ? ` (婉拒 ${s.aiReject} 条)` : ''}`);
      }
    }
    console.log(chalk.gray('\n详细报告将在每天21:00发送到飞书'));
    console.log('');
  });

program.parse();

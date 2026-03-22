#!/usr/bin/env node

/**
 * Dagegong CLI - 纯命令行版 BOSS 直聘自动投递工具
 * 复用 geek-auto-start-chat-with-boss 核心逻辑
 * 使用 UI 导出的完整配置（含 API 密钥）
 */

import { program } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
  migrateUiConfig, 
  readCliConfig, 
  checkNeedMigration,
  CLI_RUNTIME_DIR 
} from '../src/config-exporter.mjs';
import { sendFeishuNotification } from '../src/feishu-notifier.mjs';
import { getTodayStatsSummary, showStats } from '../src/stats.mjs';
import { runJobSearch, dryRun } from '../src/job-runner.mjs';
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
      const configFile = migrateUiConfig();
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
        console.log(chalk.gray(`   密钥: ${llm.providerApiSecret.substring(0, 15)}...`));
      }
      
      // 检查飞书
      const hasFeishu = !!eff.dailyStatsWebhookUrl;
      console.log(`${hasFeishu ? chalk.green('✅') : chalk.yellow('⚠️')} 飞书通知: ${hasFeishu ? '已配置' : '未配置'}`);
      
      // 职位筛选配置
      console.log(chalk.cyan('\n📊 职位筛选配置:'));
      console.log(`  职位关键词: ${eff.expectJobNameRegExpStr || '(未设置)'}`);
      console.log(`  职位类型: ${eff.expectJobTypeRegExpStr || '(未设置)'}`);
      console.log(`  目标公司: ${(eff.expectCompanies || []).length} 个`);
      console.log(`  期望城市: ${(eff.expectCityList || []).join(', ') || '(未设置)'}`);
      console.log(`  薪资范围: ${eff.expectSalaryLow || '?'} - ${eff.expectSalaryHigh || '?'} k`);
      console.log(`  屏蔽公司: ${(eff.blockCompanyNameRegExpStr || '').substring(0, 50)}...`);
      
      // 功能开关
      console.log(chalk.cyan('\n⚙️ 功能开关:'));
      console.log(`  打招呼模式: ${['BOSS 默认', '自定义消息', 'AI 生成'][eff.greetingMessageMode || 0]}`);
      console.log(`  自动发送简历: ${eff.autoSendResumeEnabled ? '开启' : '关闭'}`);
      console.log(`  摸鱼模式: ${eff.isSageTimeEnabled ? '开启' : '关闭'}`);
      console.log(`  已读不回复聊: ${eff.autoReminder ? '开启' : '关闭'}`);
      
      console.log('');
    } else {
      const config = readCliConfig();
      if (!config) {
        console.log(chalk.yellow('未找到配置，请先运行: dagegong-cli init'));
        return;
      }
      console.log(JSON.stringify(config.effective, null, 2));
    }
  });

// 运行投递任务
program
  .command('run')
  .description('启动自动投递（复用 UI 配置和 API 密钥）')
  .option('-l, --limit <number>', '投递数量限制（0=无限制）', '0')
  .option('--headless', '使用无头模式', true)
  .option('--no-headless', '显示浏览器界面')
  .option('--feishu <webhook>', '指定飞书 webhook（覆盖配置）')
  .option('--dry-run', '只显示配置，不实际运行')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔥 启动自动投递\n'));
    
    // 检查配置
    if (checkNeedMigration()) {
      console.log(chalk.yellow('⚠️ 配置需要更新，正在迁移...'));
      migrateUiConfig();
    }
    
    const config = readCliConfig();
    if (!config) {
      console.error(chalk.red('❌ 未找到配置，请先运行: dagegong-cli init'));
      process.exit(1);
    }
    
    const eff = config.effective;
    
    // 检查 Cookie
    if (!eff.cookies || eff.cookies.length === 0) {
      console.error(chalk.red('❌ 未找到 Cookie，请先使用 UI 应用登录'));
      process.exit(1);
    }
    
    // 显示配置摘要
    console.log(chalk.cyan('📋 当前配置:\n'));
    console.log(`  Cookie: ${eff.cookies.length} 条`);
    console.log(`  职位关键词: ${eff.expectJobNameRegExpStr || eff.expectJobTypeRegExpStr || '未设置'}`);
    console.log(`  目标公司: ${(eff.expectCompanies || []).length} 个`);
    console.log(`  期望城市: ${(eff.expectCityList || []).join(', ') || '未设置'}`);
    console.log(`  薪资范围: ${eff.expectSalaryLow || '?'} - ${eff.expectSalaryHigh || '?'} k`);
    console.log(`  打招呼模式: ${['BOSS 默认', '自定义消息', 'AI 生成'][eff.greetingMessageMode || 0]}`);
    
    if (eff.llmConfig?.[0]?.providerApiSecret) {
      console.log(`  AI 模型: ${eff.llmConfig[0].model}`);
    }
    
    if (options.dryRun) {
      console.log(chalk.yellow('\n⏹️  干运行模式，不实际执行\n'));
      const dryRunResult = await dryRun();
      console.log('干运行结果:', JSON.stringify(dryRunResult, null, 2));
      return;
    }
    
    console.log('');
    
    // 实际运行投递
    try {
      const result = await runJobSearch({
        limit: parseInt(options.limit) || 0,
        headless: options.headless,
        feishuWebhook: options.feishu,
        onProgress: (progress) => {
          // 可以在这里添加实时进度显示
        }
      });
      
      console.log(chalk.green('\n✅ 投递完成'));
      console.log(`成功投递: ${result.successCount} 个职位`);
      
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

program.parse();

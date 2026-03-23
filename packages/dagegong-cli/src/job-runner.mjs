/**
 * 核心投递逻辑
 * 复用 geek-auto-start-chat-with-boss 的 mainLoop
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { SyncHook, AsyncSeriesHook } from 'tapable';
import { readCliConfig, CLI_RUNTIME_DIR } from './config-exporter.mjs';
import { sendFeishuNotification } from './feishu-notifier.mjs';
import { logApply, logApplyStats, logError, logInfo, logCookie } from './logger.mjs';
import { startAiAutoReply } from './ai-auto-reply.mjs';
import fs from 'node:fs';
import os from 'node:os';

/**
 * 更新投递统计文件
 * @param {boolean} success - 是否成功
 * @param {Object} jobInfo - 职位信息
 */
function updateStatsFile(success, jobInfo) {
  const today = new Date().toISOString().split('T')[0];
  const statsFile = path.join(os.homedir(), '.dagegong-cli', `stats-${today}.json`);
  
  let stats = { date: today, applications: [{ total: 0, success: 0, failed: 0, skipped: 0, details: [] }] };
  
  if (fs.existsSync(statsFile)) {
    try {
      stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    } catch (e) {
      // 文件损坏，使用默认值
    }
  }
  
  const app = stats.applications[0];
  app.total++;
  if (success) {
    app.success++;
  } else {
    app.failed++;
  }
  
  app.details.push({
    jobName: jobInfo.jobName || 'Unknown',
    company: jobInfo.brandName || jobInfo.company || 'Unknown',
    salary: jobInfo.salaryDesc || jobInfo.salary || '',
    city: jobInfo.cityName || jobInfo.city || '',
    status: success ? 'success' : 'failed',
    time: new Date().toISOString()
  });
  
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
}

/**
 * 睡眠延迟函数
 * @param {number} ms - 毫秒
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 动态导入 geek-auto-start-chat-with-boss（因为它是 workspace 依赖）
let mainLoop, initPuppeteer, closeBrowserWindow;

try {
  const geekModule = await import('@dagegong/geek-auto-start-chat-with-boss/index.mjs');
  mainLoop = geekModule.mainLoop;
  initPuppeteer = geekModule.initPuppeteer;
  closeBrowserWindow = geekModule.closeBrowserWindow;
} catch (err) {
  console.warn('⚠️ 无法加载 geek-auto-start-chat-with-boss 模块，将使用模拟模式');
  console.warn('   错误:', err.message);
}

/**
 * 创建飞书通知插件
 */
function createFeishuPlugin(webhookUrl) {
  if (!webhookUrl) return null;
  
  let successCount = 0;
  let totalCount = 0;
  let jobDetails = [];
  
  // 辅助函数：安全获取职位信息
  const getJobInfo = (data) => {
    const jobInfo = data?.jobInfo || data || {};
    return {
      jobName: jobInfo.jobName || data?.jobName || '未知职位',
      brandName: data?.brandName || jobInfo.brandName || '未知公司',
      salaryDesc: jobInfo.salaryDesc || data?.salaryDesc || '',
      cityName: jobInfo.cityName || data?.cityName || '',
      areaDistrict: jobInfo.areaDistrict || data?.areaDistrict || '',
      jobType: jobInfo.jobType || data?.jobType || ''
    };
  };
  
  return {
    apply(hooks) {
      // 投递即将开始时
      hooks.newChatWillStartup.tapPromise('FeishuStart', async (positionInfo) => {
        totalCount++;
        const info = getJobInfo(positionInfo);
        console.log(`\n📨 [准备投递 #${totalCount}] ${info.jobName} @ ${info.brandName}`);
        if (info.salaryDesc) {
          console.log(`   💰 薪资: ${info.salaryDesc}`);
        }
      });
      
      // 投递成功时
      hooks.newChatStartup.tapPromise('FeishuSuccess', async (positionInfo, context) => {
        successCount++;
        const info = getJobInfo(positionInfo);
        jobDetails.push({
          jobName: info.jobName,
          company: info.brandName,
          salary: info.salaryDesc,
          status: 'success',
          time: new Date().toISOString()
        });
        
        console.log(`\n✅ [投递成功] ${successCount}. ${info.jobName} @ ${info.brandName}`);
        console.log(`   💰 薪资: ${info.salaryDesc || '未知'}`);
        console.log(`   📍 地点: ${info.cityName} ${info.areaDistrict}`);
        if (info.jobType) {
          console.log(`   🏷️ 类型: ${info.jobType}`);
        }
        
        // 记录投递日志
        logApply(true, info);
        
        // 更新统计文件
        updateStatsFile(true, info);
        
        // 每5个成功投递发送一次进度通知
        if (successCount % 5 === 0) {
          try {
            await sendFeishuNotification(webhookUrl, {
              title: '📧 Dagegong 投递进度',
              content: `已成功投递 ${successCount} 个职位\n最新: ${info.jobName} @ ${info.brandName}`
            });
          } catch (err) {
            console.warn('飞书通知发送失败:', err.message);
          }
        }
      });
      
      // 错误处理
      hooks.errorEncounter.tap('FeishuError', (errorInfo) => {
        console.error('\n❌ [投递错误]', errorInfo);
        
        // 记录错误日志
        if (typeof errorInfo === 'string') {
          logError('投递过程发生错误', { error: errorInfo });
          
          // 检测Cookie过期
          if (errorInfo.includes('LOGIN_STATUS_INVALID') || errorInfo.includes('登录')) {
            console.error('   🔑 检测到登录状态无效，Cookie 可能已过期');
            console.error('   💡 请运行: dagegong-cli login --force');
            logCookie('expired', { error: errorInfo });
          }
        } else if (errorInfo && errorInfo.message) {
          logError('投递过程发生错误', { error: errorInfo.message });
        }
      });
      
      // 获取统计信息
      return {
        getStats: () => ({ successCount, totalCount, jobDetails }),
        reset: () => { successCount = 0; totalCount = 0; jobDetails = []; }
      };
    }
  };
}

/**
 * 创建 hooks 对象（兼容 mainLoop 的要求）
 * @param {Object} config - 配置对象
 */
function createHooks(config = {}) {
  const hooks = {
    daemonInitialized: new AsyncSeriesHook(),
    puppeteerLaunched: new SyncHook(['browser']),
    pageGotten: new SyncHook(['page']),
    pageLoaded: new SyncHook(),
    cookieWillSet: new SyncHook(['cookies']),
    userInfoResponse: new AsyncSeriesHook(['userInfo']),
    mainFlowWillLaunch: new AsyncSeriesHook(['args']),
    newChatWillStartup: new AsyncSeriesHook(['positionInfoDetail']),
    newChatStartup: new AsyncSeriesHook(['positionInfoDetail', 'chatRunningContext']),
    noPositionFoundForCurrentJob: new SyncHook(),
    noPositionFoundAfterTraverseAllJob: new SyncHook(),
    errorEncounter: new SyncHook(['errorInfo']),
    encounterEmptyRecommendJobList: new AsyncSeriesHook(['args']),
    sageTimeEnter: new AsyncSeriesHook(['args']),
    sageTimeExit: new AsyncSeriesHook(['args']),
    jobDetailIsGetFromRecommendList: new AsyncSeriesHook(['jobInfo']),
    jobMarkedAsNotSuit: new AsyncSeriesHook(['jobInfo', 'options'])
  };
  
  // AI 自动回复服务引用
  let aiAutoReplyService = null;
  
  // 在用户信息显示后启动 AI 自动回复服务（此时页面已稳定）
  hooks.userInfoResponse.tapPromise('AiAutoReplyStart', async (userInfo) => {
    if (userInfo?.code !== 0) {
      console.log('[AiAutoReply] 用户未登录，跳过启动');
      return;
    }
    
    const { getConfig, startAiAutoReply } = await import('./ai-auto-reply.mjs');
    const aiConfig = getConfig();
    
    if (aiConfig?.enabled) {
      console.log('[AiAutoReply] 用户已登录，启动 AI 自动回复服务...');
      console.log('[AiAutoReply] 配置状态:', {
        enabled: aiConfig.enabled,
        apiUrl: aiConfig.apiUrl,
        hasApiKey: !!aiConfig.apiKey,
        checkInterval: aiConfig.checkInterval
      });
      
      try {
        aiAutoReplyService = await startAiAutoReply({
          interval: aiConfig.checkInterval || 120000
        });
        if (aiAutoReplyService) {
          console.log('🤖 AI 自动回复服务已启动');
        }
      } catch (err) {
        console.error('[AiAutoReply] 启动失败:', err.message);
      }
    } else {
      console.log('[AiAutoReply] AI 自动回复未启用，跳过启动');
    }
  });
  
  // 添加关键节点日志
  hooks.userInfoResponse.tapPromise('Logger', async (userInfo) => {
    if (userInfo && userInfo.code === 0) {
      console.log('[2/5] ✅ 用户信息获取成功');
    } else {
      console.log('[2/5] ⚠️ 用户信息获取异常:', userInfo?.message || '未知错误');
    }
  });
  
  hooks.jobMarkedAsNotSuit.tapPromise('Logger', async (jobInfo, options) => {
    // 兼容不同的字段结构
    const info = jobInfo?.jobInfo || jobInfo || {};
    const jobName = info.jobName || '未知职位';
    const brandName = jobInfo?.brandName || info.brandName || '未知公司';
    console.log(`\n🚫 [跳过职位] ${jobName} @ ${brandName}`);
    if (options && options.reason) {
      console.log(`   原因: ${options.reason}`);
    }
  });
  
  hooks.encounterEmptyRecommendJobList.tapPromise('Logger', async () => {
    console.log('\n⏳ [等待] 当前推荐列表为空，等待加载更多...');
  });
  
  hooks.sageTimeEnter.tapPromise('Logger', async () => {
    console.log('\n😴 [摸鱼模式] 进入休息状态，暂停投递...');
  });
  
  hooks.sageTimeExit.tapPromise('Logger', async () => {
    console.log('\n☕ [摸鱼模式] 休息结束，恢复投递...');
  });
  
  // 添加 logInfo 和 logError 作为函数（mainLoop 内部直接调用）
  hooks.logInfo = (message) => {
    console.log(`[INFO] ${message}`);
    
    // 检测关键节点
    if (message.includes('daemonInitialized')) {
      console.log('[2/5] ✅ 浏览器守护进程已启动');
    }
    if (message.includes('puppeteerLaunched')) {
      console.log('[2/5] ✅ 浏览器已成功启动');
    }
    if (message.includes('pageGotten')) {
      console.log('[2/5] ✅ 已获取页面实例');
    }
    if (message.includes('pageLoaded')) {
      console.log('[4/5] ✅ 职位页面加载完成');
    }
    if (message.includes('cookieWillSet')) {
      console.log('[3/5] ✅ Cookies 设置完成');
    }
    if (message.includes('mainFlowWillLaunch')) {
      console.log('[5/5] ✅ 准备开始投递流程');
    }
  };
  
  hooks.logError = (message) => {
    console.error(`[ERROR] ${message}`);
    
    // 记录详细错误信息
    if (typeof message === 'string') {
      if (message.includes('Execution context was destroyed')) {
        console.error('   💡 提示: 页面正在导航，等待页面加载完成...');
      }
      if (message.includes('Timeout')) {
        console.error('   💡 提示: 操作超时，可能是网络问题或页面加载缓慢');
      }
      if (message.includes('LOGIN_STATUS_INVALID')) {
        console.error('   💡 提示: Cookie 已过期，请运行: dagegong-cli login');
      }
    }
  };
  
  return hooks;
}

/**
 * 运行投递任务
 * @param {Object} options - 运行选项
 * @returns {Promise<Object>} - 运行结果
 */
export async function runJobSearch(options = {}) {
  let { 
    limit = 0, 
    headless = true,
    feishuWebhook = null,
    onProgress = null 
  } = options;
  
  // 读取配置
  const config = readCliConfig();
  if (!config) {
    throw new Error('未找到 CLI 配置，请先运行: dagegong-cli init');
  }
  
  const eff = config.effective;
  
  // 获取 CLI 配置（每日上限和随机延迟）
  const cliConfig = eff.cliConfig || {};
  const dailyLimit = cliConfig.dailyLimit || 150;
  const randomDelayMin = cliConfig.randomDelayMin || 60;   // 默认最小 60 秒
  const randomDelayMax = cliConfig.randomDelayMax || 180;  // 默认最大 180 秒（3分钟）
  
  // 如果命令行没有指定 limit，使用配置文件中的 dailyLimit
  if (limit === 0) {
    limit = dailyLimit;
    console.log(`📋 使用配置文件中的每日上限: ${limit} 个`);
  }
  
  // 检查核心模块
  if (!mainLoop) {
    throw new Error('geek-auto-start-chat-with-boss 模块未加载，无法运行投递');
  }
  
  // 设置环境变量
  process.env.DAGEGONG_BROWSER_HEADLESS = headless ? '1' : '0';
  process.env.DAGEGONG_RUNTIME_DIR = CLI_RUNTIME_DIR;  // 使用 CLI 配置目录
  
  // 禁用自动发送简历（避免干扰投递流程）
  process.env.DAGEGONG_AUTO_SEND_RESUME_ENABLED = '0';
  
  // 设置每日投递上限
  process.env.DAGEGONG_DAILY_CHAT_LIMIT = String(limit);
  
  // 设置 Chrome 路径
  if (eff.chromeExecutablePath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = eff.chromeExecutablePath;
    console.log(`  - Chrome 路径: ${eff.chromeExecutablePath}`);
  }
  
  console.log('\n🚀 启动自动投递...\n');
  console.log(`配置信息:`);
  console.log(`  - 无头模式: ${headless ? '是' : '否'}`);
  console.log(`  - 投递限制: ${limit} 个/天`);
  console.log(`  - 随机延迟: ${randomDelayMin}-${randomDelayMax} 秒`);
  console.log(`  - 飞书通知: ${feishuWebhook || eff.dailyStatsWebhookUrl ? '已启用' : '未启用'}`);
  console.log(`  - 期望城市: ${(eff.expectCityList || []).join(', ')}`);
  console.log(`  - 薪资范围: ${eff.expectSalaryLow || '?'} - ${eff.expectSalaryHigh || '?'} k`);
  console.log(`  - 职位关键词正则: ${eff.expectJobNameRegExpStr || '(未设置)'}`);
  console.log(`  - 职位类型正则: ${eff.expectJobTypeRegExpStr || '(未设置)'}`);
  console.log(`  - 职位描述正则: ${eff.expectJobDescRegExpStr ? eff.expectJobDescRegExpStr.substring(0, 50) + '...' : '(未设置)'}`);
  console.log(`  - 屏蔽公司正则: ${eff.blockCompanyNameRegExpStr || '(未设置)'}`);
  console.log(`  - 全局屏蔽公司正则: ${eff.globalBlockCompanyNameRegExpStr || '(未设置)'}`);
  console.log(`  - 匹配逻辑: ${eff.jobDetailRegExpMatchLogic === 1 ? 'ALL (全部匹配)' : 'SOME (任一匹配)'}`);
  console.log(`  - 工作目录: ${process.env.DAGEGONG_RUNTIME_DIR}`);
  console.log('');
  
  // 创建 hooks，传入配置以启用 AI 自动回复
  const hooks = createHooks(eff);
  
  // 添加进度回调
  if (onProgress) {
    hooks.newChatStartup.tapPromise('Progress', async (positionInfo) => {
      onProgress({ type: 'success', data: positionInfo });
    });
  }
  
  // 添加投递计数器（用于限制数量）和随机延迟
  let successCount = 0;
  hooks.newChatStartup.tapPromise('LimitCounter', async (positionInfo) => {
    successCount++;
    console.log(`📊 进度: ${successCount}/${limit}`);
    
    // 如果达到限制，停止投递
    if (successCount >= limit) {
      console.log(chalk.yellow(`\n✋ 已达到限制数量 ${limit}`));
      // 设置标记让主循环知道要停止
      process.env.DAGEGONG_SHOULD_STOP = '1';
      return;
    }
    
    // 随机延迟（避免频繁操作被封号）
    const delaySeconds = Math.floor(Math.random() * (randomDelayMax - randomDelayMin + 1) + randomDelayMin);
    const delayMs = delaySeconds * 1000;
    const delayMinutes = Math.floor(delaySeconds / 60);
    const remainingSeconds = delaySeconds % 60;
    
    if (delayMinutes > 0) {
      console.log(chalk.gray(`⏳ 等待 ${delayMinutes} 分 ${remainingSeconds} 秒后继续...`));
    } else {
      console.log(chalk.gray(`⏳ 等待 ${remainingSeconds} 秒后继续...`));
    }
    
    await sleep(delayMs);
  });
  
  // 添加飞书通知插件
  const webhook = feishuWebhook || eff.dailyStatsWebhookUrl;
  let feishuPlugin = null;
  if (webhook) {
    feishuPlugin = createFeishuPlugin(webhook);
    if (feishuPlugin) {
      feishuPlugin.apply(hooks);
      console.log('📱 飞书通知已启用\n');
    }
  }
  
  // 运行主循环
  let result = {
    success: false,
    successCount: 0,
    totalCount: 0,
    jobDetails: [],
    error: null
  };
  
  try {
    console.log('[1/5] 🔄 正在初始化 Puppeteer...');
    await initPuppeteer();
    console.log('[1/5] ✅ Puppeteer 初始化完成');
    
    console.log('[2/5] 🌐 正在启动浏览器...');
    
    console.log('[3/5] 🍪 正在设置 Cookies...');
    
    console.log('[4/5] 📄 正在加载职位页面...');
    console.log('   提示: 如果此处卡住超过 60 秒，可能是：');
    console.log('   1. 页面选择器已过期，需要更新');
    console.log('   2. 网络连接问题');
    console.log('   3. BOSS 直聘页面结构变更');
    
    console.log('[5/5] 🚀 开始投递流程...');
    console.log('');
    
    // 运行主循环（带超时保护）
    const mainLoopPromise = mainLoop(hooks);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('投递流程超时（5分钟），请检查网络或页面选择器')), 5 * 60 * 1000);
    });
    
    await Promise.race([mainLoopPromise, timeoutPromise]);
    
    // 获取统计
    if (feishuPlugin) {
      const stats = feishuPlugin.getStats();
      result.successCount = stats.successCount;
      result.totalCount = stats.totalCount;
      result.jobDetails = stats.jobDetails;
    } else {
      result.successCount = successCount;
    }
    result.success = true;
    
    // 发送完成通知
    if (webhook && result.successCount > 0) {
      try {
        await sendFeishuNotification(webhook, {
          title: '🎉 Dagegong 投递完成',
          content: `本次共投递 ${result.successCount} 个职位\n` +
                   `薪资范围: ${eff.expectSalaryLow || '?'} - ${eff.expectSalaryHigh || '?'} k\n` +
                   `期望城市: ${(eff.expectCityList || []).slice(0, 3).join(', ')}${(eff.expectCityList || []).length > 3 ? '...' : ''}`
        });
      } catch (err) {
        console.warn('完成通知发送失败:', err.message);
      }
    }
    
  } catch (err) {
    result.error = err.message;
    console.error('\n❌ 投递过程出错:', err.message);
    
    // 异常时也要记录已成功投递的数量
    result.successCount = successCount;
    result.totalCount = successCount; // 简化处理，假设都成功
    
    // 发送错误通知（包含已成功数量）
    if (webhook) {
      try {
        await sendFeishuNotification(webhook, {
          title: '⚠️ Dagegong 投递异常',
          content: `错误信息: ${err.message}\n已成功投递: ${successCount} 个职位`
        });
      } catch (e) {
        // 忽略通知错误
      }
    }
    
    // 不抛出异常，让流程正常结束以保存统计
    // throw err;
  } finally {
    // 确保统计被正确记录
    if (result.successCount === 0 && successCount > 0) {
      result.successCount = successCount;
      result.totalCount = successCount;
    }
    
    // 记录投递统计
    logApplyStats(result.totalCount || successCount, result.successCount || successCount, (result.totalCount || successCount) - (result.successCount || successCount));
    
    // 关闭浏览器
    try {
      await closeBrowserWindow();
    } catch (e) {
      // 忽略关闭错误
    }
  }
  
  return result;
}

/**
 * 测试运行（不实际投递）
 */
export async function dryRun() {
  const config = readCliConfig();
  if (!config) {
    throw new Error('未找到配置');
  }
  
  const eff = config.effective;
  
  return {
    cookieCount: (eff.cookies || []).length,
    expectCityList: eff.expectCityList || [],
    expectSalaryLow: eff.expectSalaryLow,
    expectSalaryHigh: eff.expectSalaryHigh,
    jobSourceList: eff.jobSourceList || [],
    greetingMessageMode: eff.greetingMessageMode,
    llmConfig: eff.llmConfig,
    dailyStatsWebhookUrl: eff.dailyStatsWebhookUrl
  };
}

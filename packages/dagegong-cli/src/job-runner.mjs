/**
 * 核心投递逻辑
 * 复用 geek-auto-start-chat-with-boss 的 mainLoop
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SyncHook, AsyncSeriesHook } from 'tapable';
import { readCliConfig, CLI_RUNTIME_DIR } from './config-exporter.mjs';
import { sendFeishuNotification } from './feishu-notifier.mjs';
import { logApply, logApplyStats, logError, logInfo, logCookie } from './logger.mjs';
import fs from 'node:fs';

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
  
  return {
    apply(hooks) {
      // 投递即将开始时
      hooks.newChatWillStartup.tapAsync('FeishuStart', async (positionInfo) => {
        totalCount++;
        console.log(`\n📨 [准备投递 #${totalCount}] ${positionInfo.jobName || '未知职位'} @ ${positionInfo.brandName || '未知公司'}`);
        if (positionInfo.salaryDesc) {
          console.log(`   💰 薪资: ${positionInfo.salaryDesc}`);
        }
      });
      
      // 投递成功时
      hooks.newChatStartup.tapAsync('FeishuSuccess', async (positionInfo, context) => {
        successCount++;
        jobDetails.push({
          jobName: positionInfo.jobName,
          company: positionInfo.brandName,
          salary: positionInfo.salaryDesc,
          status: 'success',
          time: new Date().toISOString()
        });
        
        console.log(`\n✅ [投递成功] ${successCount}. ${positionInfo.jobName} @ ${positionInfo.brandName}`);
        console.log(`   💰 薪资: ${positionInfo.salaryDesc || '未知'}`);
        console.log(`   📍 地点: ${positionInfo.cityName || '未知'} ${positionInfo.areaDistrict || ''}`);
        if (positionInfo.jobType) {
          console.log(`   🏷️ 类型: ${positionInfo.jobType}`);
        }
        
        // 记录投递日志
        logApply(true, positionInfo);
        
        // 每5个成功投递发送一次进度通知
        if (successCount % 5 === 0) {
          try {
            await sendFeishuNotification(webhookUrl, {
              title: '📧 Dagegong 投递进度',
              content: `已成功投递 ${successCount} 个职位\n最新: ${positionInfo.jobName} @ ${positionInfo.brandName}`
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
 */
function createHooks() {
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
  
  // 添加关键节点日志
  hooks.userInfoResponse.tapAsync('Logger', async (userInfo) => {
    if (userInfo && userInfo.code === 0) {
      console.log('[2/5] ✅ 用户信息获取成功');
    } else {
      console.log('[2/5] ⚠️ 用户信息获取异常:', userInfo?.message || '未知错误');
    }
  });
  
  hooks.jobMarkedAsNotSuit.tapAsync('Logger', async (jobInfo, options) => {
    console.log(`\n🚫 [跳过职位] ${jobInfo.jobName || '未知职位'} @ ${jobInfo.brandName || '未知公司'}`);
    if (options && options.reason) {
      console.log(`   原因: ${options.reason}`);
    }
  });
  
  hooks.encounterEmptyRecommendJobList.tapAsync('Logger', async () => {
    console.log('\n⏳ [等待] 当前推荐列表为空，等待加载更多...');
  });
  
  hooks.sageTimeEnter.tapAsync('Logger', async () => {
    console.log('\n😴 [摸鱼模式] 进入休息状态，暂停投递...');
  });
  
  hooks.sageTimeExit.tapAsync('Logger', async () => {
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
  const { 
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
  
  // 检查核心模块
  if (!mainLoop) {
    throw new Error('geek-auto-start-chat-with-boss 模块未加载，无法运行投递');
  }
  
  // 设置环境变量
  process.env.DAGEGONG_BROWSER_HEADLESS = headless ? '1' : '0';
  process.env.DAGEGONG_RUNTIME_DIR = CLI_RUNTIME_DIR;  // 使用 CLI 配置目录
  
  // 禁用自动发送简历（避免干扰投递流程）
  process.env.DAGEGONG_AUTO_SEND_RESUME_ENABLED = '0';
  
  if (limit > 0) {
    process.env.DAGEGONG_DAILY_CHAT_LIMIT = String(limit);
  }
  
  // 设置 Chrome 路径
  if (eff.chromeExecutablePath) {
    process.env.PUPPETEER_EXECUTABLE_PATH = eff.chromeExecutablePath;
    console.log(`  - Chrome 路径: ${eff.chromeExecutablePath}`);
  }
  
  console.log('\n🚀 启动自动投递...\n');
  console.log(`配置信息:`);
  console.log(`  - 无头模式: ${headless ? '是' : '否'}`);
  console.log(`  - 投递限制: ${limit > 0 ? limit : '无限制'}`);
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
  
  // 创建 hooks
  const hooks = createHooks();
  
  // 添加进度回调
  if (onProgress) {
    hooks.newChatStartup.tapAsync('Progress', async (positionInfo) => {
      onProgress({ type: 'success', data: positionInfo });
    });
  }
  
  // 添加投递计数器（用于限制数量）
  let successCount = 0;
  if (limit > 0) {
    hooks.newChatStartup.tapAsync('LimitCounter', async (positionInfo) => {
      successCount++;
      console.log(`📊 进度: ${successCount}/${limit}`);
      if (successCount >= limit) {
        console.log(chalk.yellow(`\n✋ 已达到限制数量 ${limit}`));
        // 设置标记让主循环知道要停止
        process.env.DAGEGONG_SHOULD_STOP = '1';
      }
    });
  }
  
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
    
    // 发送错误通知
    if (webhook) {
      try {
        await sendFeishuNotification(webhook, {
          title: '⚠️ Dagegong 投递异常',
          content: `错误信息: ${err.message}\n已成功投递: ${result.successCount} 个职位`
        });
      } catch (e) {
        // 忽略通知错误
      }
    }
    
    throw err;
  } finally {
    // 记录投递统计
    logApplyStats(result.totalCount, result.successCount, result.totalCount - result.successCount);
    
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

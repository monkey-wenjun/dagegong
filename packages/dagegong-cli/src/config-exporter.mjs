#!/usr/bin/env node

/**
 * UI 配置迁移工具
 * 将 UI 的所有配置文件合并为单个 JSON，供 CLI 使用
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeStorageFile, writeConfigFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs';

const UI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong');
const UI_CONFIG_DIR = path.join(UI_RUNTIME_DIR, 'config');
const UI_STORAGE_DIR = path.join(UI_RUNTIME_DIR, 'storage');
export const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 读取 JSON 文件
 */
function readJson(filePath, defaultValue = null) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`读取文件失败: ${filePath}`, err.message);
  }
  return defaultValue;
}

/**
 * 写入 JSON 文件
 */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * 从 UI 目录读取所有配置并合并
 */
export async function migrateUiConfig() {
  console.log('🔄 正在从 UI 迁移配置...\n');
  
  // 1. 读取 boss.json（主配置）
  const bossConfig = readJson(path.join(UI_CONFIG_DIR, 'boss.json'), {
    combineRecommendJobFilterType: 1,
    anyCombineRecommendJobFilter: {
      cityList: [], salaryList: [], experienceList: [], degreeList: [], scaleList: [], industryList: []
    },
    staticCombineRecommendJobFilterConditions: [],
    isSkipEmptyConditionForCombineRecommendJobFilter: false,
    expectJobNameRegExpStr: "",
    expectJobTypeRegExpStr: "",
    expectJobDescRegExpStr: "",
    jobDetailRegExpMatchLogic: 1,
    jobNotMatchStrategy: 1,
    jobNotActiveStrategy: 1,
    markAsNotActiveSelectedTimeRange: 7,
    expectCityList: [],
    expectCityNotMatchStrategy: 3,
    strategyScopeOptionWhenMarkJobCityNotMatch: 2,
    expectSalaryLow: null,
    expectSalaryHigh: null,
    expectSalaryCalculateWay: 1,
    expectSalaryNotMatchStrategy: 3,
    strategyScopeOptionWhenMarkSalaryNotMatch: 2,
    expectWorkExpList: [],
    expectWorkExpNotMatchStrategy: 3,
    strategyScopeOptionWhenMarkJobWorkExpNotMatch: 2,
    blockCompanyNameRegExpStr: "",
    blockCompanyNameRegMatchStrategy: 3,
    fieldsForUseCommonConfig: {},
    jobSourceList: [{ type: "expect", enabled: true }],
    isSageTimeEnabled: true,
    sageTimeOpTimes: 100,
    sageTimePauseMinute: 15,
    autoRunTimeEnabled: false,
    autoRunStartTime: "10:00",
    autoRunEndTime: "21:00",
    autoRunWeekdays: [1, 2, 3, 4, 5],
    greetingMessage: "",
    greetingMessageMode: 0,
    greetingMessagePrompt: "",
    autoSendResumeEnabled: false,
    autoSendResumeUseLabelFilter: false,
    autoSendResumeLabelId: 0,
    autoSendResumeLabelName: "全部",
    autoReminder: {
      throttleIntervalMinutes: 10,
      rechatLimitDay: 21,
      geminiApiKey: "",
      rechatContentSource: 1,
      recentMessageQuantityForLlm: 8,
      rechatLlmFallback: 1,
      onlyRemindBossWithExpectJobType: true
    }
  });
  
  // 2. 读取 common-job-condition-config.json（全局职位条件）
  const commonConfig = readJson(path.join(UI_CONFIG_DIR, 'common-job-condition-config.json'), {
    expectCityList: [],
    expectJobNameRegExpStr: "",
    expectJobTypeRegExpStr: "",
    expectJobDescRegExpStr: "",
    expectCompanies: [],
    blockCompanyNameRegExpStr: "",
    globalBlockCompanyNameRegExpStr: "",
    jobDetailRegExpMatchLogic: 1,
    expectSalaryCalculateWay: 1,
    expectSalaryLow: null,
    expectSalaryHigh: null
  });
  
  // 3. 读取 llm.json
  const llmConfig = readJson(path.join(UI_CONFIG_DIR, 'llm.json'), [{
    providerCompleteApiUrl: "",
    providerApiSecret: "",
    model: "",
    enabled: true,
    serveWeight: 100,
    _extra: {}
  }]);
  
  // 4. 读取 daily-stats-notification.json
  const dailyStatsConfig = readJson(path.join(UI_CONFIG_DIR, 'daily-stats-notification.json'), {
    dailyStatsNotificationEnabled: false,
    dailyStatsNotificationType: "feishu",
    dailyStatsWebhookUrl: "",
    dailyStatsPushTime: "20:00",
    dailyStatsTemplate: "您今日已投递简历{{resumeCount}}份，与{{bossCount}}位BOSS进行沟通"
  });
  
  // 5. 读取 target-company-list.json
  const targetCompanyList = readJson(path.join(UI_CONFIG_DIR, 'target-company-list.json'), []);
  
  // 6. 读取 dingtalk.json
  const dingtalkConfig = readJson(path.join(UI_CONFIG_DIR, 'dingtalk.json'), {
    groupRobotAccessToken: ""
  });
  
  // 7. 读取 Cookie
  const cookies = readJson(path.join(UI_STORAGE_DIR, 'boss-cookies.json'), []);
  
  // 8. 计算有效配置（处理 fieldsForUseCommonConfig）
  const useCommon = bossConfig.fieldsForUseCommonConfig || {};
  
  const effectiveConfig = {
    // 职位关键词匹配
    expectJobNameRegExpStr: useCommon.jobDetail 
      ? commonConfig.expectJobNameRegExpStr 
      : (bossConfig.expectJobNameRegExpStr || commonConfig.expectJobNameRegExpStr || ""),
    expectJobTypeRegExpStr: useCommon.jobDetail 
      ? commonConfig.expectJobTypeRegExpStr 
      : (bossConfig.expectJobTypeRegExpStr || commonConfig.expectJobTypeRegExpStr || ""),
    expectJobDescRegExpStr: useCommon.jobDetail 
      ? commonConfig.expectJobDescRegExpStr 
      : (bossConfig.expectJobDescRegExpStr || commonConfig.expectJobDescRegExpStr || ""),
    jobDetailRegExpMatchLogic: useCommon.jobDetail 
      ? commonConfig.jobDetailRegExpMatchLogic 
      : (bossConfig.jobDetailRegExpMatchLogic || commonConfig.jobDetailRegExpMatchLogic || 1),
    
    // 公司筛选
    expectCompanies: useCommon.expectCompanies ? commonConfig.expectCompanies : targetCompanyList,
    blockCompanyNameRegExpStr: useCommon.blockCompanyNameRegExpStr 
      ? commonConfig.blockCompanyNameRegExpStr 
      : bossConfig.blockCompanyNameRegExpStr,
    globalBlockCompanyNameRegExpStr: commonConfig.globalBlockCompanyNameRegExpStr || "",
    blockCompanyNameRegMatchStrategy: bossConfig.blockCompanyNameRegMatchStrategy || 3,
    
    // 城市
    expectCityList: useCommon.city ? commonConfig.expectCityList : bossConfig.expectCityList,
    expectCityNotMatchStrategy: bossConfig.expectCityNotMatchStrategy || 3,
    strategyScopeOptionWhenMarkJobCityNotMatch: bossConfig.strategyScopeOptionWhenMarkJobCityNotMatch || 2,
    
    // 薪资
    expectSalaryLow: useCommon.salary ? commonConfig.expectSalaryLow : bossConfig.expectSalaryLow,
    expectSalaryHigh: useCommon.salary ? commonConfig.expectSalaryHigh : bossConfig.expectSalaryHigh,
    expectSalaryCalculateWay: useCommon.salary 
      ? commonConfig.expectSalaryCalculateWay 
      : bossConfig.expectSalaryCalculateWay || 1,
    expectSalaryNotMatchStrategy: bossConfig.expectSalaryNotMatchStrategy || 3,
    strategyScopeOptionWhenMarkSalaryNotMatch: bossConfig.strategyScopeOptionWhenMarkSalaryNotMatch || 2,
    
    // 工作经验
    expectWorkExpList: bossConfig.expectWorkExpList || [],
    expectWorkExpNotMatchStrategy: bossConfig.expectWorkExpNotMatchStrategy || 3,
    strategyScopeOptionWhenMarkJobWorkExpNotMatch: bossConfig.strategyScopeOptionWhenMarkJobWorkExpNotMatch || 2,
    
    // 职位来源
    jobSourceList: bossConfig.jobSourceList || [{ type: "expect", enabled: true }],
    combineRecommendJobFilterType: bossConfig.combineRecommendJobFilterType || 1,
    anyCombineRecommendJobFilter: bossConfig.anyCombineRecommendJobFilter || {
      cityList: [], salaryList: [], experienceList: [], degreeList: [], scaleList: [], industryList: []
    },
    staticCombineRecommendJobFilterConditions: bossConfig.staticCombineRecommendJobFilterConditions || [],
    isSkipEmptyConditionForCombineRecommendJobFilter: bossConfig.isSkipEmptyConditionForCombineRecommendJobFilter || false,
    
    // 策略
    jobNotMatchStrategy: bossConfig.jobNotMatchStrategy || 1,
    jobNotActiveStrategy: bossConfig.jobNotActiveStrategy || 1,
    markAsNotActiveSelectedTimeRange: bossConfig.markAsNotActiveSelectedTimeRange || 7,
    
    // 摸鱼模式
    isSageTimeEnabled: bossConfig.isSageTimeEnabled ?? true,
    sageTimeOpTimes: bossConfig.sageTimeOpTimes || 100,
    sageTimePauseMinute: bossConfig.sageTimePauseMinute || 15,
    
    // 自动运行时间
    autoRunTimeEnabled: bossConfig.autoRunTimeEnabled || false,
    autoRunStartTime: bossConfig.autoRunStartTime || "10:00",
    autoRunEndTime: bossConfig.autoRunEndTime || "21:00",
    autoRunWeekdays: bossConfig.autoRunWeekdays || [1, 2, 3, 4, 5],
    
    // 打招呼消息
    greetingMessage: bossConfig.greetingMessage || "",
    greetingMessageMode: bossConfig.greetingMessageMode || 0,
    greetingMessagePrompt: bossConfig.greetingMessagePrompt || "",
    
    // 自动发送简历
    autoSendResumeEnabled: bossConfig.autoSendResumeEnabled || false,
    autoSendResumeUseLabelFilter: bossConfig.autoSendResumeUseLabelFilter || false,
    autoSendResumeLabelId: bossConfig.autoSendResumeLabelId || 0,
    autoSendResumeLabelName: bossConfig.autoSendResumeLabelName || "全部",
    
    // 已读不回
    autoReminder: bossConfig.autoReminder || {
      throttleIntervalMinutes: 10,
      rechatLimitDay: 21,
      geminiApiKey: "",
      rechatContentSource: 1,
      recentMessageQuantityForLlm: 8,
      rechatLlmFallback: 1,
      onlyRemindBossWithExpectJobType: true
    },
    
    // LLM
    llmConfig: llmConfig,
    
    // 通知
    dailyStatsNotificationEnabled: dailyStatsConfig.dailyStatsNotificationEnabled || false,
    dailyStatsNotificationType: dailyStatsConfig.dailyStatsNotificationType || "feishu",
    dailyStatsWebhookUrl: dailyStatsConfig.dailyStatsWebhookUrl || "",
    dailyStatsPushTime: dailyStatsConfig.dailyStatsPushTime || "20:00",
    dailyStatsTemplate: dailyStatsConfig.dailyStatsTemplate || "您今日已投递简历{{resumeCount}}份，与{{bossCount}}位BOSS进行沟通",
    
    // 钉钉
    dingtalkAccessToken: dingtalkConfig.groupRobotAccessToken || "",
    
    // Chrome 路径（根据操作系统自动检测）
    chromeExecutablePath: (() => {
      const platform = process.platform;
      if (platform === 'win32') {
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (platform === 'darwin') {
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
        // Linux
        return '/usr/bin/google-chrome';
      }
    })(),
    
    // 启动配置
    browserConfig: {
      headless: true,  // 默认无头模式
      args: [
        '--disable-infobars',
        '--window-size=1440,900',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--hide-scrollbars',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--password-store=basic',
        '--use-mock-keychain',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    },
    
    // Cookie
    cookies: cookies
  };
  
  // 9. 构建完整的配置对象
  const fullConfig = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    source: "UI 配置迁移",
    effective: effectiveConfig,
    raw: {
      boss: bossConfig,
      commonJobCondition: commonConfig,
      llm: llmConfig,
      dailyStats: dailyStatsConfig,
      targetCompanies: targetCompanyList,
      dingtalk: dingtalkConfig,
      cookies: cookies
    }
  };
  
  // 10. 保存到 CLI 目录
  ensureDir(CLI_RUNTIME_DIR);
  const outputFile = path.join(CLI_RUNTIME_DIR, 'config.json');
  writeJson(outputFile, fullConfig);
  
  // 11. 同时保存到 geek 模块的 config 目录（供 mainLoop 读取）
  try {
    // 禁用自动发送简历（CLI 模式下不需要）
    const bossConfigForGeek = {
      ...bossConfig,
      autoSendResumeEnabled: false
    };
    await writeConfigFile('boss.json', bossConfigForGeek, { isSync: true });
    await writeConfigFile('common-job-condition-config.json', commonConfig, { isSync: true });
    await writeConfigFile('llm.json', llmConfig, { isSync: true });
    await writeConfigFile('target-company-list.json', targetCompanyList, { isSync: true });
    console.log('✅ 配置已同步到 geek 模块');
  } catch (err) {
    console.warn('⚠️ 同步配置到 geek 模块失败:', err.message);
  }
  
  console.log('✅ 配置迁移完成！');
  console.log(`📁 配置文件: ${outputFile}`);
  console.log(`\n📊 配置摘要:`);
  console.log(`  职位关键词正则: ${effectiveConfig.expectJobNameRegExpStr || '(未设置)'}`);
  console.log(`  职位类型正则: ${effectiveConfig.expectJobTypeRegExpStr || '(未设置)'}`);
  console.log(`  目标公司数: ${effectiveConfig.expectCompanies.length}`);
  console.log(`  期望城市: ${effectiveConfig.expectCityList.join(', ') || '(未设置)'}`);
  console.log(`  薪资范围: ${effectiveConfig.expectSalaryLow || '?'} - ${effectiveConfig.expectSalaryHigh || '?'} k`);
  console.log(`  打招呼模式: ${['BOSS 默认', '自定义消息', 'AI 生成'][effectiveConfig.greetingMessageMode]}`);
  console.log(`  Cookie: ${cookies.length > 0 ? `✅ ${cookies.length} 条` : '❌ 未设置'}`);
  
  return outputFile;
}

/**
 * 读取 CLI 配置
 */
export function readCliConfig() {
  const configFile = path.join(CLI_RUNTIME_DIR, 'config.json');
  if (!fs.existsSync(configFile)) {
    return null;
  }
  return readJson(configFile);
}

/**
 * 检查是否需要迁移
 */
export function checkNeedMigration() {
  const cliConfigFile = path.join(CLI_RUNTIME_DIR, 'config.json');
  
  // 如果 CLI 配置已存在且比 UI 配置新，则不需要迁移
  if (fs.existsSync(cliConfigFile)) {
    const cliConfig = readJson(cliConfigFile);
    if (cliConfig.exportedAt) {
      const cliTime = new Date(cliConfig.exportedAt).getTime();
      
      // 检查 UI 配置是否有更新
      const uiBossConfig = path.join(UI_CONFIG_DIR, 'boss.json');
      if (fs.existsSync(uiBossConfig)) {
        const uiTime = fs.statSync(uiBossConfig).mtime.getTime();
        if (cliTime > uiTime) {
          return false; // CLI 配置比 UI 新，不需要迁移
        }
      }
    }
  }
  
  return true;
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateUiConfig();
}

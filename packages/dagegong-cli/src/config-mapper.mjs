/**
 * UI 配置映射模块
 * 将 UI 的配置文件映射到 CLI 使用
 * 
 * UI 配置文件位置: ~/.dagegong/config/
 * - boss.json - 主配置
 * - common-job-condition-config.json - 全局职位条件
 * - llm.json - AI 模型配置
 * - daily-stats-notification.json - 每日统计通知
 * - dingtalk.json - 钉钉通知
 * - target-company-list.json - 目标公司列表
 * 
 * Storage 文件位置: ~/.dagegong/storage/
 * - boss-cookies.json - Cookie
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// UI 配置目录路径（与 UI 应用共享）
const UI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong');
const UI_CONFIG_DIR = path.join(UI_RUNTIME_DIR, 'config');
const UI_STORAGE_DIR = path.join(UI_RUNTIME_DIR, 'storage');

// CLI 配置目录路径
const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');
const CLI_CONFIG_FILE = path.join(CLI_RUNTIME_DIR, 'cli-config.json');

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
 * 读取 UI 的 boss.json 配置
 */
export function readUiBossConfig() {
  const filePath = path.join(UI_CONFIG_DIR, 'boss.json');
  const defaultConfig = {
    combineRecommendJobFilterType: 1,
    anyCombineRecommendJobFilter: {
      cityList: [],
      salaryList: [],
      experienceList: [],
      degreeList: [],
      scaleList: [],
      industryList: []
    },
    staticCombineRecommendJobFilterConditions: [],
    isSkipEmptyConditionForCombineRecommendJobFilter: false,
    expectJobRegExpStr: "",
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
    jobSourceList: [
      { type: "expect", enabled: true }
    ],
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
  };
  
  return { ...defaultConfig, ...readJson(filePath, {}) };
}

/**
 * 读取 UI 的全局职位条件配置
 */
export function readUiCommonJobConditionConfig() {
  const filePath = path.join(UI_CONFIG_DIR, 'common-job-condition-config.json');
  const defaultConfig = {
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
  };
  
  return { ...defaultConfig, ...readJson(filePath, {}) };
}

/**
 * 读取 UI 的 LLM 配置
 */
export function readUiLlmConfig() {
  const filePath = path.join(UI_CONFIG_DIR, 'llm.json');
  const defaultConfig = [{
    providerCompleteApiUrl: "",
    providerApiSecret: "",
    model: "",
    enabled: true,
    serveWeight: 100,
    _extra: {}
  }];
  
  return readJson(filePath, defaultConfig);
}

/**
 * 读取 UI 的每日统计通知配置
 */
export function readUiDailyStatsConfig() {
  const filePath = path.join(UI_CONFIG_DIR, 'daily-stats-notification.json');
  const defaultConfig = {
    dailyStatsNotificationEnabled: false,
    dailyStatsNotificationType: "feishu",
    dailyStatsWebhookUrl: "",
    dailyStatsPushTime: "20:00",
    dailyStatsTemplate: "您今日已投递简历{{resumeCount}}份，与{{bossCount}}位BOSS进行沟通"
  };
  
  return { ...defaultConfig, ...readJson(filePath, {}) };
}

/**
 * 读取 UI 的 Cookie
 */
export function readUiCookies() {
  const filePath = path.join(UI_STORAGE_DIR, 'boss-cookies.json');
  return readJson(filePath, []);
}

/**
 * 读取 UI 的目标公司列表
 */
export function readUiTargetCompanyList() {
  const filePath = path.join(UI_CONFIG_DIR, 'target-company-list.json');
  return readJson(filePath, []);
}

/**
 * 读取 CLI 专属配置
 */
export function readCliConfig() {
  const defaultConfig = {
    // CLI 专属配置
    cli: {
      defaultKeyword: "运维开发",
      defaultCity: "北京",
      defaultLimit: 100,
      headless: true,
      feishuWebhook: "",
      enableDailyStats: true,
      dailyStatsTime: "21:00"
    },
    // 合并后的有效配置（从 UI 配置计算得出）
    effective: {}
  };
  
  return { ...defaultConfig, ...readJson(CLI_CONFIG_FILE, {}) };
}

/**
 * 保存 CLI 专属配置
 */
export function saveCliConfig(config) {
  ensureDir(CLI_RUNTIME_DIR);
  writeJson(CLI_CONFIG_FILE, config);
}

/**
 * 计算有效配置（合并 UI 配置和 CLI 配置）
 * 
 * 优先级：CLI 配置 > UI boss.json > UI common-job-condition-config.json > 默认值
 */
export function calculateEffectiveConfig() {
  const bossConfig = readUiBossConfig();
  const commonConfig = readUiCommonJobConditionConfig();
  const llmConfig = readUiLlmConfig();
  const dailyStatsConfig = readUiDailyStatsConfig();
  const cliConfig = readCliConfig();
  
  // 判断字段是否使用公共配置
  const useCommon = bossConfig.fieldsForUseCommonConfig || {};
  
  // 合并配置
  const effective = {
    // === 职位关键词匹配 ===
    // 职位名称正则
    expectJobNameRegExpStr: useCommon.jobDetail 
      ? commonConfig.expectJobNameRegExpStr 
      : (bossConfig.expectJobNameRegExpStr || commonConfig.expectJobNameRegExpStr || ""),
    
    // 职位类型正则
    expectJobTypeRegExpStr: useCommon.jobDetail 
      ? commonConfig.expectJobTypeRegExpStr 
      : (bossConfig.expectJobTypeRegExpStr || commonConfig.expectJobTypeRegExpStr || ""),
    
    // 职位描述正则
    expectJobDescRegExpStr: useCommon.jobDetail 
      ? commonConfig.expectJobDescRegExpStr 
      : (bossConfig.expectJobDescRegExpStr || commonConfig.expectJobDescRegExpStr || ""),
    
    // 匹配逻辑：1=ALL(EVERY), 2=ANY(SOME)
    jobDetailRegExpMatchLogic: useCommon.jobDetail 
      ? commonConfig.jobDetailRegExpMatchLogic 
      : (bossConfig.jobDetailRegExpMatchLogic || commonConfig.jobDetailRegExpMatchLogic || 1),
    
    // === 公司筛选 ===
    // 目标公司列表
    expectCompanies: useCommon.expectCompanies 
      ? commonConfig.expectCompanies 
      : (bossConfig.expectCompanies || commonConfig.expectCompanies || []),
    
    // 屏蔽公司正则
    blockCompanyNameRegExpStr: useCommon.blockCompanyNameRegExpStr 
      ? commonConfig.blockCompanyNameRegExpStr 
      : (bossConfig.blockCompanyNameRegExpStr || commonConfig.blockCompanyNameRegExpStr || ""),
    
    // 全局屏蔽公司正则（最高优先级）
    globalBlockCompanyNameRegExpStr: commonConfig.globalBlockCompanyNameRegExpStr || "",
    
    // === 城市 ===
    expectCityList: useCommon.city 
      ? commonConfig.expectCityList 
      : (bossConfig.expectCityList || commonConfig.expectCityList || []),
    expectCityNotMatchStrategy: bossConfig.expectCityNotMatchStrategy || 3,
    strategyScopeOptionWhenMarkJobCityNotMatch: bossConfig.strategyScopeOptionWhenMarkJobCityNotMatch || 2,
    
    // === 薪资 ===
    expectSalaryLow: useCommon.salary 
      ? commonConfig.expectSalaryLow 
      : (bossConfig.expectSalaryLow || commonConfig.expectSalaryLow || null),
    expectSalaryHigh: useCommon.salary 
      ? commonConfig.expectSalaryHigh 
      : (bossConfig.expectSalaryHigh || commonConfig.expectSalaryHigh || null),
    expectSalaryCalculateWay: useCommon.salary 
      ? commonConfig.expectSalaryCalculateWay 
      : (bossConfig.expectSalaryCalculateWay || commonConfig.expectSalaryCalculateWay || 1),
    expectSalaryNotMatchStrategy: bossConfig.expectSalaryNotMatchStrategy || 3,
    strategyScopeOptionWhenMarkSalaryNotMatch: bossConfig.strategyScopeOptionWhenMarkSalaryNotMatch || 2,
    
    // === 工作经验 ===
    expectWorkExpList: bossConfig.expectWorkExpList || [],
    expectWorkExpNotMatchStrategy: bossConfig.expectWorkExpNotMatchStrategy || 3,
    strategyScopeOptionWhenMarkJobWorkExpNotMatch: bossConfig.strategyScopeOptionWhenMarkJobWorkExpNotMatch || 2,
    
    // === 职位来源 ===
    jobSourceList: bossConfig.jobSourceList || [{ type: "expect", enabled: true }],
    combineRecommendJobFilterType: bossConfig.combineRecommendJobFilterType || 1,
    anyCombineRecommendJobFilter: bossConfig.anyCombineRecommendJobFilter || {
      cityList: [], salaryList: [], experienceList: [], degreeList: [], scaleList: [], industryList: []
    },
    staticCombineRecommendJobFilterConditions: bossConfig.staticCombineRecommendJobFilterConditions || [],
    isSkipEmptyConditionForCombineRecommendJobFilter: bossConfig.isSkipEmptyConditionForCombineRecommendJobFilter || false,
    
    // === 策略配置 ===
    jobNotMatchStrategy: bossConfig.jobNotMatchStrategy || 1,
    jobNotActiveStrategy: bossConfig.jobNotActiveStrategy || 1,
    markAsNotActiveSelectedTimeRange: bossConfig.markAsNotActiveSelectedTimeRange || 7,
    blockCompanyNameRegMatchStrategy: bossConfig.blockCompanyNameRegMatchStrategy || 3,
    
    // === 摸鱼模式 ===
    isSageTimeEnabled: bossConfig.isSageTimeEnabled ?? true,
    sageTimeOpTimes: bossConfig.sageTimeOpTimes || 100,
    sageTimePauseMinute: bossConfig.sageTimePauseMinute || 15,
    
    // === 自动运行时间 ===
    autoRunTimeEnabled: bossConfig.autoRunTimeEnabled || false,
    autoRunStartTime: bossConfig.autoRunStartTime || "10:00",
    autoRunEndTime: bossConfig.autoRunEndTime || "21:00",
    autoRunWeekdays: bossConfig.autoRunWeekdays || [1, 2, 3, 4, 5],
    
    // === 打招呼消息 ===
    greetingMessage: bossConfig.greetingMessage || "",
    greetingMessageMode: bossConfig.greetingMessageMode || 0,
    greetingMessagePrompt: bossConfig.greetingMessagePrompt || "",
    
    // === 自动发送简历 ===
    autoSendResumeEnabled: bossConfig.autoSendResumeEnabled || false,
    autoSendResumeUseLabelFilter: bossConfig.autoSendResumeUseLabelFilter || false,
    autoSendResumeLabelId: bossConfig.autoSendResumeLabelId || 0,
    autoSendResumeLabelName: bossConfig.autoSendResumeLabelName || "全部",
    
    // === 已读不回自动复聊 ===
    autoReminder: bossConfig.autoReminder || {
      throttleIntervalMinutes: 10,
      rechatLimitDay: 21,
      geminiApiKey: "",
      rechatContentSource: 1,
      recentMessageQuantityForLlm: 8,
      rechatLlmFallback: 1,
      onlyRemindBossWithExpectJobType: true
    },
    
    // === LLM 配置 ===
    llmConfig: llmConfig,
    
    // === 每日统计通知 ===
    dailyStatsNotificationEnabled: dailyStatsConfig.dailyStatsNotificationEnabled || false,
    dailyStatsNotificationType: dailyStatsConfig.dailyStatsNotificationType || "feishu",
    dailyStatsWebhookUrl: dailyStatsConfig.dailyStatsWebhookUrl || "",
    dailyStatsPushTime: dailyStatsConfig.dailyStatsPushTime || "20:00",
    dailyStatsTemplate: dailyStatsConfig.dailyStatsTemplate || "您今日已投递简历{{resumeCount}}份，与{{bossCount}}位BOSS进行沟通",
    
    // === CLI 专属配置 ===
    cli: cliConfig.cli || {
      defaultKeyword: "运维开发",
      defaultCity: "北京",
      defaultLimit: 100,
      headless: true,
      feishuWebhook: "",
      enableDailyStats: true,
      dailyStatsTime: "21:00"
    }
  };
  
  return effective;
}

/**
 * 检查 UI 配置是否可用
 */
export function checkUiConfigAvailability() {
  const results = {
    hasConfigDir: fs.existsSync(UI_CONFIG_DIR),
    hasBossConfig: fs.existsSync(path.join(UI_CONFIG_DIR, 'boss.json')),
    hasCommonConfig: fs.existsSync(path.join(UI_CONFIG_DIR, 'common-job-condition-config.json')),
    hasLlmConfig: fs.existsSync(path.join(UI_CONFIG_DIR, 'llm.json')),
    hasDailyStatsConfig: fs.existsSync(path.join(UI_CONFIG_DIR, 'daily-stats-notification.json')),
    hasCookies: fs.existsSync(path.join(UI_STORAGE_DIR, 'boss-cookies.json')),
    hasTargetCompanyList: fs.existsSync(path.join(UI_CONFIG_DIR, 'target-company-list.json'))
  };
  
  results.isUiConfigured = results.hasBossConfig && results.hasCookies;
  
  return results;
}

/**
 * 导出所有 UI 配置到 CLI 目录（用于备份或独立运行）
 */
export function exportUiConfigToCli() {
  ensureDir(CLI_RUNTIME_DIR);
  
  const exportData = {
    boss: readUiBossConfig(),
    commonJobCondition: readUiCommonJobConditionConfig(),
    llm: readUiLlmConfig(),
    dailyStats: readUiDailyStatsConfig(),
    targetCompanies: readUiTargetCompanyList(),
    cookies: readUiCookies(),
    exportedAt: new Date().toISOString()
  };
  
  const exportFile = path.join(CLI_RUNTIME_DIR, 'ui-config-export.json');
  writeJson(exportFile, exportData);
  
  return exportFile;
}

/**
 * 打印配置信息（用于调试）
 */
export function printConfigInfo() {
  const availability = checkUiConfigAvailability();
  
  console.log('\n📋 配置状态:\n');
  console.log(`  UI 配置目录: ${availability.hasConfigDir ? '✅' : '❌'} ${UI_CONFIG_DIR}`);
  console.log(`  boss.json: ${availability.hasBossConfig ? '✅' : '❌'}`);
  console.log(`  common-job-condition-config.json: ${availability.hasCommonConfig ? '✅' : '❌'}`);
  console.log(`  llm.json: ${availability.hasLlmConfig ? '✅' : '❌'}`);
  console.log(`  daily-stats-notification.json: ${availability.hasDailyStatsConfig ? '✅' : '❌'}`);
  console.log(`  target-company-list.json: ${availability.hasTargetCompanyList ? '✅' : '❌'}`);
  console.log(`  Cookie: ${availability.hasCookies ? '✅' : '❌'} ${path.join(UI_STORAGE_DIR, 'boss-cookies.json')}`);
  console.log(`  CLI 配置: ${fs.existsSync(CLI_CONFIG_FILE) ? '✅' : '❌'} ${CLI_CONFIG_FILE}`);
  
  if (availability.isUiConfigured) {
    const effective = calculateEffectiveConfig();
    console.log('\n📊 有效配置摘要:\n');
    console.log(`  职位关键词正则: ${effective.expectJobNameRegExpStr || '(未设置)'}`);
    console.log(`  职位类型正则: ${effective.expectJobTypeRegExpStr || '(未设置)'}`);
    console.log(`  目标公司数: ${effective.expectCompanies.length}`);
    console.log(`  期望城市: ${effective.expectCityList.join(', ') || '(未设置)'}`);
    console.log(`  薪资范围: ${effective.expectSalaryLow || '?'} - ${effective.expectSalaryHigh || '?'} k`);
    console.log(`  打招呼模式: ${['BOSS 默认', '自定义消息', 'AI 生成'][effective.greetingMessageMode]}`);
    console.log(`  自动发送简历: ${effective.autoSendResumeEnabled ? '开启' : '关闭'}`);
    console.log(`  摸鱼模式: ${effective.isSageTimeEnabled ? '开启' : '关闭'}`);
  }
  
  console.log('');
}

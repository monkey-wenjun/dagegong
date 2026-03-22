/**
 * 配置管理模块
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';

const CONFIG_DIR = path.join(os.homedir(), '.dagegong-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const COOKIE_FILE = path.join(CONFIG_DIR, 'cookies.json');

const DEFAULT_CONFIG = {
  // BOSS 直聘配置
  boss: {
    cookie: '',
    defaultCity: '北京',
    defaultKeyword: '运维开发',
    defaultLimit: 100
  },
  // Dify AI 配置
  dify: {
    apiUrl: '',
    apiKey: '',
    enabled: false
  },
  // 飞书通知配置
  feishu: {
    webhook: '',
    enabled: false
  },
  // 投递策略配置
  strategy: {
    greetingMessage: '',  // 自定义打招呼语
    useAI: false,         // 是否使用 AI 生成打招呼语
    minSalary: 0,         // 最低薪资要求
    maxSalary: 0,         // 最高薪资要求
    excludeCompanies: [], // 排除的公司列表
    onlyActive: true      // 只投递活跃 BOSS
  }
};

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 读取配置
 */
export function loadConfig() {
  ensureConfigDir();
  
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...config };
  } catch (err) {
    console.error(chalk.red('读取配置失败:'), err.message);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存配置
 */
export function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * 显示当前配置
 */
export async function showConfig() {
  const config = loadConfig();
  
  console.log(chalk.cyan('\n📋 当前配置\n'));
  
  console.log(chalk.yellow('BOSS 直聘配置:'));
  console.log(`  默认城市: ${config.boss.defaultCity}`);
  console.log(`  默认关键词: ${config.boss.defaultKeyword}`);
  console.log(`  默认投递数: ${config.boss.defaultLimit}`);
  console.log(`  Cookie: ${config.boss.cookie ? '已设置' : '未设置'}`);
  
  console.log(chalk.yellow('\nDify AI 配置:'));
  console.log(`  启用: ${config.dify.enabled ? '是' : '否'}`);
  console.log(`  API URL: ${config.dify.apiUrl || '未设置'}`);
  console.log(`  API Key: ${config.dify.apiKey ? '已设置' : '未设置'}`);
  
  console.log(chalk.yellow('\n飞书通知配置:'));
  console.log(`  启用: ${config.feishu.enabled ? '是' : '否'}`);
  console.log(`  Webhook: ${config.feishu.webhook || '未设置'}`);
  
  console.log(chalk.yellow('\n投递策略:'));
  console.log(`  使用 AI: ${config.strategy.useAI ? '是' : '否'}`);
  console.log(`  只投递活跃 BOSS: ${config.strategy.onlyActive ? '是' : '否'}`);
  console.log(`  最低薪资: ${config.strategy.minSalary || '不限'}`);
  console.log(`  最高薪资: ${config.strategy.maxSalary || '不限'}`);
  console.log(`  排除公司数: ${config.strategy.excludeCompanies.length}`);
  
  console.log(chalk.gray(`\n配置文件路径: ${CONFIG_FILE}`));
  console.log(chalk.gray(`Cookie 文件路径: ${COOKIE_FILE}\n`));
}

/**
 * 更新配置
 */
export async function updateConfig(updates) {
  const config = loadConfig();
  
  if (updates.cookie) {
    // Cookie 单独保存
    ensureConfigDir();
    try {
      // 如果是 JSON 字符串，解析后保存
      const cookieData = JSON.parse(updates.cookie);
      fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookieData, null, 2));
      console.log(chalk.green('✅ Cookie 已保存'));
    } catch {
      // 如果不是 JSON，保存为文本
      fs.writeFileSync(COOKIE_FILE, updates.cookie);
      console.log(chalk.green('✅ Cookie 已保存'));
    }
  }
  
  if (updates.difyUrl) {
    config.dify.apiUrl = updates.difyUrl;
    config.dify.enabled = true;
    console.log(chalk.green('✅ Dify API URL 已更新'));
  }
  
  if (updates.difyKey) {
    config.dify.apiKey = updates.difyKey;
    config.dify.enabled = true;
    console.log(chalk.green('✅ Dify API Key 已更新'));
  }
  
  saveConfig(config);
  console.log(chalk.green('\n✅ 配置已保存'));
}

/**
 * 获取 Cookie
 */
export function getCookies() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const content = fs.readFileSync(COOKIE_FILE, 'utf-8');
      try {
        return JSON.parse(content);
      } catch {
        // 如果不是 JSON，可能是单行 Cookie 字符串
        return content.trim();
      }
    }
  } catch (err) {
    console.error('读取 Cookie 失败:', err.message);
  }
  return null;
}

/**
 * 设置 Cookie
 */
export function setCookies(cookies) {
  ensureConfigDir();
  if (typeof cookies === 'string') {
    fs.writeFileSync(COOKIE_FILE, cookies);
  } else {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  }
}

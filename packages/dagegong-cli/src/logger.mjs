/**
 * CLI 日志模块 - 记录登录、投递、错误等事件
 */

import fs from 'node:fs';
import path from 'node:path';
import { CLI_RUNTIME_DIR } from './config-exporter.mjs';

// 日志目录
const LOG_DIR = path.join(CLI_RUNTIME_DIR, 'logs');

// 确保日志目录存在
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// 获取当前日期字符串 (YYYY-MM-DD)
function getDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 获取当前时间字符串 (HH:mm:ss)
function getTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

// 获取完整时间字符串
function getDateTimeStr() {
  return `${getDateStr()} ${getTimeStr()}`;
}

// 日志级别
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  LOGIN: 'LOGIN',
  APPLY: 'APPLY',
  COOKIE: 'COOKIE',
  NOTIFICATION: 'NOTIFY'
};

/**
 * 写入日志
 * @param {string} level - 日志级别
 * @param {string} message - 日志消息
 * @param {Object} details - 详细信息
 */
export function log(level, message, details = null) {
  ensureLogDir();
  
  const timestamp = getDateTimeStr();
  const dateStr = getDateStr();
  
  // 格式化日志行
  let logLine = `[${timestamp}] [${level}] ${message}`;
  
  if (details) {
    if (typeof details === 'object') {
      logLine += '\n  ' + JSON.stringify(details, null, 2).replace(/\n/g, '\n  ');
    } else {
      logLine += ` | ${details}`;
    }
  }
  
  logLine += '\n';
  
  // 写入文件
  const logFile = path.join(LOG_DIR, `${dateStr}.log`);
  fs.appendFileSync(logFile, logLine, 'utf-8');
  
  // 控制台输出（带颜色）
  console.log(logLine.trim());
  
  return logLine;
}

// 便捷方法
export function logInfo(message, details) {
  return log(LOG_LEVELS.INFO, message, details);
}

export function logError(message, details) {
  return log(LOG_LEVELS.ERROR, message, details);
}

export function logWarn(message, details) {
  return log(LOG_LEVELS.WARN, message, details);
}

export function logDebug(message, details) {
  return log(LOG_LEVELS.DEBUG, message, details);
}

/**
 * 记录登录事件
 * @param {boolean} success - 是否成功
 * @param {number} cookieCount - Cookie数量
 * @param {string} error - 错误信息
 */
export function logLogin(success, cookieCount = 0, error = null) {
  if (success) {
    return log(LOG_LEVELS.LOGIN, '用户登录成功', {
      cookieCount,
      timestamp: getDateTimeStr()
    });
  } else {
    return log(LOG_LEVELS.LOGIN, '用户登录失败', {
      error,
      timestamp: getDateTimeStr()
    });
  }
}

/**
 * 记录Cookie相关事件
 * @param {string} event - 事件类型 (expired, refreshed, invalid)
 * @param {Object} details - 详情
 */
export function logCookie(event, details = {}) {
  const eventMap = {
    expired: 'Cookie已过期',
    refreshed: 'Cookie已刷新',
    invalid: 'Cookie无效',
    loaded: 'Cookie已加载'
  };
  
  return log(LOG_LEVELS.COOKIE, eventMap[event] || event, {
    ...details,
    timestamp: getDateTimeStr()
  });
}

/**
 * 记录投递事件
 * @param {boolean} success - 是否成功
 * @param {Object} jobInfo - 职位信息
 * @param {string} message - 消息内容
 * @param {string} error - 错误信息
 */
export function logApply(success, jobInfo = {}, message = null, error = null) {
  const details = {
    company: jobInfo.brandName || jobInfo.company || 'Unknown',
    jobName: jobInfo.jobName || jobInfo.position || 'Unknown',
    salary: jobInfo.salaryDesc || jobInfo.salary || 'Unknown',
    city: jobInfo.cityName || jobInfo.city || 'Unknown',
    timestamp: getDateTimeStr()
  };
  
  if (message) {
    details.message = message;
  }
  
  if (error) {
    details.error = error;
  }
  
  const status = success ? '成功' : '失败';
  return log(LOG_LEVELS.APPLY, `投递${status}`, details);
}

/**
 * 记录投递统计
 * @param {number} total - 总数
 * @param {number} success - 成功数
 * @param {number} failed - 失败数
 */
export function logApplyStats(total, success, failed) {
  return log(LOG_LEVELS.APPLY, '投递统计', {
    total,
    success,
    failed,
    timestamp: getDateTimeStr()
  });
}

/**
 * 记录飞书通知
 * @param {boolean} success - 是否成功
 * @param {string} type - 通知类型
 * @param {string} error - 错误信息
 */
export function logNotification(success, type, error = null) {
  return log(LOG_LEVELS.NOTIFICATION, `飞书通知${success ? '成功' : '失败'}`, {
    type,
    error,
    timestamp: getDateTimeStr()
  });
}

/**
 * 获取今日日志内容
 * @returns {string}
 */
export function getTodayLogs() {
  const logFile = path.join(LOG_DIR, `${getDateStr()}.log`);
  if (fs.existsSync(logFile)) {
    return fs.readFileSync(logFile, 'utf-8');
  }
  return '';
}

/**
 * 获取最近 N 天的日志统计
 * @param {number} days - 天数
 * @returns {Array}
 */
export function getRecentStats(days = 7) {
  const stats = [];
  const now = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const logFile = path.join(LOG_DIR, `${dateStr}.log`);
    
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const applyMatches = content.match(/\[APPLY\] 投递成功/g);
      const loginMatches = content.match(/\[LOGIN\] 用户登录成功/g);
      const errorMatches = content.match(/\[ERROR\]/g);
      
      stats.push({
        date: dateStr,
        applies: applyMatches ? applyMatches.length : 0,
        logins: loginMatches ? loginMatches.length : 0,
        errors: errorMatches ? errorMatches.length : 0
      });
    } else {
      stats.push({
        date: dateStr,
        applies: 0,
        logins: 0,
        errors: 0
      });
    }
  }
  
  return stats.reverse();
}

export default {
  log,
  logInfo,
  logError,
  logWarn,
  logDebug,
  logLogin,
  logCookie,
  logApply,
  logApplyStats,
  logNotification,
  getTodayLogs,
  getRecentStats
};

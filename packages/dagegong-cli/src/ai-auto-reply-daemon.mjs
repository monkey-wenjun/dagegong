/**
 * AI 自动回复守护进程 - 子进程模式
 * 独立于投递流程，使用子进程保持长期运行
 */

import { spawn, fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');
const DAEMON_PID_FILE = path.join(CLI_RUNTIME_DIR, 'ai-daemon.pid');
const DAEMON_LOG_FILE = path.join(CLI_RUNTIME_DIR, 'logs', 'ai-daemon.log');

// 确保日志目录存在
const logDir = path.dirname(DAEMON_LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * 写入守护进程日志
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  fs.appendFileSync(DAEMON_LOG_FILE, logLine);
  console.log(`[AI-Daemon] ${message}`);
}

/**
 * 保存 PID 文件
 */
function savePid(pid) {
  try {
    fs.writeFileSync(DAEMON_PID_FILE, String(pid), 'utf8');
  } catch (err) {
    log('ERROR', `保存 PID 失败: ${err.message}`);
  }
}

/**
 * 读取 PID 文件
 */
function readPid() {
  try {
    if (fs.existsSync(DAEMON_PID_FILE)) {
      const pid = fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim();
      return parseInt(pid, 10);
    }
  } catch (err) {
    // ignore
  }
  return null;
}

/**
 * 清除 PID 文件
 */
function clearPid() {
  try {
    if (fs.existsSync(DAEMON_PID_FILE)) {
      fs.unlinkSync(DAEMON_PID_FILE);
    }
  } catch (err) {
    // ignore
  }
}

/**
 * 检查进程是否存在
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 守护进程主循环
 */
async function daemonMain() {
  log('INFO', '========================================');
  log('INFO', 'AI 自动回复守护进程启动');
  log('INFO', `PID: ${process.pid}`);
  log('INFO', '========================================');

  // 加载配置
  const configPath = path.join(CLI_RUNTIME_DIR, 'config', 'ai-auto-reply.json');
  
  if (!fs.existsSync(configPath)) {
    log('ERROR', 'AI 自动回复配置不存在，请先运行配置命令');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (!config.enabled) {
    log('WARN', 'AI 自动回复未启用，守护进程退出');
    process.exit(0);
  }

  log('INFO', `检查间隔: ${config.checkInterval || 120000}ms`);
  log('INFO', `API URL: ${config.apiUrl}`);
  
  // 尝试从 CookieCloud 同步 cookies
  try {
    const { syncCookieCloud } = await import('./cookiecloud-sync.mjs');
    const syncResult = await syncCookieCloud();
    if (syncResult.success) {
      log('INFO', `从 CookieCloud 同步了 ${syncResult.count} 个 cookies`);
    } else {
      log('WARN', `CookieCloud 同步失败: ${syncResult.reason}`);
    }
  } catch (err) {
    log('WARN', `CookieCloud 同步异常: ${err.message}`);
  }

  // 导入 AI 自动回复模块
  const aiModule = await import('./ai-auto-reply.mjs');
  const checkUnreadOnce = aiModule.checkUnreadOnce;
  const getConfig = aiModule.getConfig;
  
  const geekModule = await import('@dagegong/geek-auto-start-chat-with-boss/index.mjs');
  const initPuppeteer = geekModule.initPuppeteer;
  
  const runtimeUtils = await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs');
  const readStorageFile = runtimeUtils.readStorageFile;

  let browser = null;
  let page = null;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  // 初始化浏览器
  async function initBrowser() {
    try {
      log('INFO', '初始化浏览器...');
      const { puppeteer } = await initPuppeteer();
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      page = await browser.newPage();
      
      // 设置 Cookie
      const cookies = readStorageFile('boss-cookies.json') || [];
      for (const cookie of cookies) {
        await page.setCookie(cookie);
      }
      
      log('INFO', '浏览器初始化成功');
      consecutiveErrors = 0;
      return true;
    } catch (err) {
      log('ERROR', `浏览器初始化失败: ${err.message}`);
      return false;
    }
  }

  // 关闭浏览器
  async function closeBrowser() {
    try {
      if (browser) {
        await browser.close();
        browser = null;
        page = null;
      }
    } catch (err) {
      log('WARN', `关闭浏览器失败: ${err.message}`);
    }
  }

  // 执行检查
  async function doCheck() {
    try {
      if (!page || !browser) {
        const inited = await initBrowser();
        if (!inited) {
          consecutiveErrors++;
          return;
        }
      }

      log('INFO', '开始检查未读消息...');
      const results = await checkUnreadOnce(page);
      
      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        log('INFO', `成功回复 ${successCount} 条消息`);
      } else {
        log('DEBUG', '没有需要回复的消息');
      }
      
      consecutiveErrors = 0;
    } catch (err) {
      log('ERROR', `检查失败: ${err.message}`);
      consecutiveErrors++;
      
      // 如果连续错误过多，重启浏览器
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log('WARN', `连续错误 ${consecutiveErrors} 次，重启浏览器...`);
        await closeBrowser();
        consecutiveErrors = 0;
      }
    }
  }

  // 首次检查
  await doCheck();

  // 定时检查
  const interval = config.checkInterval || 120000;
  const timer = setInterval(doCheck, interval);

  // 优雅退出
  process.on('SIGTERM', async () => {
    log('INFO', '收到 SIGTERM，正在退出...');
    clearInterval(timer);
    await closeBrowser();
    clearPid();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    log('INFO', '收到 SIGINT，正在退出...');
    clearInterval(timer);
    await closeBrowser();
    clearPid();
    process.exit(0);
  });
}

/**
 * 启动守护进程（父进程调用）
 */
export async function startAiDaemon() {
  // 检查是否已有守护进程在运行
  const existingPid = readPid();
  if (existingPid && isProcessRunning(existingPid)) {
    return { success: false, reason: `守护进程已在运行 (PID: ${existingPid})` };
  }

  // 清除旧的 PID 文件
  clearPid();

  // 启动子进程
  const scriptPath = new URL(import.meta.url).pathname;
  
  const child = spawn(process.execPath, [scriptPath, '--daemon'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });

  child.unref();

  // 等待子进程启动
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 检查子进程是否成功启动
  if (isProcessRunning(child.pid)) {
    savePid(child.pid);
    return { success: true, pid: child.pid };
  } else {
    return { success: false, reason: '子进程启动失败' };
  }
}

/**
 * 停止守护进程
 */
export function stopAiDaemon() {
  const pid = readPid();
  
  if (!pid) {
    return { success: false, reason: '未找到守护进程 PID' };
  }

  if (!isProcessRunning(pid)) {
    clearPid();
    return { success: false, reason: '守护进程未运行' };
  }

  try {
    process.kill(pid, 'SIGTERM');
    clearPid();
    return { success: true, pid };
  } catch (err) {
    return { success: false, reason: `停止失败: ${err.message}` };
  }
}

/**
 * 获取守护进程状态
 */
export function getAiDaemonStatus() {
  const pid = readPid();
  
  if (!pid) {
    return { running: false, pid: null };
  }

  if (isProcessRunning(pid)) {
    return { running: true, pid };
  } else {
    clearPid();
    return { running: false, pid: null };
  }
}

// 如果是作为守护进程运行
if (process.argv.includes('--daemon')) {
  daemonMain().catch(err => {
    console.error('守护进程异常:', err);
    clearPid();
    process.exit(1);
  });
}

export default { startAiDaemon, stopAiDaemon, getAiDaemonStatus };

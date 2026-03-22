/**
 * 登录处理模块 - Cookie 过期时重新登录
 * 打开浏览器让用户扫码，自动检测登录成功并收集 Cookie
 */

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import { readCliConfig, CLI_RUNTIME_DIR } from './config-exporter.mjs';
import { writeStorageFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs';
import { initPuppeteer } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs';
import readline from 'node:readline';
import { logLogin, logCookie, logError, logInfo } from './logger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 睡眠函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 检测是否已登录（通过URL和页面元素）
async function checkIsLoggedIn(page) {
  try {
    const currentUrl = page.url();
    
    // 如果不在登录页，可能是已登录
    if (!currentUrl.includes('/web/user/') && !currentUrl.includes('/login')) {
      // 进一步检测页面是否有登录后的元素
      const hasUserInfo = await page.evaluate(() => {
        // 检测 localStorage 中是否有用户信息
        return !!(localStorage.getItem('userInfo') || localStorage.getItem('zp_user_info'));
      }).catch(() => false);
      
      return hasUserInfo || currentUrl.includes('/chat') || currentUrl.includes('/job');
    }
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * 检测 Cookie 是否有效
 * @param {Array} cookies - Cookie 列表
 * @returns {Promise<boolean>}
 */
async function checkCookieValid(cookies) {
  if (!cookies || cookies.length === 0) {
    return false;
  }
  
  console.log('🔍 正在检测 Cookie 有效性...');
  
  // 检测是否有 Boss 直聘的关键 cookie
  const keyCookies = ['wt2', 'wbp', '__zp_stoken__', 'zp_at', 'geekZp', 'lastCity'];
  const foundKeys = keyCookies.filter(name => cookies.some(c => c.name === name && c.value));
  
  if (foundKeys.length < 2) {
    console.log(`   ⚠️ Cookie 关键字段不足 (找到 ${foundKeys.length}/2)`);
    return false;
  }
  
  console.log(`   ✓ Cookie 有效 (包含 ${foundKeys.length} 个关键字段)`);
  return true;
}

/**
 * 主登录流程
 * @param {Object} options - 选项
 * @param {string} options.chromePath - Chrome 路径
 * @param {boolean} options.force - 强制重新登录
 */
export async function startLoginFlow(options = {}) {
  const config = readCliConfig();
  if (!config) {
    throw new Error('未找到 CLI 配置，请先运行: dagegong-cli init');
  }

  const effective = config.effective || {};
  
  // 检测现有 Cookie 是否有效
  if (!options.force && effective.cookies && effective.cookies.length > 0) {
    const isValid = await checkCookieValid(effective.cookies);
    if (isValid) {
      console.log('\n✅ Cookie 仍然有效，无需重新登录');
      console.log(chalk.gray('   如需强制重新登录，请使用 --force 参数'));
      return {
        success: true,
        skipped: true,
        cookies: effective.cookies,
        cookieCount: effective.cookies.length
      };
    }
    console.log('   Cookie 已过期或无效，需要重新登录\n');
  }
  
  // 设置 geek 模块使用 CLI 配置目录
  process.env.DAGEGONG_RUNTIME_DIR = CLI_RUNTIME_DIR;
  
  // 根据操作系统自动检测 Chrome 路径
  const PLATFORM_CHROME_PATHS = {
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    linux: '/usr/bin/google-chrome',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  };
  
  const chromePath = options.chromePath || effective.chromeExecutablePath || PLATFORM_CHROME_PATHS[process.platform];

  console.log('\n🔐 启动登录流程...');
  console.log(`   Chrome: ${chromePath || '使用 puppeteer 内置'}`);
  console.log(`   模式: 有界面（请扫码登录）\n`);

  let browser;
  let page;

  try {
    // 使用 geek 模块的 initPuppeteer 获取配置好的 puppeteer
    const { puppeteer } = await initPuppeteer();
    
    // 启动浏览器（必须有界面）
    const launchOptions = {
      headless: false,
      pipe: true,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-infobars',
        '--window-size=1440,900',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
        '--test-type=ui',
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
    };

    if (chromePath && fs.existsSync(chromePath)) {
      launchOptions.executablePath = chromePath;
    }

    browser = await puppeteer.launch(launchOptions);
    [page] = await browser.pages();

    // 设置视口
    await page.setViewport({ width: 1440, height: 900 });

    // 反检测脚本
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' 
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    });

    // 导航到登录页面
    console.log('📱 正在打开 BOSS 直聘登录页面...');
    await page.goto('https://www.zhipin.com/web/user/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const initialUrl = page.url();
    console.log(`   页面已打开: ${initialUrl}\n`);

    console.log(chalk.cyan('═'.repeat(50)));
    console.log(chalk.cyan('  请使用 BOSS 直聘 APP 扫描二维码'));
    console.log(chalk.cyan('  登录成功后将自动收集数据...'));
    console.log(chalk.cyan('═'.repeat(50)));
    console.log('');

    // 同时监听页面导航和轮询检测登录状态
    let loggedIn = false;
    const loginTimeout = 5 * 60 * 1000; // 5分钟超时
    const startTime = Date.now();
    
    // 设置页面导航监听
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const url = page.url();
        console.log(`   [页面跳转] ${url}`);
        
        if (!url.includes('/web/user/') && !url.includes('/login')) {
          loggedIn = true;
        }
      }
    });

    // 轮询检测登录状态
    console.log('⏳ 等待登录...');
    while (!loggedIn && (Date.now() - startTime) < loginTimeout) {
      // 检测登录状态
      const isLoggedIn = await checkIsLoggedIn(page);
      if (isLoggedIn) {
        loggedIn = true;
        break;
      }
      
      // 显示进度点
      process.stdout.write('.');
      await sleep(2000);
    }
    
    console.log(''); // 换行

    if (!loggedIn) {
      throw new Error('登录超时，请重新尝试');
    }

    console.log('\n✅ 检测到登录成功！');
    
    // 等待页面稳定
    console.log('⏳ 等待页面稳定...');
    await sleep(3000);

    console.log('🍪 正在收集登录数据...');
    
    // 获取当前页面URL
    const finalUrl = page.url();
    console.log(`   当前页面: ${finalUrl}`);
    
    // 获取 cookies
    const cookies = await page.cookies();
    console.log(`   ✓ 获取到 ${cookies.length} 个 cookies`);
    
    // 获取 localStorage
    const localStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        items[key] = localStorage.getItem(key);
      }
      return items;
    });
    console.log(`   ✓ 获取到 ${Object.keys(localStorage).length} 个 localStorage 项`);

    if (cookies.length === 0) {
      throw new Error('未能获取到有效的 Cookie');
    }

    // 格式化为需要的格式
    const formattedCookies = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    }));

    // 更新配置
    config.effective.cookies = formattedCookies;
    config.raw.cookies = formattedCookies;
    
    // 保存到 CLI 配置
    const configPath = path.join(CLI_RUNTIME_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // 同时保存到 geek 模块的存储文件
    await writeStorageFile('boss-cookies.json', formattedCookies, { isJson: true });
    await writeStorageFile('boss-local-storage.json', localStorage, { isJson: true });
    
    console.log(`\n✅ Cookie 已保存 (${formattedCookies.length} 条)`);
    console.log(`   📁 CLI 配置: ${configPath}`);
    console.log(`   📁 Geek 存储: ${CLI_RUNTIME_DIR}`);
    
    // 记录登录日志
    logLogin(true, formattedCookies.length);
    logCookie('refreshed', { 
      cookieCount: formattedCookies.length, 
      localStorageCount: Object.keys(localStorage).length,
      domains: [...new Set(formattedCookies.map(c => c.domain))]
    });
    
    console.log(chalk.green('\n🎉 登录完成！现在可以运行: dagegong-cli run'));

    return {
      success: true,
      cookies: formattedCookies,
      cookieCount: formattedCookies.length,
      localStorage
    };

  } catch (err) {
    logError('登录过程发生错误', { error: err.message, stack: err.stack });
    logLogin(false, 0, err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      console.log('\n🔒 浏览器已关闭');
    }
  }
}

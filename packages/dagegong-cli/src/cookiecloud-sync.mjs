/**
 * CookieCloud 同步模块
 * 从 CookieCloud 服务器获取 cookies 并保存为 BOSS 直聘格式
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLI_RUNTIME_DIR = path.join(os.homedir(), '.dagegong-cli');
const STORAGE_DIR = path.join(CLI_RUNTIME_DIR, 'storage');
const COOKIE_FILE = path.join(STORAGE_DIR, 'boss-cookies.json');
const AI_REPLY_CONFIG_FILE = path.join(CLI_RUNTIME_DIR, 'config', 'ai-auto-reply.json');

// 默认 CookieCloud 配置
const defaultCookieCloudConfig = {
  enabled: false,
  server: 'https://cookies.awen.me',
  uuid: '',
  password: ''
};

/**
 * 读取 CookieCloud 配置
 */
function getCookieCloudConfig() {
  try {
    if (fs.existsSync(AI_REPLY_CONFIG_FILE)) {
      const content = fs.readFileSync(AI_REPLY_CONFIG_FILE, 'utf8');
      const config = JSON.parse(content);
      return { ...defaultCookieCloudConfig, ...(config.cookieCloud || {}) };
    }
  } catch (err) {
    console.error('[CookieCloud] 读取配置失败:', err.message);
  }
  return defaultCookieCloudConfig;
}

/**
 * 保存 CookieCloud 配置
 */
function saveCookieCloudConfig(cookieCloudConfig) {
  try {
    let config = {};
    if (fs.existsSync(AI_REPLY_CONFIG_FILE)) {
      const content = fs.readFileSync(AI_REPLY_CONFIG_FILE, 'utf8');
      config = JSON.parse(content);
    }
    config.cookieCloud = { ...(config.cookieCloud || {}), ...cookieCloudConfig };
    
    const configDir = path.dirname(AI_REPLY_CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(AI_REPLY_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[CookieCloud] 保存配置失败:', err.message);
    return false;
  }
}

/**
 * 解密 CookieCloud 数据 (legacy 模式)
 * @param {string} encrypted - 加密的数据
 * @param {string} password - 密码
 * @returns {Object}
 */
function decryptLegacy(encrypted, password) {
  try {
    // 计算 key: md5(uuid + "-" + password) 取前16位
    const key = crypto.createHash('md5').update(`${COOKIECLOUD_UUID}-${password}`).digest('hex').slice(0, 16);
    
    // 使用 OpenSSL EVP_BytesToKey 方式派生 key 和 iv
    const keyIv = crypto.pbkdf2Sync(key, Buffer.alloc(0), 1, 48, 'md5');
    const derivedKey = keyIv.slice(0, 32);
    const iv = keyIv.slice(32, 48);
    
    // AES-256-CBC 解密
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('[CookieCloud] 解密失败:', err.message);
    return null;
  }
}

/**
 * 从 CookieCloud 获取 cookies
 * @param {Object} config - CookieCloud 配置
 * @returns {Promise<Object>}
 */
async function fetchFromCookieCloud(config) {
  const { server, uuid, password } = config;
  
  if (!uuid || !password) {
    console.error('[CookieCloud] 配置不完整，缺少 UUID 或密码');
    return null;
  }
  
  try {
    const url = `${server}/get/${uuid}?password=${encodeURIComponent(password)}`;
    console.log('[CookieCloud] 正在从服务器获取 cookies...');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // 如果是加密数据，需要解密
    if (data.encrypted) {
      console.log('[CookieCloud] 检测到加密数据，正在解密...');
      return decryptLegacy(data.encrypted, password, uuid);
    }
    
    return data;
  } catch (err) {
    console.error('[CookieCloud] 获取失败:', err.message);
    return null;
  }
}

/**
 * 转换 CookieCloud 格式为 Puppeteer 格式
 * @param {Object} cookieCloudData - CookieCloud 数据
 * @returns {Array}
 */
function convertToPuppeteerFormat(cookieCloudData) {
  const cookies = [];
  
  // CookieCloud 数据结构: { "zhipin.com": [{ name, value, domain, path, secure, httpOnly, expirationDate }] }
  for (const [domain, domainCookies] of Object.entries(cookieCloudData)) {
    if (!Array.isArray(domainCookies)) continue;
    
    for (const cookie of domainCookies) {
      // 只保留 BOSS 直聘相关域名
      if (!domain.includes('zhipin.com') && !domain.includes('bosszhipin')) {
        continue;
      }
      
      cookies.push({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.zhipin.com',
        path: cookie.path || '/',
        expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || 'Lax',
      });
    }
  }
  
  return cookies;
}

/**
 * 保存 cookies 到文件
 * @param {Array} cookies
 */
function saveCookies(cookies) {
  try {
    // 确保目录存在
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf8');
    console.log(`[CookieCloud] 已保存 ${cookies.length} 个 cookies 到 ${COOKIE_FILE}`);
    return true;
  } catch (err) {
    console.error('[CookieCloud] 保存失败:', err.message);
    return false;
  }
}

/**
 * 同步 CookieCloud 到本地
 */
export async function syncCookieCloud() {
  console.log('[CookieCloud] ========================================');
  console.log('[CookieCloud] 开始同步 CookieCloud');
  console.log('[CookieCloud] 服务器:', COOKIECLOUD_SERVER);
  console.log('[CookieCloud] UUID:', COOKIECLOUD_UUID);
  console.log('[CookieCloud] ========================================');
  
  const data = await fetchFromCookieCloud();
  
  if (!data) {
    console.error('[CookieCloud] 同步失败: 无法获取数据');
    return { success: false, reason: 'fetch_failed' };
  }
  
  console.log('[CookieCloud] 获取到数据，域名列表:', Object.keys(data).join(', '));
  
  const cookies = convertToPuppeteerFormat(data);
  
  if (cookies.length === 0) {
    console.warn('[CookieCloud] 警告: 没有找到 BOSS 直聘相关 cookies');
    return { success: false, reason: 'no_boss_cookies' };
  }
  
  console.log(`[CookieCloud] 找到 ${cookies.length} 个 BOSS 直聘 cookies`);
  console.log('[CookieCloud] Cookies:', cookies.map(c => c.name).join(', '));
  
  const saved = saveCookies(cookies);
  
  if (saved) {
    console.log('[CookieCloud] ✅ 同步完成');
    return { success: true, count: cookies.length };
  }
  
  return { success: false, reason: 'save_failed' };
}

/**
 * 检查 cookies 是否有效
 */
export function checkCookies() {
  try {
    if (!fs.existsSync(COOKIE_FILE)) {
      return { valid: false, reason: 'not_found' };
    }
    
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { valid: false, reason: 'empty' };
    }
    
    // 检查是否有过期时间
    const now = Math.floor(Date.now() / 1000);
    const validCookies = cookies.filter(c => c.expires === -1 || c.expires > now);
    
    if (validCookies.length === 0) {
      return { valid: false, reason: 'all_expired', total: cookies.length };
    }
    
    return { 
      valid: true, 
      total: cookies.length, 
      valid: validCookies.length,
      names: validCookies.map(c => c.name)
    };
  } catch (err) {
    return { valid: false, reason: 'error', error: err.message };
  }
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  syncCookieCloud().then(result => {
    if (result.success) {
      console.log('\n✅ 同步成功');
      process.exit(0);
    } else {
      console.log('\n❌ 同步失败:', result.reason);
      process.exit(1);
    }
  });
}

export default { syncCookieCloud, checkCookies };

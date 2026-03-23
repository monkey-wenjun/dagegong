/**
 * 聊天列表和聊天记录调试测试
 */

import { readCliConfig } from './packages/dagegong-cli/src/config-exporter.mjs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

console.log('🔍 聊天数据获取调试测试\n');

const config = readCliConfig();

async function test() {
  const cookies = config?.effective?.cookies;
  
  if (!cookies || cookies.length === 0) {
    console.error('❌ 没有 Cookie，请先登录');
    process.exit(1);
  }

  console.log('📋 配置信息:');
  console.log('  Cookie 数量:', cookies.length);
  console.log('  Chrome 路径:', config.effective.chromeExecutablePath);
  console.log('');

  let browser;
  try {
    console.log('🌐 启动浏览器...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath: config.effective.chromeExecutablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ 浏览器启动成功\n');

    const page = await browser.newPage();
    
    // 设置 Cookie - 先访问域名再设置 cookie
    console.log('🍪 访问 BOSS 直聘域名...');
    await page.goto('https://www.zhipin.com', { waitUntil: 'networkidle0' });
    
    console.log('🍪 设置 Cookie...');
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
      } catch (e) {
        // 忽略错误
      }
    }
    
    const pageCookies = await page.cookies('https://www.zhipin.com');
    console.log('📋 页面 Cookie 数量:', pageCookies.length);
    console.log('');

    // 访问职位页面
    console.log('📄 访问职位页面...');
    await page.goto('https://www.zhipin.com/web/geek/jobs', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    const currentUrl = page.url();
    console.log('📄 当前 URL:', currentUrl);
    console.log('');
    
    if (!currentUrl.includes('zhipin.com')) {
      console.log('⚠️ 页面跳转异常，可能 Cookie 已过期');
      console.log('📄 页面标题:', await page.title());
      const html = await page.content();
      console.log('📄 页面内容:', html.substring(0, 500));
      return;
    }

    // 等待一段时间让页面稳定
    await new Promise(r => setTimeout(r, 3000));

    // 测试: 获取好友列表
    console.log('='.repeat(60));
    console.log('📋 测试: 获取好友列表');
    console.log('='.repeat(60));
    
    const result = await page.evaluate(async () => {
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '100' });
        const url = `https://www.zhipin.com/wapi/zprelation/friend/getGeekFriendList?${params.toString()}`;
        
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'x-requested-with': 'XMLHttpRequest'
          },
          credentials: 'include'
        });
        
        const data = await res.json();
        return { success: true, status: res.status, data };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    console.log('');
    if (result.success) {
      console.log('📊 响应状态:', result.status);
      console.log('📊 响应 code:', result.data.code);
      
      if (result.data.code === 0) {
        const friendList = result.data.zpData?.friendList || result.data.zpData?.list || [];
        console.log(`\n👥 好友数量: ${friendList.length}`);
        
        if (friendList.length > 0) {
          console.log('\n📋 前5个好友:');
          friendList.slice(0, 5).forEach((f, i) => {
            console.log(`\n[${i + 1}] ${f.name || '未知'} @ ${f.brandName || '未知公司'}`);
            console.log(`    职位: ${f.jobName || '未知'}`);
            console.log(`    BOSS ID: ${f.encryptBossId?.substring(0, 15)}...`);
            console.log(`    未读数: ${f.unreadCount || 0}`);
            console.log(`    最后消息: ${f.lastText?.substring(0, 40) || '无'}`);
            console.log(`    是否自己发送: ${f.lastIsSelf}`);
          });
        }
      } else {
        console.log('❌ API 返回错误:', result.data.message);
      }
    } else {
      console.log('❌ 请求失败:', result.error);
    }

  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    console.error(err.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✅ 浏览器已关闭');
    }
  }
}

test().catch(console.error);

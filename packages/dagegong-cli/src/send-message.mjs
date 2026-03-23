/**
 * 发送消息到指定BOSS
 * 正确流程：打开聊天页 -> 搜索 -> 点击结果 -> 输入 -> 发送
 */

import { initPuppeteer } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs';
import { readStorageFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs';

export async function sendMessage(encryptBossId, encryptJobId, securityId, message, bossName, jobName, lastMessageText, brandName) {
  console.log('[SendReply] ====== 开始发送消息 ======');
  console.log('[SendReply] BOSS:', bossName, '| 公司:', brandName, '| 职位:', jobName);
  console.log('[SendReply] brandName类型:', typeof brandName, '值:', brandName);
  console.log('[SendReply] 消息:', message.substring(0, 50));
  
  const { puppeteer } = await initPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    
    // 1. 设置Cookie
    console.log('[SendReply] 1. 设置Cookie...');
    const cookies = readStorageFile('boss-cookies.json') || [];
    for (const cookie of cookies) {
      await page.setCookie(cookie);
    }
    
    // 2. 打开聊天页面
    console.log('[SendReply] 2. 打开聊天页面...');
    await page.goto('https://www.zhipin.com/web/geek/chat', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await new Promise(r => setTimeout(r, 3000));
    
    // 3. 点击搜索框并输入
    console.log('[SendReply] 3. 搜索BOSS:', bossName);
    const searchInput = await page.$('input[placeholder*="搜索"]');
    if (!searchInput) {
      throw new Error('未找到搜索框');
    }
    
    await searchInput.click();
    await searchInput.type(bossName, { delay: 100 });
    await new Promise(r => setTimeout(r, 2000));
    
    // 4. 获取并分析搜索结果
    console.log('[SendReply] 4. 分析搜索结果...');
    console.log('[SendReply] 目标: 名字="' + bossName + '", 公司="' + brandName + '"');
    const searchResults = await page.evaluate((targetName, targetCompany) => {
      const results = [];
      const items = document.querySelectorAll('.boss-search-result .search-list, .search-result li, [class*="search"] li');
      
      items.forEach((item, i) => {
        const text = item.textContent?.trim() || '';
        const hasName = text.includes(targetName);
        const hasCompany = targetCompany && text.includes(targetCompany);
        results.push({ index: i, text: text.substring(0, 100), hasName, hasCompany });
      });
      
      return results;
    }, bossName, brandName);
    
    console.log('[SendReply] 搜索结果:', JSON.stringify(searchResults, null, 2));
    
    // 5. 点击最佳匹配（用公司名+人名匹配）
    console.log('[SendReply] 5. 点击匹配项...');
    const clicked = await page.evaluate((targetName, targetCompany) => {
      const items = document.querySelectorAll('.boss-search-result .search-list, .search-result li, [class*="search"] li');
      
      // 优先找名字和公司都匹配的
      for (const item of items) {
        const text = item.textContent || '';
        const nameMatch = text.includes(targetName);
        const companyMatch = targetCompany && text.includes(targetCompany);
        
        if (nameMatch && companyMatch) {
          item.click();
          return { success: true, match: 'both', text: text.substring(0, 50) };
        }
      }
      
      // 其次找名字匹配的
      for (const item of items) {
        const text = item.textContent || '';
        if (text.includes(targetName)) {
          item.click();
          return { success: true, match: 'name', text: text.substring(0, 50) };
        }
      }
      
      // 最后点击第一个
      if (items.length > 0) {
        items[0].click();
        return { success: true, match: 'first', text: items[0].textContent?.substring(0, 50) };
      }
      
      return { success: false };
    }, bossName, brandName);
    
    console.log('[SendReply] 点击结果:', clicked);
    if (!clicked.success) {
      throw new Error('未能点击搜索结果');
    }
    
    // 6. 等待对话框加载并验证历史
    console.log('[SendReply] 6. 等待对话框加载...');
    await new Promise(r => setTimeout(r, 3000));
    
    // 7. 等待消息列表加载并验证
    console.log('[SendReply] 7. 等待消息列表并验证...');
    await new Promise(r => setTimeout(r, 3000));
    
    // 检查最后一条消息是谁发的
    const lastMsgCheck = await page.evaluate(() => {
      const messages = document.querySelectorAll('.message-list .message, .chat-messages .message');
      if (messages.length === 0) return { hasMessages: false };
      
      const lastMsg = messages[messages.length - 1];
      const text = lastMsg.textContent?.trim().substring(0, 50);
      // 检查是否是自己发的（有特定的 class 或属性）
      const isSelf = lastMsg.classList.contains('self') || 
                     lastMsg.classList.contains('sent') || 
                     lastMsg.classList.contains('me');
      const isOther = lastMsg.classList.contains('other') || 
                      lastMsg.classList.contains('received');
      
      return { 
        hasMessages: true, 
        text, 
        isSelf, 
        isOther,
        classList: Array.from(lastMsg.classList).join(' ')
      };
    });
    
    console.log('[SendReply] 最后一条消息:', JSON.stringify(lastMsgCheck));
    
    // 如果最后一条是自己发的，说明已经回复过了
    if (lastMsgCheck.isSelf) {
      console.log('[SendReply] ⚠️ 最后一条是自己发的，可能已回复过，跳过');
      return false;
    }
    
    // 8. 输入消息
    console.log('[SendReply] 8. 输入消息...');
    const chatInput = await page.$('.chat-editor [contenteditable="true"], .chat-input');
    if (!chatInput) {
      throw new Error('未找到输入框');
    }
    
    await chatInput.click();
    await chatInput.type(message, { delay: 50 });
    await new Promise(r => setTimeout(r, 1000));
    
    // 9. 发送
    console.log('[SendReply] 9. 发送消息...');
    const sendBtn = await page.$('.chat-editor .btn-send, .btn-send:not(.disabled)');
    if (sendBtn) {
      await sendBtn.click();
      console.log('[SendReply] ✅ 已点击发送');
    } else {
      await page.keyboard.press('Enter');
      console.log('[SendReply] ✅ 已按回车发送');
    }
    
    await new Promise(r => setTimeout(r, 3000));
    console.log('[SendReply] ====== 发送成功 ======');
    return true;
    
  } catch (err) {
    console.error('[SendReply] ====== 发送失败 ======');
    console.error('[SendReply] 错误:', err.message);
    return false;
  } finally {
    await browser.close();
  }
}

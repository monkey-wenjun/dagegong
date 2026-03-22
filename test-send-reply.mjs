/**
 * AI 自动回复发送测试脚本
 * 单独测试能否正确打开 BOSS 聊天页面并发送消息
 * 
 * 使用方法：
 * 1. 确保已经配置好 BOSS Cookie
 * 2. 运行：node test-send-reply.mjs
 */

import { initPuppeteer } from '@dagegong/geek-auto-start-chat-with-boss/index.mjs'
import { readStorageFile, getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { getAnyAvailablePuppeteerExecutable } from './packages/ui/src/main/flow/DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
import sqlite3 from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// 创建 debug 目录
const debugDir = path.join(process.env.APPDATA || process.env.HOME, '.dagegong', 'debug')
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true })
}

console.log('========== AI 自动回复发送测试 ==========\n')

// 从数据库获取一个测试目标（有未读消息的 BOSS）
function getTestTarget() {
  const dbPath = getPublicDbFilePath()
  console.log('[Test] 数据库路径:', dbPath)
  
  const db = sqlite3(dbPath)
  
  // 查找有未读消息的 BOSS
  const result = db.prepare(`
    SELECT encryptBossId, encryptJobId, bossName, lastText, unreadCount, encryptUserId
    FROM v_boss_chat_relation 
    WHERE unreadCount > 0
    ORDER BY updateTime DESC
    LIMIT 1
  `).get()
  
  db.close()
  return result
}

// 测试发送消息
async function testSendReply(encryptBossId, encryptJobId, bossName, message) {
  console.log('\n[Test] ====== 开始测试发送 ======')
  console.log('[Test] 目标:', bossName)
  console.log('[Test] BOSS ID:', encryptBossId?.substring(0, 20) + '...')
  console.log('[Test] Job ID:', encryptJobId?.substring(0, 20) + '...' || '无')
  console.log('[Test] 消息:', message)
  
  const { puppeteer } = await initPuppeteer()
  const browserInfo = await getAnyAvailablePuppeteerExecutable()
  
  if (!browserInfo) {
    throw new Error('未找到可用的浏览器')
  }
  
  console.log('[Test] 浏览器:', browserInfo.executablePath)
  
  const browser = await puppeteer.launch({
    headless: false, // 设置为 false 可以看到浏览器窗口，方便调试
    executablePath: browserInfo.executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    slowMo: 100 // 慢速模式，方便观察
  })
  
  try {
    console.log('[Test] 浏览器已启动')
    const page = await browser.newPage()
    console.log('[Test] 新页面已创建')
    
    // 设置 Cookie
    const cookies = readStorageFile('boss-cookies.json') || []
    console.log('[Test] Cookie 数量:', cookies.length)
    
    for (const cookie of cookies) {
      await page.setCookie(cookie)
    }
    console.log('[Test] Cookie 已设置')
    
    // 打开聊天页面
    const chatUrl = 'https://www.zhipin.com/web/geek/chat'
    console.log('[Test] 正在打开:', chatUrl)
    
    await page.goto(chatUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    console.log('[Test] 页面加载完成')
    
    // 等待一段时间让页面完全加载
    await new Promise(r => setTimeout(r, 3000))
    
    // 截图查看初始状态
    const screenshot1 = path.join(debugDir, `test-initial-${Date.now()}.png`)
    await page.screenshot({ path: screenshot1, fullPage: true })
    console.log('[Test] 初始截图已保存:', screenshot1)
    
    // 在左侧列表中查找目标 BOSS
    console.log('[Test] 在左侧列表中查找 BOSS...')
    const foundBoss = await page.evaluate((targetBossId) => {
      // 尝试多种选择器
      const selectors = [
        '.chat-list .chat-item',
        '.conversation-list .conversation-item',
        '.friend-list .friend-item',
        '[class*="chat"] [class*="item"]'
      ]
      
      for (const selector of selectors) {
        const items = document.querySelectorAll(selector)
        console.log(`[Test] 选择器 "${selector}" 找到 ${items.length} 个元素`)
        
        for (const item of items) {
          const vueData = item.__vue__ || item.__VUE__
          const itemBossId = vueData?.encryptBossId || vueData?.bossId || 
                            item.getAttribute('data-boss-id') ||
                            item.getAttribute('boss-id')
          
          const bossName = item.textContent?.substring(0, 20)
          
          if (itemBossId === targetBossId) {
            item.click()
            return { found: true, selector, bossId: itemBossId, bossName }
          }
        }
      }
      
      return { found: false }
    }, encryptBossId)
    
    console.log('[Test] 查找结果:', foundBoss)
    
    if (!foundBoss.found) {
      console.log('[Test] 未精确找到目标 BOSS，尝试点击第一个对话...')
      await page.evaluate(() => {
        const firstItem = document.querySelector('.chat-list .chat-item, .conversation-list .conversation-item')
        if (firstItem) {
          firstItem.click()
          return true
        }
        return false
      })
    }
    
    // 等待对话加载
    await new Promise(r => setTimeout(r, 2000))
    
    // 截图查看当前对话
    const screenshot2 = path.join(debugDir, `test-chat-opened-${Date.now()}.png`)
    await page.screenshot({ path: screenshot2, fullPage: true })
    console.log('[Test] 对话打开后截图:', screenshot2)
    
    // 查找输入框
    console.log('[Test] 查找聊天输入框...')
    let chatInput = await page.$('.chat-conversation .message-controls .chat-input')
    
    if (!chatInput) {
      // 尝试备用选择器
      const selectors = [
        '.chat-input',
        '[contenteditable="true"]',
        '.editor-input',
        'div[role="textbox"]',
        '.message-controls textarea'
      ]
      
      for (const sel of selectors) {
        chatInput = await page.$(sel)
        if (chatInput) {
          console.log('[Test] 使用备用选择器找到输入框:', sel)
          break
        }
      }
    }
    
    if (!chatInput) {
      throw new Error('未找到聊天输入框')
    }
    
    console.log('[Test] 找到输入框，准备输入消息...')
    
    // 点击输入框
    await chatInput.click()
    await new Promise(r => setTimeout(r, 500))
    
    // 清空输入框
    await chatInput.evaluate(el => {
      el.innerHTML = ''
      el.textContent = ''
      if (el.value !== undefined) el.value = ''
    })
    await new Promise(r => setTimeout(r, 200))
    
    // 输入消息
    await chatInput.type(message, { delay: 50 })
    console.log('[Test] 消息已输入')
    
    await new Promise(r => setTimeout(r, 1000))
    
    // 截图查看输入后状态
    const screenshot3 = path.join(debugDir, `test-message-typed-${Date.now()}.png`)
    await page.screenshot({ path: screenshot3, fullPage: true })
    console.log('[Test] 输入消息后截图:', screenshot3)
    
    // 查找发送按钮
    console.log('[Test] 查找发送按钮...')
    let sendButton = await page.$('.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)')
    
    if (!sendButton) {
      const selectors = [
        '.btn-send',
        '[class*="send"]',
        '.message-controls button'
      ]
      
      for (const sel of selectors) {
        sendButton = await page.$(sel)
        if (sendButton) {
          console.log('[Test] 使用备用选择器找到发送按钮:', sel)
          break
        }
      }
    }
    
    if (!sendButton) {
      // 尝试通过文本查找
      sendButton = await page.evaluateHandle(() => {
        const buttons = document.querySelectorAll('button, div[role="button"]')
        for (const btn of buttons) {
          if (btn.textContent?.includes('发送')) {
            return btn
          }
        }
        return null
      })
    }
    
    if (!sendButton) {
      throw new Error('未找到发送按钮')
    }
    
    console.log('[Test] 找到发送按钮，准备点击...')
    
    // 点击发送按钮
    await sendButton.click()
    console.log('[Test] 发送按钮已点击')
    
    // 等待发送完成
    await new Promise(r => setTimeout(r, 3000))
    
    // 截图查看发送后状态
    const screenshot4 = path.join(debugDir, `test-message-sent-${Date.now()}.png`)
    await page.screenshot({ path: screenshot4, fullPage: true })
    console.log('[Test] 发送后截图:', screenshot4)
    
    console.log('[Test] ====== 测试完成 ======')
    console.log('[Test] 截图保存在:', debugDir)
    
    return true
  } catch (error) {
    console.error('[Test] 测试失败:', error)
    
    // 错误截图
    try {
      const screenshot = path.join(debugDir, `test-error-${Date.now()}.png`)
      const pages = await browser.pages()
      if (pages.length > 0) {
        await pages[0].screenshot({ path: screenshot, fullPage: true })
        console.log('[Test] 错误截图:', screenshot)
      }
    } catch (e) {}
    
    return false
  } finally {
    console.log('[Test] 正在关闭浏览器...')
    await browser.close()
    console.log('[Test] 浏览器已关闭')
  }
}

// 主函数
async function main() {
  try {
    // 获取测试目标
    const target = getTestTarget()
    
    if (!target) {
      console.log('[Test] 未找到有未读消息的 BOSS，请先在 BOSS 直聘上收到新消息')
      process.exit(1)
    }
    
    console.log('[Test] 找到测试目标:')
    console.log('  BOSS:', target.bossName)
    console.log('  消息:', target.lastText)
    console.log('  未读:', target.unreadCount)
    
    // 测试发送
    const testMessage = '您好，感谢联系。我期望的薪资范围是 20k-25k，具体可以面议。'
    const success = await testSendReply(
      target.encryptBossId,
      target.encryptJobId,
      target.bossName,
      testMessage
    )
    
    if (success) {
      console.log('\n[Test] ✅ 测试成功！')
    } else {
      console.log('\n[Test] ❌ 测试失败！')
      process.exit(1)
    }
  } catch (error) {
    console.error('[Test] 运行出错:', error)
    process.exit(1)
  }
}

main()

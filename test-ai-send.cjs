/**
 * AI 自动回复发送测试脚本 - 简化版
 * 读取数据库获取测试目标，输出浏览器控制台测试代码
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug')
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true })
}

console.log('========== AI 自动回复发送测试 ==========\n')

// 读取数据库获取测试目标
function getTargetFromDB() {
  try {
    const sqlite3 = require('better-sqlite3')
    const dbPath = path.join(os.homedir(), '.dagegong', 'storage', 'public.db')
    
    if (!fs.existsSync(dbPath)) {
      console.error('[Test] 数据库不存在:', dbPath)
      return null
    }
    
    const db = sqlite3(dbPath)
    const result = db.prepare(`
      SELECT encryptBossId, bossName, lastText, unreadCount
      FROM v_boss_chat_relation 
      WHERE unreadCount > 0
      ORDER BY updateTime DESC
      LIMIT 1
    `).get()
    
    db.close()
    return result
  } catch (e) {
    console.error('[Test] 读取数据库失败:', e.message)
    console.log('[Test] 请确保已安装 better-sqlite3: npm install better-sqlite3')
    return null
  }
}

// 主函数
function main() {
  console.log('[Test] 正在检查数据库...\n')
  
  const target = getTargetFromDB()
  
  if (!target) {
    console.log('[Test] ❌ 未找到有未读消息的 BOSS')
    console.log('[Test] 请在 BOSS 直聘上收到新消息后再测试\n')
    return
  }
  
  console.log('[Test] ✅ 找到测试目标:')
  console.log('  BOSS:', target.bossName)
  console.log('  最后消息:', target.lastText)
  console.log('  未读数:', target.unreadCount)
  console.log('')
  
  // 生成浏览器控制台测试代码
  const testCode = `// ==========================================
// 在 BOSS 直聘聊天页面控制台运行的测试代码
// ==========================================

(async function testSendMessage() {
  console.log('=== AI 自动回复发送测试 ===')
  
  // 1. 查找聊天输入框
  console.log('\\n[1/4] 查找聊天输入框...')
  
  const inputSelectors = [
    '.chat-conversation .message-controls .chat-input',
    '.chat-input',
    '[contenteditable="true"]',
    '.editor-input',
    'div[role="textbox"]',
    '.message-controls textarea',
    '.chat-editor'
  ]
  
  let inputEl = null
  let foundSelector = ''
  
  for (const selector of inputSelectors) {
    inputEl = document.querySelector(selector)
    if (inputEl) {
      foundSelector = selector
      console.log('✅ 找到输入框:', selector)
      console.log('   元素:', inputEl.tagName, inputEl.className?.slice(0, 50))
      break
    }
  }
  
  if (!inputEl) {
    console.error('❌ 未找到输入框')
    console.log('\\n请右键点击输入框 → 检查元素，告诉我 class 或 id')
    return false
  }
  
  // 2. 点击并输入消息
  console.log('\\n[2/4] 点击输入框并输入测试消息...')
  
  inputEl.click()
  await new Promise(r => setTimeout(r, 300))
  
  // 清空输入框
  if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
    inputEl.value = ''
    inputEl.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    inputEl.innerHTML = ''
    inputEl.textContent = ''
  }
  
  await new Promise(r => setTimeout(r, 100))
  
  // 输入测试文本
  const testMessage = '您好，这是我的在线简历，期待与您进一步沟通。'
  
  if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
    inputEl.value = testMessage
    inputEl.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    // 使用 execCommand 输入
    document.execCommand('insertText', false, testMessage)
  }
  
  console.log('✅ 已输入消息:', testMessage.slice(0, 30) + '...')
  
  await new Promise(r => setTimeout(r, 500))
  
  // 3. 查找发送按钮
  console.log('\\n[3/4] 查找发送按钮...')
  
  const buttonSelectors = [
    '.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)',
    '.chat-conversation .btn-send',
    '.btn-send',
    '[class*="send"]',
    '.message-controls button'
  ]
  
  let sendBtn = null
  
  for (const selector of buttonSelectors) {
    sendBtn = document.querySelector(selector)
    if (sendBtn && !sendBtn.disabled) {
      console.log('✅ 找到发送按钮:', selector)
      console.log('   文本:', sendBtn.textContent?.trim())
      console.log('   禁用:', sendBtn.disabled)
      break
    }
  }
  
  if (!sendBtn) {
    // 通过文本查找
    const buttons = document.querySelectorAll('button, div[role="button"]')
    for (const btn of buttons) {
      if (btn.textContent?.includes('发送') && !btn.disabled) {
        sendBtn = btn
        console.log('✅ 通过文本找到发送按钮')
        break
      }
    }
  }
  
  if (!sendBtn) {
    console.error('❌ 未找到发送按钮')
    console.log('\\n请右键点击发送按钮 → 检查元素，告诉我 class 或 id')
    return false
  }
  
  // 4. 准备发送
  console.log('\\n[4/4] 准备发送...')
  console.log('控制台输入 sendBtn.click() 发送消息')
  console.log('或输入: document.querySelector('.btn-send')?.click()')
  
  // 将按钮暴露到全局，方便手动点击
  window.sendBtn = sendBtn
  window.inputEl = inputEl
  
  console.log('\\n=== 测试完成 ===')
  console.log('找到输入框和发送按钮！')
  console.log('')  
  console.log('要发送消息，请在控制台运行:')
  console.log('  sendBtn.click()')
  
  return true
})()`

  // 保存到文件
  const outputFile = path.join(debugDir, 'ai-send-test.js')
  fs.writeFileSync(outputFile, testCode)
  
  console.log('')
  console.log('========== 测试步骤 ==========')
  console.log('')
  console.log('1. 打开 BOSS 直聘网页版（www.zhipin.com）')
  console.log('2. 确保已登录')
  console.log('3. 进入任意聊天窗口')
  console.log('4. 按 F12 打开开发者工具 → 切换到 Console（控制台）')
  console.log('5. 复制粘贴以下代码运行:')
  console.log('')
  console.log('==============================================')
  console.log(testCode)
  console.log('==============================================')
  console.log('')
  console.log('代码已保存到:', outputFile)
  console.log('')
  console.log('========== 预期结果 ==========')
  console.log('')
  console.log('✅ 找到输入框: .chat-input (或类似选择器)')
  console.log('✅ 找到发送按钮: .btn-send (或类似选择器)')
  console.log('✅ 输入框已填入测试消息')
  console.log('')
  console.log('然后手动运行: sendBtn.click() 发送消息')
  console.log('')
  console.log('========== 如果失败 ==========')
  console.log('')
  console.log('请告诉我:')
  console.log('1. 输入框的 HTML 代码（右键 → 检查元素）')
  console.log('2. 发送按钮的 HTML 代码')
  console.log('我会更新项目中的选择器！')
  console.log('')
}

main()

/**
 * 简化版发送测试脚本
 * 使用项目中已有的 puppeteer 配置
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const debugDir = path.join(os.homedir(), '.dagegong', 'debug')
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true })
}

console.log('========== 简化版发送测试 ==========\n')
console.log('[Test] 此脚本需要在项目根目录运行: node test-send-simple.cjs')
console.log('[Test] 请确保已经:')
console.log('  1. 配置好 BOSS Cookie')
console.log('  2. 有未读消息的 BOSS')
console.log('')

// 获取数据库中的测试目标
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
    return null
  }
}

// 生成测试代码
function generateTestScript() {
  const target = getTargetFromDB()
  
  if (!target) {
    console.log('[Test] 未找到有未读消息的 BOSS')
    console.log('[Test] 请在 BOSS 直聘上收到新消息后再测试')
    return
  }
  
  console.log('[Test] 找到测试目标:')
  console.log('  BOSS:', target.bossName)
  console.log('  消息:', target.lastText)
  console.log('  未读:', target.unreadCount)
  console.log('')
  
  const testCode = `
// 在浏览器控制台中运行的测试代码
// 用于验证能否找到输入框和发送按钮

(async function() {
  console.log('=== 开始测试 ===')
  
  // 1. 查找输入框
  const inputSelectors = [
    '.chat-conversation .message-controls .chat-input',
    '.chat-input',
    '[contenteditable="true"]',
    '.editor-input',
    'div[role="textbox"]',
    '.message-controls textarea',
    '.chat-editor'
  ]
  
  let input = null
  for (const sel of inputSelectors) {
    input = document.querySelector(sel)
    if (input) {
      console.log('✅ 找到输入框:', sel)
      console.log('   元素:', input)
      break
    }
  }
  
  if (!input) {
    console.error('❌ 未找到输入框')
    return
  }
  
  // 2. 点击输入框
  input.click()
  console.log('✅ 已点击输入框')
  
  // 3. 输入测试文本
  const testText = '测试消息 ${Date.now()}'
  
  // 尝试多种输入方式
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    input.value = testText
    input.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    input.textContent = testText
    input.innerHTML = testText
  }
  
  console.log('✅ 已输入文本:', testText)
  
  // 4. 查找发送按钮
  await new Promise(r => setTimeout(r, 500))
  
  const buttonSelectors = [
    '.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)',
    '.btn-send',
    '[class*="send"]',
    '.message-controls button'
  ]
  
  let button = null
  for (const sel of buttonSelectors) {
    button = document.querySelector(sel)
    if (button && !button.disabled) {
      console.log('✅ 找到发送按钮:', sel)
      console.log('   元素:', button)
      console.log('   文本:', button.textContent?.trim())
      break
    }
  }
  
  if (!button) {
    // 通过文本查找
    const buttons = document.querySelectorAll('button, div[role="button"]')
    for (const btn of buttons) {
      if (btn.textContent?.includes('发送') && !btn.disabled) {
        button = btn
        console.log('✅ 通过文本找到发送按钮')
        break
      }
    }
  }
  
  if (!button) {
    console.error('❌ 未找到发送按钮')
    return
  }
  
  console.log('')
  console.log('=== 测试完成 ===')
  console.log('输入框和发送按钮都能找到！')
  console.log('')
  console.log('如果要实际发送消息，请在控制台运行:')
  console.log('  button.click()')
  
})()
`
  
  console.log('请打开 BOSS 直聘的任意聊天窗口，然后在浏览器控制台粘贴运行以下代码:')
  console.log('')
  console.log(testCode)
  
  // 保存到文件
  const outputFile = path.join(debugDir, 'browser-test-code.js')
  fs.writeFileSync(outputFile, testCode)
  console.log('')
  console.log('代码已保存到:', outputFile)
}

function main() {
  console.log('========== 使用说明 ==========')
  console.log('')
  console.log('方式一：浏览器控制台测试（推荐）')
  console.log('  1. 打开 BOSS 直聘网页版')
  console.log('  2. 进入任意聊天窗口')
  console.log('  3. 按 F12 打开开发者工具')
  console.log('  4. 切换到 Console（控制台）标签')
  console.log('  5. 复制粘贴上面的代码运行')
  console.log('')
  console.log('方式二：直接查看页面结构')
  console.log('  1. 打开 BOSS 直聘聊天页面')
  console.log('  2. 右键点击输入框 → 检查元素')
  console.log('  3. 查看输入框的 class 或 id')
  console.log('  4. 把选择器告诉我，我来更新代码')
  console.log('')
}

// 检查 puppeteer 是否可用
function checkPuppeteer() {
  try {
    const puppeteerPath = path.join(__dirname, 'node_modules', 'puppeteer')
    if (fs.existsSync(puppeteerPath)) {
      console.log('[Test] Puppeteer 已安装 ✓')
      return true
    }
  } catch (e) {}
  
  console.log('[Test] Puppeteer 未安装或路径不正确')
  console.log('[Test] 请在项目根目录运行此脚本')
  return false
}

// 主函数
function main() {
  if (!checkPuppeteer()) {
    console.log('')
    console.log('========== 替代方案 ==========')
    console.log('')
    generateTestScript()
    return
  }
  
  console.log('[Test] 正在检查数据库...')
  const target = getTargetFromDB()
  
  if (!target) {
    console.log('[Test] 未找到测试目标')
    generateTestScript()
    return
  }
  
  console.log('[Test] 找到测试目标:', target.bossName)
  console.log('')
  console.log('要运行完整的 puppeteer 测试，请运行:')
  console.log('  node test-send-reply.mjs')
  console.log('')
  console.log('或者使用浏览器控制台测试（上面生成的代码）')
}

main()

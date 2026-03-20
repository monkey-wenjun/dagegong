import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const distPath = path.resolve('dist/win-unpacked')
const asarPath = path.join(distPath, 'resources/app.asar')
const unpackedPath = path.join(distPath, 'resources/app.asar.unpacked')

console.log('=== 验证构建完整性 ===\n')

// 检查 asar 包内容
console.log('1. 检查 asar 包中的主入口...')
try {
  const result = execSync(`npx asar list "${asarPath}" | findstr "out\\\\main\\\\index.js"`, { encoding: 'utf-8', shell: true })
  console.log('   ✓ index.js 存在')
} catch (e) {
  console.log('   ✗ index.js 不存在')
}

// 检查特定 chunk
console.log('\n2. 检查 index-BtjWCRoT.js...')
try {
  const result = execSync(`npx asar list "${asarPath}" | findstr "index-BtjWCRoT"`, { encoding: 'utf-8', shell: true })
  console.log('   ✓ 在 app.asar 中找到:', result.trim())
} catch (e) {
  console.log('   ✗ 不在 app.asar 中')
}

// 检查 unpacked 目录
console.log('\n3. 检查 unpacked 目录...')
if (fs.existsSync(unpackedPath)) {
  console.log('   app.asar.unpacked 存在')
  const outPath = path.join(unpackedPath, 'out/main')
  if (fs.existsSync(outPath)) {
    const files = fs.readdirSync(outPath)
    console.log(`   包含 ${files.length} 个文件`)
    if (files.includes('index-BtjWCRoT.js')) {
      console.log('   ✓ index-BtjWCRoT.js 在 unpacked 中')
    }
  }
} else {
  console.log('   app.asar.unpacked 不存在')
}

// 检查 out/main/index.js 内容
console.log('\n4. 检查主入口文件中的 require...')
try {
  execSync(`npx asar extract "${asarPath}" "C:/temp/asar-check"`, { shell: true })
  const indexPath = 'C:/temp/asar-check/out/main/index.js'
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8')
    const matches = content.match(/require\(["']\.\/index-[^"']+["']\)/g)
    console.log('   找到的 require 语句:')
    matches?.slice(0, 5).forEach(m => console.log('     -', m))
  }
} catch (e) {
  console.log('   无法提取:', e.message)
}

console.log('\n=== 验证完成 ===')

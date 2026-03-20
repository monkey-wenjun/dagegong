#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../dist/win-unpacked')

console.log('=== 完整构建验证 ===\n')

let errors = []

// 1. 检查可执行文件和图标
console.log('[1] 检查可执行文件...')
const exePath = path.join(distPath, 'dagegong.exe')
if (!fs.existsSync(exePath)) {
  errors.push('dagegong.exe 不存在')
} else {
  const stats = fs.statSync(exePath)
  console.log(`  ✓ dagegong.exe (${(stats.size/1024/1024).toFixed(1)} MB)`)
}

// 检查图标资源（在 asar.unpacked 中）
const iconPath = path.join(distPath, 'resources/app.asar.unpacked/resources/icon.png')
if (!fs.existsSync(iconPath)) {
  errors.push('图标缺失: icon.png')
} else {
  console.log('  ✓ icon.png (在 asar.unpacked 中)')
}

// 2. 检查 sqlite-plugin
console.log('\n[2] 检查 sqlite-plugin...')
const sqlitePath = path.join(distPath, 'resources/sqlite-plugin/dist/index.js')
if (!fs.existsSync(sqlitePath)) {
  errors.push('sqlite-plugin/dist/index.js 不存在')
} else {
  console.log('  ✓ sqlite-plugin/dist/index.js')
}

// 3. 检查 asar 包
console.log('\n[3] 检查 app.asar 内容...')
const asarPath = path.join(distPath, 'resources/app.asar')
if (!fs.existsSync(asarPath)) {
  errors.push('app.asar 不存在')
} else {
  console.log('  ✓ app.asar 存在')
}

// 4. 检查 asar.unpacked 不应该包含 out/
console.log('\n[4] 检查 asar.unpacked...')
const unpackedOutPath = path.join(distPath, 'resources/app.asar.unpacked/out')
if (fs.existsSync(unpackedOutPath)) {
  errors.push('错误: out/ 不应该在 asar.unpacked 中')
} else {
  console.log('  ✓ out/ 正确地在 asar 包内')
}

// 5. 检查 app-update.yml
console.log('\n[5] 检查其他资源...')
const otherFiles = ['app-update.yml', 'elevate.exe']
otherFiles.forEach(f => {
  if (!fs.existsSync(path.join(distPath, 'resources', f))) {
    errors.push(`${f} 缺失`)
  } else {
    console.log(`  ✓ ${f}`)
  }
})

// 结果
console.log('\n=== 验证结果 ===')
if (errors.length > 0) {
  console.log(`✗ 发现 ${errors.length} 个错误:`)
  errors.forEach(e => console.log(`  - ${e}`))
  process.exit(1)
} else {
  console.log('✓ 所有检查通过！')
  console.log('\n构建位置:')
  console.log(`  便携版: ${exePath}`)
  console.log(`  安装包: ${path.resolve(__dirname, '../dist/dagegong_1.0.7_x64_setup.exe')}`)
}

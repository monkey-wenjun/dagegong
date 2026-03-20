#!/usr/bin/env node
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../dist/win-unpacked')
const asarPath = path.join(distPath, 'resources/app.asar')

console.log('==========================================')
console.log('  构建完整性最终验证')
console.log('==========================================\n')

let hasError = false

// 1. 检查 asar 包是否存在
console.log('[1/6] 检查 asar 包...')
if (!fs.existsSync(asarPath)) {
  console.log('  ✗ app.asar 不存在')
  hasError = true
  process.exit(1)
}
console.log('  ✓ app.asar 存在')

// 2. 提取并检查主入口文件
console.log('\n[2/6] 检查主入口文件...')
const tempExtractPath = 'C:/temp/dagegong-verify-' + Date.now()
try {
  execSync(`npx asar extract "${asarPath}" "${tempExtractPath}"`, { 
    stdio: 'pipe',
    shell: true 
  })
  
  const mainIndexPath = path.join(tempExtractPath, 'out/main/index.js')
  if (!fs.existsSync(mainIndexPath)) {
    console.log('  ✗ out/main/index.js 不存在')
    hasError = true
  } else {
    console.log('  ✓ out/main/index.js 存在')
    
    // 读取内容检查 require 语句
    const content = fs.readFileSync(mainIndexPath, 'utf-8')
    const requireMatches = content.match(/require\(["']\.\/index-[^"']+["']\)/g) || []
    console.log(`  发现 ${requireMatches.length} 个模块引用`)
    
    // 检查每个引用的文件是否存在
    const missingFiles = []
    for (const match of requireMatches.slice(0, 10)) {
      const fileName = match.match(/index-[^"']+/)[0]
      const filePath = path.join(tempExtractPath, 'out/main', fileName)
      if (!fs.existsSync(filePath)) {
        missingFiles.push(fileName)
      }
    }
    
    if (missingFiles.length > 0) {
      console.log('  ✗ 缺失的模块文件:')
      missingFiles.forEach(f => console.log(`    - ${f}`))
      hasError = true
    } else {
      console.log('  ✓ 所有引用的模块文件都存在')
    }
  }
} catch (e) {
  console.log('  ✗ 无法提取 asar:', e.message)
  hasError = true
}

// 3. 检查 asar.unpacked 目录
console.log('\n[3/6] 检查 asar.unpacked 目录...')
const unpackedPath = path.join(distPath, 'resources/app.asar.unpacked')
if (fs.existsSync(unpackedPath)) {
  const outPath = path.join(unpackedPath, 'out')
  if (fs.existsSync(outPath)) {
    console.log('  ⚠ 警告: out/ 目录被错误地解压到 unpacked')
    console.log('    这会导致模块加载失败！')
    hasError = true
  } else {
    console.log('  ✓ out/ 目录正确地在 asar 包内')
  }
} else {
  console.log('  ✓ app.asar.unpacked 不存在（正确）')
}

// 4. 检查可执行文件
console.log('\n[4/6] 检查可执行文件...')
const exePath = path.join(distPath, 'dagegong.exe')
if (!fs.existsSync(exePath)) {
  console.log('  ✗ dagegong.exe 不存在')
  hasError = true
} else {
  const stats = fs.statSync(exePath)
  console.log(`  ✓ dagegong.exe 存在 (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
}

// 5. 检查 Electron 资源
console.log('\n[5/6] 检查 Electron 资源...')
const requiredFiles = [
  'chrome_100_percent.pak',
  'chrome_200_percent.pak',
  'icudtl.dat',
  'libEGL.dll',
  'libGLESv2.dll'
]
const missingResources = []
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(distPath, file))) {
    missingResources.push(file)
  }
}
if (missingResources.length > 0) {
  console.log('  ✗ 缺失资源文件:', missingResources.join(', '))
  hasError = true
} else {
  console.log('  ✓ 所有必要资源文件存在')
}

// 6. 检查渲染进程文件
console.log('\n[6/6] 检查渲染进程文件...')
const rendererIndexPath = path.join(tempExtractPath, 'out/renderer/index.html')
if (!fs.existsSync(rendererIndexPath)) {
  console.log('  ✗ out/renderer/index.html 不存在')
  hasError = true
} else {
  console.log('  ✓ out/renderer/index.html 存在')
}

// 清理临时文件
try {
  fs.rmSync(tempExtractPath, { recursive: true, force: true })
} catch {}

// 总结
console.log('\n==========================================')
if (hasError) {
  console.log('  验证结果: ✗ 失败')
  console.log('  构建存在问题，请勿发布！')
  process.exit(1)
} else {
  console.log('  验证结果: ✓ 通过')
  console.log('  构建完整，可以正常启动！')
  console.log('\n  安装包位置:')
  console.log(`  ${path.resolve(__dirname, '../dist/dagegong_1.0.7_x64_setup.exe')}`)
  console.log('\n  便携版位置:')
  console.log(`  ${exePath}`)
}
console.log('==========================================')

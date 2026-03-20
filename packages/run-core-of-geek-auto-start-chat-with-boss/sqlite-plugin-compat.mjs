// 兼容性导入文件 - 使用相对路径导入 sqlite-plugin，避免 Node.js 24 的 workspace 解析问题
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 检测当前环境：开发环境或构建后的环境
function getSqlitePluginPath() {
  const require = createRequire(import.meta.url)
  
  // 尝试多个可能的路径
  const possiblePaths = [
    // 开发环境路径
    join(__dirname, '../sqlite-plugin/dist/index.js'),
    // 构建后的路径（相对于 out/main/）
    join(__dirname, '../../../sqlite-plugin/dist/index.js'),
  ]
  
  for (const path of possiblePaths) {
    try {
      require.resolve(path)
      console.log('[sqlite-plugin-compat] Found sqlite-plugin at:', path)
      return path
    } catch {
      // 继续尝试下一个路径
    }
  }
  
  // Electron 打包后，从 asar 内部的 node_modules 加载
  try {
    const electronModulePath = 'node_modules/@dagegong/sqlite-plugin/dist/index.js'
    const asarPath = join(process.resourcesPath, 'app.asar', electronModulePath)
    require.resolve(asarPath)
    console.log('[sqlite-plugin-compat] Found sqlite-plugin in asar:', asarPath)
    return asarPath
  } catch {
    // 继续尝试其他路径
  }
  
  // 默认返回第一个路径
  console.log('[sqlite-plugin-compat] Using default path')
  return possiblePaths[0]
}

// 使用 createRequire 加载 CommonJS 模块
const require = createRequire(import.meta.url)
const sqlitePluginPath = getSqlitePluginPath()

console.log('[sqlite-plugin-compat] Loading SqlitePlugin from:', sqlitePluginPath)

// 加载模块
const SqlitePluginModule = require(sqlitePluginPath)

// 重新导出
export const SqlitePlugin = SqlitePluginModule.default || SqlitePluginModule
export default SqlitePlugin

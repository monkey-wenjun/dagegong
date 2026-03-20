// 兼容性导入文件 - 使用相对路径导入 sqlite-plugin，避免 Node.js 24 的 workspace 解析问题
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 检测当前环境：开发环境或构建后的环境
function getSqlitePluginPath() {
  // 尝试开发环境路径
  const devPath = join(__dirname, '../sqlite-plugin/dist/index.js')
  // 尝试构建后的路径（相对于 out/main/）
  const buildPath = join(__dirname, '../../../sqlite-plugin/dist/index.js')
  
  const require = createRequire(import.meta.url)
  try {
    // 测试哪个路径可用
    require.resolve(devPath)
    return devPath
  } catch {
    return buildPath
  }
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

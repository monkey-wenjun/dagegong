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
    // Electron 打包后，从 app.asar 内部的 node_modules 加载
    // 这需要通过主进程的 require 来解析
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
  // 使用 electron 的 require 来解析路径
  try {
    // 在打包后的应用中，从 app.asar 内部的 node_modules 加载
    const electronModulePath = 'node_modules/@dagegong/sqlite-plugin/dist/index.js'
    const asarPath = join(process.resourcesPath, 'app.asar', electronModulePath)
    require.resolve(asarPath)
    console.log('[sqlite-plugin-compat] Found sqlite-plugin in asar:', asarPath)
    return asarPath
  } catch {
    // 继续尝试其他路径
  }
  
  // 默认返回第一个路径（开发环境）
  console.log('[sqlite-plugin-compat] Using default path')
  return possiblePaths[0]
}

function getEnumsPath() {
  const basePath = getSqlitePluginPath()
  return join(dirname(basePath), 'enums.js')
}

function getEntityPath() {
  const basePath = getSqlitePluginPath()
  return join(dirname(basePath), 'entity/ChatStartupLog.js')
}

function getParserPath() {
  const basePath = getSqlitePluginPath()
  return join(dirname(basePath), 'utils/parser.js')
}

// 使用 createRequire 加载 CommonJS 模块
const require = createRequire(import.meta.url)

// 加载模块
const sqlitePluginPath = getSqlitePluginPath()
const enumsPath = getEnumsPath()
const entityPath = getEntityPath()
const parserPath = getParserPath()

console.log('[sqlite-plugin-compat] Loading from:', { sqlitePluginPath, enumsPath })

const SqlitePluginModule = require(sqlitePluginPath)
const enumsModule = require(enumsPath)
const entityModule = require(entityPath)
const parserModule = require(parserPath)

// 重新导出
export const SqlitePlugin = SqlitePluginModule.default || SqlitePluginModule
export const ChatStartupFrom = entityModule.ChatStartupFrom
export const parseSalary = parserModule.parseSalary
export const MarkAsNotSuitReason = enumsModule.MarkAsNotSuitReason
export const MarkAsNotSuitOp = enumsModule.MarkAsNotSuitOp
export const StrategyScopeOptionWhenMarkJobNotMatch = enumsModule.StrategyScopeOptionWhenMarkJobNotMatch
export const SalaryCalculateWay = enumsModule.SalaryCalculateWay
export const JobDetailRegExpMatchLogic = enumsModule.JobDetailRegExpMatchLogic
export const JobSource = enumsModule.JobSource
export const CombineRecommendJobFilterType = enumsModule.CombineRecommendJobFilterType

export default SqlitePlugin

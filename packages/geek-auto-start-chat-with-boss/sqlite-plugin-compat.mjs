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

function getEnumsPath() {
  const devPath = join(__dirname, '../sqlite-plugin/dist/enums.js')
  const buildPath = join(__dirname, '../../../sqlite-plugin/dist/enums.js')
  return buildPath
}

function getEntityPath() {
  const devPath = join(__dirname, '../sqlite-plugin/dist/entity/ChatStartupLog.js')
  const buildPath = join(__dirname, '../../../sqlite-plugin/dist/entity/ChatStartupLog.js')
  return buildPath
}

function getParserPath() {
  const devPath = join(__dirname, '../sqlite-plugin/dist/utils/parser.js')
  const buildPath = join(__dirname, '../../../sqlite-plugin/dist/utils/parser.js')
  return buildPath
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

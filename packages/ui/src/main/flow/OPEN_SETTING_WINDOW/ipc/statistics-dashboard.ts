/**
 * 统计数据仪表盘 - 数据查询模块
 * 基于 BOSS 沟通记录 (boss_chat_relation) 表统计
 */

import { initDb } from '@dagegong/sqlite-plugin'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { DataSource } from 'typeorm'
import { MarkAsNotSuitReason } from '@dagegong/sqlite-plugin/dist/enums.js'

interface StatisticsParams {
  timeRange: 'today' | 'week'
  encryptUserId?: string
}

interface StatisticsResult {
  overview: {
    chatCount: number
    chatDistinctCount: number
    bossCount: number
    companyCount: number
    notSuitCount: number
  }
  jobRank: Array<{ jobName: string; count: number }>
  companyRank: Array<{ companyName: string; count: number }>
  notSuitReasons: Array<{ name: string; value: number }>
  salaryRanges: Array<{ range: string; count: number }>
  industries: Array<{ name: string; count: number }>
  scales: Array<{ name: string; value: number }>
  stages: Array<{ name: string; value: number }>
  jobNames: Array<{ name: string; count: number }>
}

// 不合适原因映射
const notSuitReasonMap: Record<number, string> = {
  [MarkAsNotSuitReason.UNKNOWN]: '未知原因',
  [MarkAsNotSuitReason.BOSS_INACTIVE]: 'BOSS不活跃',
  [MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON]: '手动标记',
  [MarkAsNotSuitReason.JOB_NOT_SUIT]: '职位不合适',
  [MarkAsNotSuitReason.JOB_CITY_NOT_SUIT]: '城市不匹配',
  [MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT]: '经验不匹配',
  [MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT]: '薪资不匹配',
  [MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT]: '公司不匹配'
}

/**
 * 获取时间范围（毫秒时间戳）
 * BOSS直聘的 updateTime 是毫秒级时间戳
 */
function getTimeRange(timeRange: 'today' | 'week'): { start: number; end: number } {
  const now = new Date()
  
  if (timeRange === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime()
    return { start, end }
  } else {
    // 最近7天
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0).getTime()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime()
    return { start, end }
  }
}

/**
 * 获取统计数据
 */
export async function getStatisticsDashboardData(params: StatisticsParams): Promise<StatisticsResult> {
  const db = await initDb(getPublicDbFilePath()) as DataSource
  const { start, end } = getTimeRange(params.timeRange)
  
  console.log('[Statistics] Querying boss chat data from', new Date(start).toISOString(), 'to', new Date(end).toISOString())

  // 1. 概览数据
  const overview = await getOverviewData(db, start, end)
  
  // 2. 职位沟通排行
  const jobRank = await getJobRank(db, start, end)
  
  // 3. 公司沟通排行
  const companyRank = await getCompanyRank(db, start, end)
  
  // 4. 不合适原因分布
  const notSuitReasons = await getNotSuitReasons(db, start, end)
  
  // 5. 薪资范围分布
  const salaryRanges = await getSalaryRanges(db, start, end)
  
  // 6. 行业分布
  const industries = await getIndustries(db, start, end)
  
  // 7. 公司规模分布
  const scales = await getScales(db, start, end)
  
  // 8. 融资情况分布
  const stages = await getStages(db, start, end)
  
  // 9. 热门职位
  const jobNames = await getJobNames(db, start, end)

  return {
    overview,
    jobRank,
    companyRank,
    notSuitReasons,
    salaryRanges,
    industries,
    scales,
    stages,
    jobNames
  }
}

/**
 * 获取概览数据 - 基于 boss_chat_relation 表
 * updateTime 是毫秒级时间戳
 */
async function getOverviewData(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['overview']> {
  console.log('[Statistics] Query params - start:', start, 'end:', end, 'userId:', encryptUserId || 'all')
  
  // 构建用户过滤条件
  const userFilter = encryptUserId ? `AND encryptUserId = '${encryptUserId}'` : ''
  
  // 总沟通记录数（updateTime 是毫秒级）
  const chatResult = await db.query(
    `SELECT COUNT(*) as count FROM boss_chat_relation 
     WHERE updateTime >= ? AND updateTime <= ? ${userFilter}`,
    [start, end]
  )
  
  // 去重职位数
  const chatDistinctResult = await db.query(
    `SELECT COUNT(DISTINCT encryptJobId) as count FROM boss_chat_relation 
     WHERE updateTime >= ? AND updateTime <= ?
     AND encryptJobId IS NOT NULL AND encryptJobId != '' ${userFilter}`,
    [start, end]
  )
  
  // 沟通BOSS数（去重）
  const bossResult = await db.query(
    `SELECT COUNT(DISTINCT encryptBossId) as count FROM boss_chat_relation 
     WHERE updateTime >= ? AND updateTime <= ?
     AND encryptBossId IS NOT NULL AND encryptBossId != '' ${userFilter}`,
    [start, end]
  )
  
  // 沟通公司数（去重）- 通过 job_info 关联获取公司ID
  const companyResult = await db.query(
    `SELECT COUNT(DISTINCT j.encryptCompanyId) as count 
     FROM boss_chat_relation bcr
     LEFT JOIN job_info j ON bcr.encryptJobId = j.encryptJobId
     WHERE bcr.updateTime >= ? AND bcr.updateTime <= ?
     AND j.encryptCompanyId IS NOT NULL AND j.encryptCompanyId != '' ${userFilter}`,
    [start, end]
  )
  
  // 标记不合适数
  const notSuitUserFilter = encryptUserId ? `AND encryptCurrentUserId = '${encryptUserId}'` : ''
  const notSuitResult = await db.query(
    `SELECT COUNT(*) as count FROM mark_as_not_suit_log 
     WHERE date >= ? AND date <= ? ${notSuitUserFilter}`,
    [new Date(start).toISOString(), new Date(end).toISOString()]
  )
  
  const totalCount = chatResult[0]?.count || 0
  const distinctCount = chatDistinctResult[0]?.count || 0
  
  console.log('[Statistics] Boss chat count - Total:', totalCount, 'Distinct jobs:', distinctCount)
  
  return {
    chatCount: totalCount,
    chatDistinctCount: distinctCount,
    bossCount: bossResult[0]?.count || 0,
    companyCount: companyResult[0]?.count || 0,
    notSuitCount: notSuitResult[0]?.count || 0
  }
}

/**
 * 职位沟通排行 - 基于 boss_chat_relation 表
 */
async function getJobRank(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['jobRank']> {
  const userFilter = encryptUserId ? `AND encryptUserId = '${encryptUserId}'` : ''
  const result = await db.query(
    `SELECT 
       COALESCE(NULLIF(jobName, ''), '未知职位') as jobName, 
       COUNT(*) as count 
     FROM boss_chat_relation 
     WHERE updateTime >= ? AND updateTime <= ?
     AND jobName IS NOT NULL AND jobName != '' ${userFilter}
     GROUP BY jobName
     ORDER BY count DESC
     LIMIT 10`,
    [start, end]
  )
  
  return result.map((item: any) => ({
    jobName: item.jobName,
    count: item.count
  }))
}

/**
 * 公司沟通排行 - 基于 boss_chat_relation 表
 * 使用 brandName 而不是 JOIN company_info
 */
async function getCompanyRank(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['companyRank']> {
  const userFilter = encryptUserId ? `AND encryptUserId = '${encryptUserId}'` : ''
  const result = await db.query(
    `SELECT 
       COALESCE(NULLIF(brandName, ''), '未知公司') as companyName, 
       COUNT(*) as count 
     FROM boss_chat_relation 
     WHERE updateTime >= ? AND updateTime <= ?
     AND brandName IS NOT NULL AND brandName != '' ${userFilter}
     GROUP BY brandName
     ORDER BY count DESC
     LIMIT 10`,
    [start, end]
  )
  
  console.log('[Statistics] Company rank result:', result.length, 'items')
  
  return result.map((item: any) => ({
    companyName: item.companyName,
    count: item.count
  }))
}

/**
 * 不合适原因分布
 */
async function getNotSuitReasons(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['notSuitReasons']> {
  const userFilter = encryptUserId ? `AND encryptCurrentUserId = '${encryptUserId}'` : ''
  const result = await db.query(
    `SELECT markReason, COUNT(*) as count 
     FROM mark_as_not_suit_log
     WHERE date >= ? AND date <= ? ${userFilter}
     GROUP BY markReason
     ORDER BY count DESC`,
    [new Date(start).toISOString(), new Date(end).toISOString()]
  )
  
  return result.map((item: any) => ({
    name: notSuitReasonMap[item.markReason] || '其他原因',
    value: item.count
  }))
}

/**
 * 薪资范围分布 - 通过 encryptJobId 关联 job_info
 */
async function getSalaryRanges(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['salaryRanges']> {
  const userFilter = encryptUserId ? `AND bcr.encryptUserId = '${encryptUserId}'` : ''
  
  // 检查 job_info 表是否有数据
  const jobCount = await db.query(`SELECT COUNT(*) as count FROM job_info`)
  if (jobCount[0]?.count === 0) {
    console.log('[Statistics] Job_info table is empty, returning empty salary data')
    return []
  }
  
  const result = await db.query(
    `SELECT j.salaryLow, j.salaryHigh
     FROM boss_chat_relation bcr
     LEFT JOIN job_info j ON bcr.encryptJobId = j.encryptJobId
     WHERE bcr.updateTime >= ? AND bcr.updateTime <= ?
     AND j.salaryLow IS NOT NULL ${userFilter}`,
    [start, end]
  )
  
  // 定义薪资区间
  const ranges = [
    { min: 0, max: 10, label: '10K以下' },
    { min: 10, max: 15, label: '10-15K' },
    { min: 15, max: 20, label: '15-20K' },
    { min: 20, max: 30, label: '20-30K' },
    { min: 30, max: 40, label: '30-40K' },
    { min: 40, max: 50, label: '40-50K' },
    { min: 50, max: Infinity, label: '50K以上' }
  ]
  
  const counts = ranges.map(r => ({ ...r, count: 0 }))
  
  result.forEach((item: any) => {
    const avg = (item.salaryLow + (item.salaryHigh || item.salaryLow)) / 2
    const range = counts.find(r => avg >= r.min && avg < r.max)
    if (range) range.count++
  })
  
  return counts.map(r => ({
    range: r.label,
    count: r.count
  })).filter(r => r.count > 0)
}

/**
 * 行业分布 - 通过 encryptCompanyId 关联 company_info
 * 注意：需要同步时保存公司信息到 company_info 表
 */
async function getIndustries(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['industries']> {
  const userFilter = encryptUserId ? `AND bcr.encryptUserId = '${encryptUserId}'` : ''
  
  // 检查 company_info 表是否有数据
  const companyCount = await db.query(`SELECT COUNT(*) as count FROM company_info`)
  if (companyCount[0]?.count === 0) {
    console.log('[Statistics] Company_info table is empty, returning empty industry data')
    return []
  }
  
  // 通过 job_info 关联获取公司ID，再关联 company_info
  const result = await db.query(
    `SELECT 
       c.industryName as name, 
       COUNT(*) as count 
     FROM boss_chat_relation bcr
     INNER JOIN job_info j ON bcr.encryptJobId = j.encryptJobId
     INNER JOIN company_info c ON j.encryptCompanyId = c.encryptCompanyId
     WHERE bcr.updateTime >= ? AND bcr.updateTime <= ? ${userFilter}
     AND c.industryName IS NOT NULL AND c.industryName != ''
     GROUP BY c.industryName
     ORDER BY count DESC
     LIMIT 10`,
    [start, end]
  )
  
  return result.map((item: any) => ({
    name: item.name,
    count: item.count
  }))
}

/**
 * 公司规模分布
 */
async function getScales(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['scales']> {
  const userFilter = encryptUserId ? `AND bcr.encryptUserId = '${encryptUserId}'` : ''
  
  // 检查 company_info 表是否有数据
  const companyCount = await db.query(`SELECT COUNT(*) as count FROM company_info`)
  if (companyCount[0]?.count === 0) {
    console.log('[Statistics] Company_info table is empty, returning empty scale data')
    return []
  }
  
  // 通过 job_info 关联获取公司ID，再关联 company_info
  const result = await db.query(
    `SELECT 
       CASE 
         WHEN c.scaleLow < 20 THEN '0-20人'
         WHEN c.scaleLow < 100 THEN '20-100人'
         WHEN c.scaleLow < 500 THEN '100-500人'
         WHEN c.scaleLow < 1000 THEN '500-1000人'
         WHEN c.scaleLow < 5000 THEN '1000-5000人'
         WHEN c.scaleLow < 10000 THEN '5000-10000人'
         ELSE '10000人以上'
       END as name,
       COUNT(*) as value 
     FROM boss_chat_relation bcr
     INNER JOIN job_info j ON bcr.encryptJobId = j.encryptJobId
     INNER JOIN company_info c ON j.encryptCompanyId = c.encryptCompanyId
     WHERE bcr.updateTime >= ? AND bcr.updateTime <= ? ${userFilter}
     AND c.scaleLow IS NOT NULL
     GROUP BY name`,
    [start, end]
  )
  
  // 定义规模顺序（从小到大）
  const scaleOrder = [
    '0-20人',
    '20-100人',
    '100-500人',
    '500-1000人',
    '1000-5000人',
    '5000-10000人',
    '10000人以上',
    'unknown'
  ]
  
  // 按顺序排列，未知放最后
  const orderedResult: Array<{ name: string; value: number }> = []
  
  scaleOrder.forEach(scaleName => {
    const found = result.find((item: any) => item.name === scaleName)
    if (found && found.value > 0) {
      orderedResult.push({
        name: scaleName === 'unknown' ? '未知规模' : scaleName,
        value: found.value
      })
    }
  })
  
  return orderedResult
}

/**
 * 融资情况分布
 */
async function getStages(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['stages']> {
  const userFilter = encryptUserId ? `AND bcr.encryptUserId = '${encryptUserId}'` : ''
  
  // 检查 company_info 表是否有数据
  const companyCount = await db.query(`SELECT COUNT(*) as count FROM company_info`)
  if (companyCount[0]?.count === 0) {
    console.log('[Statistics] Company_info table is empty, returning empty stage data')
    return []
  }
  
  // 通过 job_info 关联获取公司ID，再关联 company_info
  const result = await db.query(
    `SELECT 
       c.stageName as name, 
       COUNT(*) as value 
     FROM boss_chat_relation bcr
     INNER JOIN job_info j ON bcr.encryptJobId = j.encryptJobId
     INNER JOIN company_info c ON j.encryptCompanyId = c.encryptCompanyId
     WHERE bcr.updateTime >= ? AND bcr.updateTime <= ? ${userFilter}
     AND c.stageName IS NOT NULL AND c.stageName != ''
     GROUP BY c.stageName`,
    [start, end]
  )
  
  // 融资阶段排序（从早期到后期）
  const stageOrder = [
    '未融资',
    '天使轮',
    'A轮',
    'B轮',
    'C轮',
    'D轮及以上',
    '已上市',
    '不需要融资',
    'unknown'
  ]
  
  // 按融资阶段顺序排列，未知放最后
  const orderedResult: Array<{ name: string; value: number }> = []
  
  stageOrder.forEach(stageName => {
    const found = result.find((item: any) => item.name === stageName)
    if (found && found.value > 0) {
      orderedResult.push({
        name: stageName === 'unknown' ? '未知' : stageName,
        value: found.value
      })
    }
  })
  
  // 如果有未匹配到的阶段，放在中间
  result.forEach((item: any) => {
    if (!stageOrder.includes(item.name) && item.value > 0) {
      orderedResult.splice(orderedResult.length - 1, 0, {
        name: item.name,
        value: item.value
      })
    }
  })
  
  return orderedResult
}

/**
 * 热门职位统计
 */
async function getJobNames(db: DataSource, start: number, end: number, encryptUserId?: string): Promise<StatisticsResult['jobNames']> {
  const userFilter = encryptUserId ? `AND encryptUserId = '${encryptUserId}'` : ''
  const result = await db.query(
    `SELECT 
       COALESCE(NULLIF(jobName, ''), '未知职位') as name, 
       COUNT(*) as count 
     FROM boss_chat_relation 
     WHERE updateTime >= ? AND updateTime <= ?
     AND jobName IS NOT NULL AND jobName != '' ${userFilter}
     GROUP BY jobName
     ORDER BY count DESC
     LIMIT 15`,
    [start, end]
  )
  
  return result.map((item: any) => ({
    name: item.name,
    count: item.count
  }))
}

import 'reflect-metadata'
import { parentPort } from 'node:worker_threads'
import { initDb } from '@dagegong/sqlite-plugin'
import { type DataSource } from 'typeorm'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { VChatStartupLog } from '@dagegong/sqlite-plugin/dist/entity/VChatStartupLog.js'
import { VJobLibrary } from '@dagegong/sqlite-plugin/dist/entity/VJobLibrary.js'
import { VCompanyLibrary } from '@dagegong/sqlite-plugin/dist/entity/VCompanyLibrary.js'
import { VBossLibrary } from '@dagegong/sqlite-plugin/dist/entity/VBossLibrary.js'
import { VMarkAsNotSuitLog } from '@dagegong/sqlite-plugin/dist/entity/VMarkAsNotSuitLog.js'
import { VBossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/VBossChatRelation.js'
import { measureExecutionTime } from '../../../../../../common/utils/performance'
import { PageReq, PagedRes } from '../../../../../../common/types/pagination'
import { JobInfoChangeLog } from '@dagegong/sqlite-plugin/dist/entity/JobInfoChangeLog.js'
import { AutoStartChatRunRecord } from '@dagegong/sqlite-plugin/dist/entity/AutoStartChatRunRecord.js'
import { ChatMessageRecord } from '@dagegong/sqlite-plugin/dist/entity/ChatMessageRecord.js'

const dbInitPromise = initDb(getPublicDbFilePath())
let dataSource: DataSource | null = null

dbInitPromise.then(
  (_dataSource) => {
    dataSource = _dataSource
    attachMessageHandler()
    parentPort?.postMessage({
      type: 'DB_INIT_SUCCESS'
    })
  },
  (error) => {
    parentPort?.postMessage({
      type: 'DB_INIT_FAIL',
      error
    })
    process.exit(1)
  }
)

const payloadHandler = {
  async getAutoStartChatRecord({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VChatStartupLog>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    // 使用原始查询确保返回所有沟通记录
    const rawQuery = `
      SELECT 
        job_info.encryptJobId as encryptJobId,
        job_info.jobName as jobName,
        job_info.positionName as positionName,
        job_info.salaryLow as salaryLow,
        job_info.salaryHigh as salaryHigh,
        job_info.salaryMonth as salaryMonth,
        job_info.experienceName as experienceName,
        job_info.publishDate as publishDate,
        job_info.degreeName as degreeName,
        job_info.address as address,
        job_info.description as description,
        user_info.name as userName,
        chat_startup_log.date as date,
        boss_info.name as bossName,
        boss_info.title as bossTitle,
        company_info.name as companyName
      FROM chat_startup_log
      LEFT JOIN job_info ON chat_startup_log.encryptJobId = job_info.encryptJobId
      LEFT JOIN user_info ON chat_startup_log.encryptCurrentUserId = user_info.encryptUserId
      LEFT JOIN boss_info ON boss_info.encryptBossId = job_info.encryptBossId
      LEFT JOIN company_info ON company_info.encryptCompanyId = job_info.encryptCompanyId
      ORDER BY chat_startup_log.date DESC
      LIMIT ? OFFSET ?
    `

    const countQuery = `SELECT COUNT(*) as count FROM chat_startup_log`

    const [rawData, countResult] = await Promise.all([
      dataSource!.query(rawQuery, [pageSize, (pageNo - 1) * pageSize]),
      dataSource!.query(countQuery)
    ])

    return {
      data: rawData as VChatStartupLog[],
      pageNo,
      totalItemCount: countResult[0]?.count || 0
    }
  },
  async getMarkAsNotSuitRecord({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VMarkAsNotSuitLog>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }
    const recordRepository = dataSource!.getRepository(VMarkAsNotSuitLog)!
    const [data, totalItemCount] = await measureExecutionTime(
      recordRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
        order: {
          date: 'DESC'
        }
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getJobLibrary({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<PagedRes<VJobLibrary>> {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VJobLibrary)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getCompanyLibrary({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VCompanyLibrary>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VCompanyLibrary)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getBossLibrary({ pageNo, pageSize }: Partial<PageReq> = {}): Promise<
    PagedRes<VBossLibrary>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 10
    }

    const userRepository = dataSource!.getRepository(VBossLibrary)!
    const [data, totalItemCount] = await measureExecutionTime(
      userRepository.findAndCount({
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
  },
  async getJobHistoryByEncryptId({ encryptJobId }): Promise<JobInfoChangeLog[]> {
    const jobInfoChangeLogRepository = dataSource!.getRepository(JobInfoChangeLog)!
    const data = await measureExecutionTime(
      jobInfoChangeLogRepository.find({
        where: {
          encryptJobId
        }
      })
    )
    return data
  },
  async saveAndGetCurrentRunRecord() {
    const autoStartChatRunRecord = new AutoStartChatRunRecord()
    autoStartChatRunRecord.date = new Date()
    const autoStartChatRunRecordRepository = dataSource!.getRepository(AutoStartChatRunRecord)
    const result = await autoStartChatRunRecordRepository.save(autoStartChatRunRecord)
    return result
  },
  async getBossChatRelationList({
    pageNo,
    pageSize,
    encryptUserId
  }: Partial<PageReq> & { encryptUserId?: string } = {}): Promise<PagedRes<VBossChatRelation>> {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 100
    }

    // 使用原始查询而不是 findAndCount，避免 TypeORM 视图实体问题
    const offset = (pageNo - 1) * pageSize
    
    let dataQuery = `
      SELECT * FROM v_boss_chat_relation
      ${encryptUserId ? 'WHERE encryptUserId = ?' : ''}
      ORDER BY updateTime DESC
      LIMIT ? OFFSET ?
    `
    let countQuery = `
      SELECT COUNT(*) as count FROM v_boss_chat_relation
      ${encryptUserId ? 'WHERE encryptUserId = ?' : ''}
    `
    
    const dataParams = encryptUserId 
      ? [encryptUserId, pageSize, offset] 
      : [pageSize, offset]
    const countParams = encryptUserId 
      ? [encryptUserId] 
      : []
    
    const [rawData, countResult] = await Promise.all([
      dataSource!.query(dataQuery, dataParams),
      dataSource!.query(countQuery, countParams)
    ])
    
    return {
      data: rawData as VBossChatRelation[],
      pageNo,
      totalItemCount: countResult[0]?.count || 0
    }
  },
  async getChatMessageList({
    encryptBossId,
    encryptUserId
  }: {
    encryptBossId: string
    encryptUserId?: string
  }): Promise<ChatMessageRecord[]> {
    // 使用原始 SQL 查询，避免 TypeORM where 数组条件的问题
    let query: string
    let params: any[]

    if (encryptUserId) {
      // 查询双向聊天记录
      query = `
        SELECT * FROM chat_message_record 
        WHERE (encryptFromUserId = ? AND encryptToUserId = ?) 
           OR (encryptFromUserId = ? AND encryptToUserId = ?)
        ORDER BY time ASC
      `
      params = [encryptUserId, encryptBossId, encryptBossId, encryptUserId]
    } else {
      // 查询与该 BOSS 相关的所有记录
      query = `
        SELECT * FROM chat_message_record 
        WHERE encryptFromUserId = ? OR encryptToUserId = ?
        ORDER BY time ASC
      `
      params = [encryptBossId, encryptBossId]
    }

    const messages = await measureExecutionTime(
      dataSource!.query(query, params)
    )

    // 为每条消息添加 style 字段（sent/received）
    const messagesWithStyle = messages.map((msg: any) => {
      // 如果有当前用户ID，判断是否是自己发送的
      // 否则根据消息方向判断（假设消息来自 BOSS 的是 received）
      const isSent = encryptUserId 
        ? msg.encryptFromUserId === encryptUserId
        : msg.encryptFromUserId !== encryptBossId
      
      return {
        ...msg,
        style: isSent ? 'sent' : 'received' as 'sent' | 'received'
      }
    })

    return messagesWithStyle
  }
}

async function attachMessageHandler() {
  parentPort?.on('message', async (event) => {
    const { _uuid, ...restObj } = event
    const { type } = event

    if (!dataSource) {
      await dbInitPromise
    }
    const result = await payloadHandler[type](restObj)
    parentPort?.postMessage({
      _uuid,
      data: result
    })
  })
}

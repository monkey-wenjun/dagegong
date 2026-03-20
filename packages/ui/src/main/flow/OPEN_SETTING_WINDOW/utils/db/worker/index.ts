import 'reflect-metadata'
import { parentPort } from 'node:worker_threads'
import { initDb } from '@dagegong/sqlite-plugin'
import { type DataSource } from 'typeorm'
import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { VChatStartupLog } from '@dagegong/sqlite-plugin/dist/entity/VChatStartupLog'
import { VJobLibrary } from '@dagegong/sqlite-plugin/dist/entity/VJobLibrary'
import { VCompanyLibrary } from '@dagegong/sqlite-plugin/dist/entity/VCompanyLibrary'
import { VBossLibrary } from '@dagegong/sqlite-plugin/dist/entity/VBossLibrary'
import { VMarkAsNotSuitLog } from '@dagegong/sqlite-plugin/dist/entity/VMarkAsNotSuitLog'
import { VBossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/VBossChatRelation'
import { measureExecutionTime } from '../../../../../../common/utils/performance'
import { PageReq, PagedRes } from '../../../../../../common/types/pagination'
import { JobInfoChangeLog } from '@dagegong/sqlite-plugin/dist/entity/JobInfoChangeLog'
import { AutoStartChatRunRecord } from '@dagegong/sqlite-plugin/dist/entity/AutoStartChatRunRecord'

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
  async getBossChatRelationList({ pageNo, pageSize, encryptUserId }: Partial<PageReq> & { encryptUserId?: string } = {}): Promise<
    PagedRes<VBossChatRelation>
  > {
    if (!pageNo) {
      pageNo = 1
    }
    if (!pageSize) {
      pageSize = 100
    }

    const repository = dataSource!.getRepository(VBossChatRelation)!
    const whereClause: any = {}
    if (encryptUserId) {
      whereClause.encryptUserId = encryptUserId
    }
    
    const [data, totalItemCount] = await measureExecutionTime(
      repository.findAndCount({
        where: whereClause,
        skip: (pageNo - 1) * pageSize,
        take: pageSize
      })
    )
    return {
      data,
      pageNo,
      totalItemCount
    }
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

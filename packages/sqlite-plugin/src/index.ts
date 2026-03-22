import "reflect-metadata";
import { type DataSource } from "typeorm";

import { BossInfo } from "./entity/BossInfo.js";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog.js";
import { ChatStartupFrom, ChatStartupLog } from './entity/ChatStartupLog.js';
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog.js";
import { CompanyInfo } from "./entity/CompanyInfo.js";
import { JobInfo } from "./entity/JobInfo.js";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog.js";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord.js";
import { UserInfo } from "./entity/UserInfo.js";
import { AutoStartChatRunRecord } from './entity/AutoStartChatRunRecord.js';
import { MarkAsNotSuitLog } from "./entity/MarkAsNotSuitLog.js"
import { VChatStartupLog } from "./entity/VChatStartupLog.js";
import { VBossLibrary } from "./entity/VBossLibrary.js";
import { VJobLibrary } from "./entity/VJobLibrary.js";
import { VCompanyLibrary } from "./entity/VCompanyLibrary.js"
import { VMarkAsNotSuitLog } from "./entity/VMarkAsNotSuitLog.js"
import { BossChatRelation } from './entity/BossChatRelation.js'
import { VBossChatRelation } from './entity/VBossChatRelation.js'
import { ChatMessageRecord } from './entity/ChatMessageRecord.js'
import { LlmModelUsageRecord } from './entity/LlmModelUsageRecord.js'
import { JobHireStatusRecord } from './entity/JobHireStatusRecord.js'
import { InterviewRecord } from './entity/InterviewRecord.js'
import { VInterviewRecord } from './entity/VInterviewRecord.js'

import {
  saveChatStartupRecord,
  saveJobInfoFromRecommendPage,
  saveMarkAsNotSuitRecord,
  getNotSuitMarkRecordsInLastSomeDays,
  getChatStartupRecordsInLastSomeDays,
  getBossIdsByJobIds,
  saveJobHireStatusRecord,
  saveBossChatRelationList,
  getBossChatRelationList,
  saveCompanyInfo,
  createInterviewRecord,
  updateInterviewRecord,
  deleteInterviewRecord,
  getInterviewRecordList,
  getInterviewRecordById,
  checkIsInInterview
} from "./handlers.js";
import { UpdateChatStartupLogTable1729182577167 } from "./migrations/1729182577167-UpdateChatStartupLogTable.js";
import minimist from 'minimist'
import { UpdateBossInfoTable1732032381304 } from "./migrations/1732032381304-UpdateBossInfoTable.js";
import { JobHireStatus, MarkAsNotSuitOp, MarkAsNotSuitReason } from "./enums.js";
import { AddColumnForMarkAsNotSuitLog1746092370665 } from "./migrations/1746092370665-AddColumnForMarkAsNotSuitLog.js";
import { Init1000000000000 } from "./migrations/1000000000000-Init.js";
import { AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526 } from "./migrations/1752380078526-AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog.js";
import { AddJobHireStatusTable1766466476822 } from "./migrations/1766466476822-AddJobHireStatusTable.js";
import { AddBossChatRelationTable1770000000000 } from "./migrations/1770000000000-AddBossChatRelationTable.js";
import { AddVBossChatRelationView1770000000001 } from "./migrations/1770000000001-AddVBossChatRelationView.js";
import { FixBossChatRelationNullable1770000000002 } from "./migrations/1770000000002-FixBossChatRelationNullable.js";
import { AddInterviewRecordTable1770000000003 } from "./migrations/1770000000003-AddInterviewRecordTable.js";
import { AddVInterviewRecordView1770000000004 } from "./migrations/1770000000004-AddVInterviewRecordView.js";
import { FixVInterviewRecordView1770000000005 } from "./migrations/1770000000005-FixVInterviewRecordView.js";
import { FixVInterviewRecordViewAgain1770000000006 } from "./migrations/1770000000006-FixVInterviewRecordViewAgain.js";
import { AddLastIsSelfToVBossChatRelationView1770000000007 } from "./migrations/1770000000007-AddLastIsSelfToVBossChatRelationView.js";
import chunk from 'lodash/chunk.js'
import * as typeorm from 'typeorm'

export function initDb(dbFilePath) {
  const { DataSource } = typeorm
  const appDataSource = new DataSource({
    type: "better-sqlite3",
    synchronize: false,
    logging: true,
    logger: "simple-console",
    database: dbFilePath,
    entities: [
      ChatStartupLog,
      BossInfo,
      BossInfoChangeLog,
      CompanyInfo,
      CompanyInfoChangeLog,
      JobInfo,
      JobInfoChangeLog,
      BossActiveStatusRecord,
      UserInfo,
      AutoStartChatRunRecord,
      VChatStartupLog,
      VBossLibrary,
      VJobLibrary,
      VCompanyLibrary,
      MarkAsNotSuitLog,
      VMarkAsNotSuitLog,
      ChatMessageRecord,
      LlmModelUsageRecord,
      JobHireStatusRecord,
      BossChatRelation,
      VBossChatRelation,
      InterviewRecord,
      VInterviewRecord,
    ],
    migrations: [
      Init1000000000000,
      UpdateChatStartupLogTable1729182577167,
      UpdateBossInfoTable1732032381304,
      AddColumnForMarkAsNotSuitLog1746092370665,
      AddJobSourceColumnForChatStartupLogAndMarkAsNotSuitLog1752380078526,
      AddJobHireStatusTable1766466476822,
      AddBossChatRelationTable1770000000000,
      AddVBossChatRelationView1770000000001,
      FixBossChatRelationNullable1770000000002,
      AddInterviewRecordTable1770000000003,
      AddVInterviewRecordView1770000000004,
      FixVInterviewRecordView1770000000005,
      FixVInterviewRecordViewAgain1770000000006,
      AddLastIsSelfToVBossChatRelationView1770000000007
    ],
    migrationsRun: true
  });
  return appDataSource.initialize();
}

export default class SqlitePlugin {
  initPromise: Promise<DataSource>;
  runRecordId: number;

  constructor(dbFilePath) {
    this.initPromise = initDb(dbFilePath);
    this.runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? 0
  }

  userInfo = null

  apply(hooks) {
    hooks.pageGotten.tap(
      'SqlitePlugin',
      (page) => {
        page.on('response', async (response) => {
          const ds = await this.initPromise;
          if (response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')) {
            const data = await response.json()
            if (data.code === 0) {
              await saveJobInfoFromRecommendPage(await ds, data.zpData)
              await saveJobHireStatusRecord(await ds, {
                encryptJobId: data.zpData.jobInfo.encryptId,
                hireStatus: JobHireStatus.HIRING,
                lastSeenDate: new Date()
              })
            }
          }
        })
      }
    )
    hooks.userInfoResponse.tapPromise(
      "SqlitePlugin",
      async (userInfoResponse) => {
        if (!userInfoResponse || userInfoResponse.code !== 0) {
          return;
        }
        const { zpData: userInfo } = userInfoResponse;
        this.userInfo = userInfo
        console.log(userInfo);

        const ds = await this.initPromise;
        const userInfoRepository = ds.getRepository(UserInfo);

        const user = new UserInfo();
        user.encryptUserId = userInfo.encryptUserId;
        user.name = userInfo.name;

        return await userInfoRepository.save(user);
      }
    );
    hooks.mainFlowWillLaunch.tapPromise(
      "SqlitePlugin",
      async ({
        jobNotMatchStrategy,
        jobNotActiveStrategy,
        expectCityNotMatchStrategy,
        blockJobNotSuit,
        blockBossNotActive,
        blockBossNotNewChat
      }) => {
        if (
          jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
          jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
          expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
        ) {
          const ds = await this.initPromise;
          const last7DayMarkRecords = (await getNotSuitMarkRecordsInLastSomeDays(ds, 7)) ?? [];
          if (
            jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
            jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
          ) {
            last7DayMarkRecords
              .filter(it =>
                [
                  MarkAsNotSuitReason.JOB_NOT_SUIT,
                  MarkAsNotSuitReason.USER_MANUAL_OPERATION_WITH_UNKNOWN_REASON
                ].includes(it.markReason)
              )
              .map(
                it => it.encryptJobId
              )
              .forEach(
                id => blockJobNotSuit.add(id)
              )
          }
          if (
            jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
            jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
          ) {
            last7DayMarkRecords
              .filter(it => it.markReason === MarkAsNotSuitReason.BOSS_INACTIVE)
              .map(
                it => it.encryptJobId
              )
              .forEach(
                id => blockJobNotSuit.add(id)
              )
          }
          if (
            expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL ||
            expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
          ) {
            last7DayMarkRecords
              .filter(it => it.markReason === MarkAsNotSuitReason.JOB_CITY_NOT_SUIT)
              .map(
                it => it.encryptJobId
              )
              .forEach(
                id => blockJobNotSuit.add(id)
              )
          }
          const last30DayChatStartupRecords = (await getChatStartupRecordsInLastSomeDays(ds, 30)) ?? [];
          const chattedJobIds = last30DayChatStartupRecords.map(it => it.encryptJobId)
          if (chattedJobIds.length === 0) {
            return
          }
          const chattedJobIdChunks = chunk(chattedJobIds, 200)
          const chattedBossIds = [];
          for (const chattedJobIdChunk of chattedJobIdChunks) {
            const chattedBossIdChunk = ((await getBossIdsByJobIds(ds, chattedJobIdChunk)) ?? []).map(it => it.encryptBossId)
            chattedBossIds.push(...chattedBossIdChunk)
          }
          for (const id of chattedBossIds) {
            blockBossNotNewChat.add(id)
          }
        }
      }
    );

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async (_jobInfo) => {
      const ds = await this.initPromise;
      await saveJobInfoFromRecommendPage(ds, _jobInfo);
    });

    hooks.jobDetailIsGetFromRecommendList.tapPromise("SqlitePlugin", async ({ jobInfo }) => {
      const ds = await this.initPromise;
      return await saveJobHireStatusRecord(ds, {
        encryptJobId: jobInfo.encryptId,
        hireStatus: JobHireStatus.HIRING,
        lastSeenDate: new Date()
      });
    });

    hooks.newChatStartup.tapPromise("SqlitePlugin", async (_jobInfo, { chatStartupFrom = ChatStartupFrom.AutoFromRecommendList, jobSource = undefined } = {}) => {
      const ds = await this.initPromise;
      return await saveChatStartupRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        chatStartupFrom,
        jobSource
      });
    });

    hooks.jobMarkedAsNotSuit.tapPromise("SqlitePlugin", async (_jobInfo, { markFrom = ChatStartupFrom.AutoFromRecommendList, markReason = undefined, extInfo = undefined, markOp = undefined, jobSource = undefined } = {}) => {
      const ds = await this.initPromise;
      return await saveMarkAsNotSuitRecord(ds, _jobInfo, this.userInfo, {
        autoStartupChatRecordId: this.runRecordId,
        markFrom,
        markReason,
        extInfo,
        markOp,
        jobSource
      });
    });
  }
}

// Export entities
export { ChatStartupLog } from './entity/ChatStartupLog.js'
export { JobInfo } from './entity/JobInfo.js'
export { BossInfo } from './entity/BossInfo.js'
export { CompanyInfo } from './entity/CompanyInfo.js'
export { UserInfo } from './entity/UserInfo.js'
export { BossChatRelation } from './entity/BossChatRelation.js'
export { VBossChatRelation } from './entity/VBossChatRelation.js'
export { InterviewRecord, InterviewStage, InterviewSource } from './entity/InterviewRecord.js'
export { VInterviewRecord } from './entity/VInterviewRecord.js'

// Export handlers
export {
  saveBossChatRelationList,
  getBossChatRelationList,
  saveCompanyInfo,
  createInterviewRecord,
  updateInterviewRecord,
  deleteInterviewRecord,
  getInterviewRecordList,
  getInterviewRecordById,
  checkIsInInterview
} from './handlers.js'

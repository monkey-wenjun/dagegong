import { DataSource, Raw } from "typeorm";
import { BossActiveStatusRecord } from "./entity/BossActiveStatusRecord";
import { BossInfo } from "./entity/BossInfo";
import { CompanyInfo } from "./entity/CompanyInfo";
import { JobInfo } from "./entity/JobInfo";
import { parseCompanyScale, parseSalary } from "./utils/parser";
import { ChatStartupLog } from "./entity/ChatStartupLog";
import { BossInfoChangeLog } from "./entity/BossInfoChangeLog";
import { CompanyInfoChangeLog } from "./entity/CompanyInfoChangeLog";
import { JobInfoChangeLog } from "./entity/JobInfoChangeLog";
import { MarkAsNotSuitLog } from "./entity/MarkAsNotSuitLog";
import { ChatMessageRecord } from "./entity/ChatMessageRecord";
import { LlmModelUsageRecord } from "./entity/LlmModelUsageRecord";
import { JobHireStatusRecord } from "./entity/JobHireStatusRecord";

function getBossInfoIfIsEqual (savedOne, currentOne) {
  if (savedOne === currentOne) {
    return true
  }
  if ((savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)) {
    return false;
  }
  if (
    ['__ggr_encryptBrandId', 'brandName', 'title', 'name'].some(key => savedOne[key] !== currentOne[key])
  ) {
    return false
  }
  return true
}

function getCompanyInfoIfIsEqual (savedOne, currentOne) {
  if (savedOne === currentOne) {
    return true
  }
  if (
    (savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)
  ) {
    return false;
  }
  if (['brandName', 'stage', 'scale', 'industry', 'introduce'].some(key => savedOne[key] !== currentOne[key])) {
    return false;
  }
  if (
    [...currentOne.labels ?? []].sort().join('-') !==
    [...savedOne.labels ?? []].sort().join('-')
  ) {
    return false
  }
  return true;
}

function cleanMultiLineTextForCompare (input: string) {
  return input
    // 去掉连续空行
    .replace(/\n\s*\n+/g, '\n')
    // 去掉连续的空白字符
    .replace(/\s+/g, ' ')
    // 去掉每行开头、结尾的空白字符
    .replace(/^\s+|\s+$/gm, '');
}
function getJobInfoIfIsEqual (savedOne, currentOne) {
  if (savedOne === currentOne) {
    return true
  }
  if (
    (savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)
  ) {
    return false;
  }
  if ([
    'encryptUserId',
    'invalidStatus',
    'jobName',
    'positionName',
    'locationName',
    'experienceName',
    'degreeName',
    'salaryDesc',
    'payTypeDesc',
    'address',
    'jobStatusDesc'
  ].some(key => savedOne[key] !== currentOne[key])) {
    return false;
  }
  if (
    cleanMultiLineTextForCompare(savedOne.postDescription?.trim() ?? '') !== 
    cleanMultiLineTextForCompare(currentOne.postDescription?.trim() ?? '')
  ) {
    return false
  }
  if (
    [...currentOne.showSkills ?? []].sort().join('-') !==
    [...savedOne.showSkills ?? []].sort().join('-')
  ) {
    return false
  }
  return true;
}

export async function saveJobInfoFromRecommendPage(ds: DataSource, _jobInfo) {
  const { bossInfo, brandComInfo, jobInfo } = _jobInfo;

  bossInfo['__ggr_encryptBrandId'] = brandComInfo.encryptBrandId
  bossInfo['__ggr_encryptBossId'] = jobInfo.encryptUserId
  //#region boss
  // get origin
  const bossInfoChangeLogRepository = ds.getRepository(BossInfoChangeLog)
  let lastSavedBossInfo
  try {
    lastSavedBossInfo = JSON.parse((await bossInfoChangeLogRepository.findOne({
      where: { encryptBossId: jobInfo.encryptUserId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedBossInfo = null
  }
  const isBossInfoEqual = getBossInfoIfIsEqual(lastSavedBossInfo, bossInfo)
  if (!isBossInfoEqual) {
    const changeLog = new BossInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(bossInfo)
    changeLog.encryptBossId = jobInfo.encryptUserId
    changeLog.updateTime = new Date()
    await bossInfoChangeLogRepository.save(changeLog)
  }
  const boss = new BossInfo();
  boss.encryptBossId = jobInfo.encryptUserId;
  boss.encryptCompanyId = brandComInfo.encryptBrandId;
  boss.name = bossInfo.name;
  boss.title = bossInfo.title;
  boss.date = new Date();
  const bossInfoRepository = ds.getRepository(BossInfo);
  await bossInfoRepository.save(boss);
  //#endregion

  //#region company
  // get origin
  const companyInfoChangeLogRepository = ds.getRepository(CompanyInfoChangeLog)
  let lastSavedCompanyInfo
  try {
    lastSavedCompanyInfo = JSON.parse((await companyInfoChangeLogRepository.findOne({
      where: { encryptCompanyId: brandComInfo.encryptBrandId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedCompanyInfo = null
  }
  const isCompanyInfoEqual = getCompanyInfoIfIsEqual(lastSavedCompanyInfo, brandComInfo)
  if (!isCompanyInfoEqual) {
    const changeLog = new CompanyInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(brandComInfo)
    changeLog.encryptCompanyId = brandComInfo.encryptBrandId
    changeLog.updateTime = new Date()
    await companyInfoChangeLogRepository.save(changeLog)
  }

  const company = new CompanyInfo();
  company.encryptCompanyId = brandComInfo.encryptBrandId;
  company.brandName = brandComInfo.brandName;
  company.name = brandComInfo.customerBrandName;
  company.industryName = brandComInfo.industryName;
  company.stageName = brandComInfo.stageName;
  const companyScale = parseCompanyScale(brandComInfo.scaleName);
  company.scaleLow = companyScale[0];
  company.scaleHigh = companyScale[1];

  const companyInfoRepository = ds.getRepository(CompanyInfo);
  await companyInfoRepository.save(company);
  //#endregion

  //#region job
  const jobInfoChangeLogRepository = ds.getRepository(JobInfoChangeLog);
  let lastSavedJobInfo
  try {
    lastSavedJobInfo = JSON.parse((await jobInfoChangeLogRepository.findOne({
      where: { encryptJobId: jobInfo.encryptId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedJobInfo = null
  }
  const isJobInfoEqual = getJobInfoIfIsEqual(lastSavedJobInfo, jobInfo)
  if (!isJobInfoEqual) {
    const changeLog = new JobInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(jobInfo)
    changeLog.encryptJobId = jobInfo.encryptId
    changeLog.updateTime = new Date()
    await jobInfoChangeLogRepository.save(changeLog)
  }

  const job = new JobInfo();
  const jobSalary = parseSalary(jobInfo.salaryDesc);
  const jobUpdatePayload: JobInfo = {
    address: jobInfo.address,
    degreeName: jobInfo.degreeName,
    description: jobInfo.postDescription,
    encryptBossId: jobInfo.encryptUserId,
    encryptCompanyId: brandComInfo.encryptBrandId,
    encryptJobId: jobInfo.encryptId,
    jobName: jobInfo.jobName,
    positionName: jobInfo.positionName,
    experienceName: jobInfo.experienceName,
    salaryHigh: jobSalary.high,
    salaryLow: jobSalary.low,
    salaryMonth: jobSalary.month,
  };

  Object.assign(job, jobUpdatePayload);

  const jobInfoRepository = ds.getRepository(JobInfo);
  await jobInfoRepository.save(job);
  //#endregion

  //#region save boss active status
  // look up if the lastActiveStatus of the newest one is equal to the current one.
  // if equal, just update the updateDate
  // else insert a new record

  const bossActiveStatusRecord = new BossActiveStatusRecord();
  bossActiveStatusRecord.encryptBossId = boss.encryptBossId;
  bossActiveStatusRecord.updateTime = new Date();
  bossActiveStatusRecord.lastActiveStatus = bossInfo.activeTimeDesc;

  const bossActiveStatusRecordRepository = ds.getRepository(
    BossActiveStatusRecord
  );
  const existNewestRecordByBossId =
    await bossActiveStatusRecordRepository.findOne({
      where: { encryptBossId: boss.encryptBossId },
      order: { updateTime: "DESC" },
    });
  if (
    existNewestRecordByBossId &&
    existNewestRecordByBossId.lastActiveStatus === bossInfo.activeTimeDesc
  ) {
    bossActiveStatusRecord.id = existNewestRecordByBossId.id;
  }
  await bossActiveStatusRecordRepository.save(bossActiveStatusRecord);
  //#endregion
  return;
}

export async function saveChatStartupRecord(
  ds: DataSource,
  _jobInfo,
  { encryptUserId },
  { autoStartupChatRecordId = undefined, chatStartupFrom = undefined, jobSource = undefined } = {}
) {
  const { jobInfo } = _jobInfo;

  //#region chat-startup-log
  const chatStartupLog = new ChatStartupLog()
  const chatStartupLogPayload: Partial<ChatStartupLog> = {
    date: new Date(),
    encryptCurrentUserId: encryptUserId,
    encryptJobId: jobInfo.encryptId,
    autoStartupChatRecordId,
    chatStartupFrom,
    jobSource,
  }
  Object.assign(chatStartupLog, chatStartupLogPayload)

  const chatStartupLogRepository = ds.getRepository(ChatStartupLog);
  await chatStartupLogRepository.save(chatStartupLog);
  //#endregion
  return
}

export async function saveMarkAsNotSuitRecord(
  ds: DataSource,
  _jobInfo,
  { encryptUserId },
  { autoStartupChatRecordId = undefined, markFrom = undefined, extInfo = undefined, markReason = undefined, markOp = undefined, jobSource = undefined } = {}
) {
  const { jobInfo } = _jobInfo;

  //#region mark-as-not-suit-log
  const markAsNotSuitLog = new MarkAsNotSuitLog()
  const markAsNotSuitLogPayload: Partial<MarkAsNotSuitLog> = {
    date: new Date(),
    encryptCurrentUserId: encryptUserId,
    encryptJobId: jobInfo.encryptId,
    autoStartupChatRecordId,
    markFrom,
    markReason,
    extInfo: extInfo ? JSON.stringify(extInfo) : undefined,
    markOp,
    jobSource,
  }
  Object.assign(markAsNotSuitLog, markAsNotSuitLogPayload)

  const markAsNotSuitLogRepository = ds.getRepository(MarkAsNotSuitLog);
  await markAsNotSuitLogRepository.save(markAsNotSuitLog);
  //#endregion
  return
}

export async function saveChatMessageRecord(
  ds: DataSource,
  records: ChatMessageRecord[]
) {
  //#region mark-as-not-suit-log
  const chatMessageRecordList = records.map(it => {
    const o = new ChatMessageRecord()
    Object.assign(o, it)
    return o
  })
  const chatMessageRecordRepository = ds.getRepository(ChatMessageRecord);
  await chatMessageRecordRepository.save(chatMessageRecordList);
  //#endregion
  return
}

export async function saveGptCompletionRequestRecord(
  ds: DataSource,
  records: LlmModelUsageRecord[]
) {
  //#region mark-as-not-suit-log
  const list = records.map(it => {
    const o = new LlmModelUsageRecord()
    for (const k of Object.keys(it)) {
      o[k] = it[k]
    }
    return o
  })
  const chatMessageRecordRepository = ds.getRepository(LlmModelUsageRecord);
  await chatMessageRecordRepository.save(list);
  //#endregion
  return
}

export async function getNotSuitMarkRecordsInLastSomeDays (ds: DataSource, days = 0) {
  const repo = ds.getRepository(MarkAsNotSuitLog)
  const result = await repo.findBy({
    date: Raw(alias => `DATE(${alias}) >= DATE('${
      new Date(
        Number(new Date()) - days * 24 * 60 * 60 * 1000
      ).toISOString()
    }')`)
  })
  return result
}

export async function getChatStartupRecordsInLastSomeDays (ds: DataSource, days = 0) {
  const repo = ds.getRepository(ChatStartupLog)
  const result = await repo.findBy({
    date: Raw(alias => `DATE(${alias}) >= DATE('${
      new Date(
        Number(new Date()) - days * 24 * 60 * 60 * 1000
      ).toISOString()
    }')`)
  })
  return result
}

export async function getBossIdsByJobIds (ds: DataSource, jobIds: string[] = []) {
  const repo = ds.getRepository(JobInfo)
  const result = await repo.find({
    where: jobIds.map(
      id => ({
        encryptJobId: id
      })
    )
  })
  return result
}

export async function saveJobHireStatusRecord(
  ds: DataSource,
  record: JobHireStatusRecord
) {
  const jobHireStatusRecordRepository = ds.getRepository(JobHireStatusRecord);
  await jobHireStatusRecordRepository.save(record);
  return
}

export async function getJobHireStatusRecord(
  ds: DataSource,
  encryptJobId: string
) {
  const repo = ds.getRepository(JobHireStatusRecord)
  const result = await repo.findOne({
    where: {
      encryptJobId
    }
  })
  return result
}

export interface CompanyDetailInfo {
  encryptCompanyId: string
  brandName: string
  customerBrandName?: string
  industryName?: string
  stageName?: string
  scaleName?: string
}

function getCompanyDetailIfIsEqual(savedOne: CompanyDetailInfo | null, currentOne: CompanyDetailInfo) {
  if (savedOne === null && currentOne === null) {
    return true
  }
  if (
    (savedOne !== null && currentOne === null) ||
    (savedOne === null && currentOne !== null)
  ) {
    return false;
  }
  if (
    savedOne.brandName !== currentOne.brandName ||
    savedOne.customerBrandName !== currentOne.customerBrandName ||
    savedOne.industryName !== currentOne.industryName ||
    savedOne.stageName !== currentOne.stageName ||
    savedOne.scaleName !== currentOne.scaleName
  ) {
    return false
  }
  return true;
}

export async function saveCompanyInfo(
  ds: DataSource,
  companyInfo: CompanyDetailInfo
) {
  const companyInfoChangeLogRepository = ds.getRepository(CompanyInfoChangeLog)
  
  // Get last saved info
  let lastSavedCompanyInfo: CompanyDetailInfo | null = null
  try {
    lastSavedCompanyInfo = JSON.parse((await companyInfoChangeLogRepository.findOne({
      where: { encryptCompanyId: companyInfo.encryptCompanyId },
      order: { updateTime: "DESC" },
    })).dataAsJson);
  } catch {
    lastSavedCompanyInfo = null
  }
  
  const isCompanyInfoEqual = getCompanyDetailIfIsEqual(lastSavedCompanyInfo, companyInfo)
  if (!isCompanyInfoEqual) {
    const changeLog = new CompanyInfoChangeLog()
    changeLog.dataAsJson = JSON.stringify(companyInfo)
    changeLog.encryptCompanyId = companyInfo.encryptCompanyId
    changeLog.updateTime = new Date()
    await companyInfoChangeLogRepository.save(changeLog)
  }

  const company = new CompanyInfo();
  company.encryptCompanyId = companyInfo.encryptCompanyId;
  company.brandName = companyInfo.brandName;
  company.name = companyInfo.customerBrandName || companyInfo.brandName;
  company.industryName = companyInfo.industryName;
  company.stageName = companyInfo.stageName;
  const companyScale = parseCompanyScale(companyInfo.scaleName);
  company.scaleLow = companyScale[0];
  company.scaleHigh = companyScale[1];

  const companyInfoRepository = ds.getRepository(CompanyInfo);
  await companyInfoRepository.save(company);
  
  return company
}

import { BossChatRelation } from './entity/BossChatRelation'

export interface ChatRelationItem {
  friendId: number
  encryptBossId: string
  name: string
  title?: string
  avatar?: string
  encryptJobId: string
  jobName: string
  brandName: string
  encryptCompanyId?: string
  lastText?: string
  lastMessageId?: string
  unreadCount: number
  lastMsgStatus?: number
  lastTS?: number
  updateTime: number
  isTop: number
  relationType?: number
  friendSource?: number
  goldGeekStatus?: number
  sourceTitle?: string
  lastIsSelf: boolean
}

export async function saveBossChatRelationList(
  ds: DataSource,
  chatList: ChatRelationItem[],
  encryptUserId: string
) {
  const repo = ds.getRepository(BossChatRelation)
  const syncTime = new Date()
  
  for (const item of chatList) {
    // 查找是否已存在
    let relation = await repo.findOne({
      where: {
        friendId: item.friendId,
        encryptUserId
      }
    })
    
    if (!relation) {
      relation = new BossChatRelation()
      relation.friendId = item.friendId
      relation.encryptUserId = encryptUserId
    }
    
    // 更新字段
    relation.encryptBossId = item.encryptBossId
    relation.bossName = item.name
    relation.bossTitle = item.title
    relation.bossAvatar = item.avatar
    relation.encryptJobId = item.encryptJobId
    relation.jobName = item.jobName
    relation.brandName = item.brandName
    relation.encryptCompanyId = item.encryptCompanyId
    relation.lastText = item.lastText
    relation.lastMessageId = item.lastMessageId
    relation.unreadCount = item.unreadCount
    relation.lastMsgStatus = item.lastMsgStatus
    relation.lastTS = item.lastTS
    relation.updateTime = item.updateTime
    relation.isTop = item.isTop
    relation.relationType = item.relationType
    relation.friendSource = item.friendSource
    relation.goldGeekStatus = item.goldGeekStatus
    relation.sourceTitle = item.sourceTitle
    relation.lastIsSelf = item.lastIsSelf
    relation.syncTime = syncTime
    
    await repo.save(relation)
  }
  
  return {
    syncedCount: chatList.length,
    syncTime
  }
}

export async function getBossChatRelationList(
  ds: DataSource,
  encryptUserId: string,
  options: { pageNo?: number; pageSize?: number } = {}
) {
  const { pageNo = 1, pageSize = 100 } = options
  const repo = ds.getRepository(BossChatRelation)
  
  const [data, totalItemCount] = await repo.findAndCount({
    where: { encryptUserId },
    order: { updateTime: 'DESC' },
    skip: (pageNo - 1) * pageSize,
    take: pageSize
  })
  
  return {
    data,
    pageNo,
    totalItemCount
  }
}
// Append Interview Record Handlers at the end of the file
import { InterviewRecord, InterviewStage, InterviewSource } from "./entity/InterviewRecord";
import { VInterviewRecord } from "./entity/VInterviewRecord";

export interface CreateInterviewRecordData {
  encryptBossId: string
  encryptJobId: string
  encryptUserId?: string
  bossName: string
  bossTitle?: string
  brandName: string
  jobName: string
  stage?: InterviewStage
  source?: InterviewSource
  notes?: string
  interviewTime?: Date
  address?: string
  contactPhone?: string
  contactName?: string
  lastChatText?: string
  lastChatTime?: Date
}

export async function createInterviewRecord(
  ds: DataSource,
  data: CreateInterviewRecordData
) {
  const repo = ds.getRepository(InterviewRecord)
  
  // Check if already exists
  const existing = await repo.findOne({
    where: {
      encryptBossId: data.encryptBossId,
      encryptJobId: data.encryptJobId
    }
  })
  
  if (existing) {
    throw new Error('该职位已在面试列表中')
  }
  
  const record = new InterviewRecord()
  Object.assign(record, data)
  record.stage = data.stage || InterviewStage.PHONE_INTERVIEW
  record.source = data.source || InterviewSource.FROM_CHAT
  
  return await repo.save(record)
}

export async function updateInterviewRecord(
  ds: DataSource,
  id: number,
  data: Partial<CreateInterviewRecordData>
) {
  const repo = ds.getRepository(InterviewRecord)
  const record = await repo.findOneBy({ id })
  
  if (!record) {
    throw new Error('面试记录不存在')
  }
  
  Object.assign(record, data)
  return await repo.save(record)
}

export async function deleteInterviewRecord(
  ds: DataSource,
  id: number
) {
  const repo = ds.getRepository(InterviewRecord)
  const result = await repo.delete({ id })
  return result.affected > 0
}

export async function getInterviewRecordList(
  ds: DataSource,
  options: { 
    pageNo?: number
    pageSize?: number
    stage?: InterviewStage
    encryptUserId?: string
  } = {}
) {
  const { pageNo = 1, pageSize = 100, stage, encryptUserId } = options
  const repo = ds.getRepository(VInterviewRecord)
  
  const where: any = {}
  if (stage) {
    where.stage = stage
  }
  if (encryptUserId) {
    where.encryptUserId = encryptUserId
  }
  
  const [data, totalItemCount] = await repo.findAndCount({
    where,
    order: { updatedAt: 'DESC' },
    skip: (pageNo - 1) * pageSize,
    take: pageSize
  })
  
  return {
    data,
    pageNo,
    totalItemCount
  }
}

export async function getInterviewRecordById(
  ds: DataSource,
  id: number
) {
  const repo = ds.getRepository(VInterviewRecord)
  return await repo.findOneBy({ id })
}

export async function checkIsInInterview(
  ds: DataSource,
  encryptBossId: string,
  encryptJobId: string
) {
  const repo = ds.getRepository(InterviewRecord)
  const record = await repo.findOne({
    where: {
      encryptBossId,
      encryptJobId
    }
  })
  return !!record
}

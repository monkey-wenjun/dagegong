import { ViewEntity, ViewColumn } from 'typeorm';
import { InterviewStage, InterviewSource } from './InterviewRecord';

@ViewEntity({
  expression: `
    SELECT 
      interview_record.*,
      boss_info.avatar AS bossAvatar,
      job_info.salaryLow,
      job_info.salaryHigh,
      job_info.salaryMonth,
      job_info.cityName,
      job_info.experienceName
    FROM interview_record
    LEFT JOIN boss_info ON interview_record.encryptBossId = boss_info.encryptBossId
    LEFT JOIN job_info ON interview_record.encryptJobId = job_info.encryptJobId
  `
})
export class VInterviewRecord {
  @ViewColumn()
  id: number;

  @ViewColumn()
  encryptBossId: string;

  @ViewColumn()
  encryptJobId: string;

  @ViewColumn()
  encryptUserId?: string;

  @ViewColumn()
  bossName: string;

  @ViewColumn()
  bossTitle?: string;

  @ViewColumn()
  bossAvatar?: string;

  @ViewColumn()
  brandName: string;

  @ViewColumn()
  jobName: string;

  @ViewColumn()
  stage: InterviewStage;

  @ViewColumn()
  source: InterviewSource;

  @ViewColumn()
  notes?: string;

  @ViewColumn()
  interviewTime?: Date;

  @ViewColumn()
  address?: string;

  @ViewColumn()
  contactPhone?: string;

  @ViewColumn()
  contactName?: string;

  @ViewColumn()
  isOfferReceived: boolean;

  @ViewColumn()
  salaryOffered?: string;

  @ViewColumn()
  createdAt: Date;

  @ViewColumn()
  updatedAt: Date;

  @ViewColumn()
  salaryLow?: number;

  @ViewColumn()
  salaryHigh?: number;

  @ViewColumn()
  salaryMonth?: number;

  @ViewColumn()
  cityName?: string;

  @ViewColumn()
  experienceName?: string;

  @ViewColumn()
  lastChatText?: string;

  @ViewColumn()
  lastChatTime?: Date;
}

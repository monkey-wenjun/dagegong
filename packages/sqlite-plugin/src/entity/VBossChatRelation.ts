import * as typeorm from 'typeorm';
const { ViewEntity, ViewColumn } = typeorm

@ViewEntity({
  expression: `SELECT
    boss_chat_relation.*,
    job_info.positionName as positionName,
    job_info.salaryLow as salaryLow,
    job_info.salaryHigh as salaryHigh,
    job_info.salaryMonth as salaryMonth,
    job_info.experienceName as experienceName,
    job_info.degreeName as degreeName,
    job_info.address as address
  FROM
    boss_chat_relation
    LEFT JOIN job_info ON boss_chat_relation.encryptJobId = job_info.encryptJobId
  ORDER BY boss_chat_relation.updateTime DESC
  `,
})
export class VBossChatRelation {
  @ViewColumn()
  id: number;

  @ViewColumn()
  friendId: number;

  @ViewColumn()
  encryptBossId: string;

  @ViewColumn()
  bossName: string;

  @ViewColumn()
  bossTitle?: string;

  @ViewColumn()
  bossAvatar?: string;

  @ViewColumn()
  encryptJobId: string;

  @ViewColumn()
  jobName: string;

  @ViewColumn()
  positionName?: string;

  @ViewColumn()
  brandName: string;

  @ViewColumn()
  salaryLow?: number;

  @ViewColumn()
  salaryHigh?: number;

  @ViewColumn()
  salaryMonth?: number;

  @ViewColumn()
  experienceName?: string;

  @ViewColumn()
  degreeName?: string;

  @ViewColumn()
  address?: string;

  @ViewColumn()
  lastText?: string;

  @ViewColumn()
  unreadCount: number;

  @ViewColumn()
  lastMsgStatus?: number;

  @ViewColumn()
  updateTime: number;

  @ViewColumn()
  isTop: number;

  @ViewColumn()
  syncTime: Date;
}

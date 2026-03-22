import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastIsSelfToVBossChatRelationView1770000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 删除旧视图
    await queryRunner.query(`DROP VIEW IF EXISTS v_boss_chat_relation`);
    
    // 创建新视图，添加 lastIsSelf 字段
    await queryRunner.query(`
      CREATE VIEW IF NOT EXISTS v_boss_chat_relation AS
      SELECT
        boss_chat_relation.id,
        boss_chat_relation.friendId,
        boss_chat_relation.encryptBossId,
        boss_chat_relation.bossName,
        boss_chat_relation.bossTitle,
        boss_chat_relation.bossAvatar,
        boss_chat_relation.encryptJobId,
        boss_chat_relation.jobName,
        job_info.positionName as positionName,
        boss_chat_relation.brandName,
        job_info.salaryLow as salaryLow,
        job_info.salaryHigh as salaryHigh,
        job_info.salaryMonth as salaryMonth,
        job_info.experienceName as experienceName,
        job_info.degreeName as degreeName,
        job_info.address as address,
        boss_chat_relation.lastText,
        boss_chat_relation.unreadCount,
        boss_chat_relation.lastMsgStatus,
        boss_chat_relation.updateTime,
        boss_chat_relation.isTop,
        boss_chat_relation.syncTime,
        boss_chat_relation.encryptUserId,
        boss_chat_relation.lastIsSelf
      FROM
        boss_chat_relation
        LEFT JOIN job_info ON boss_chat_relation.encryptJobId = job_info.encryptJobId
      ORDER BY boss_chat_relation.updateTime DESC
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除新视图
    await queryRunner.query(`DROP VIEW IF EXISTS v_boss_chat_relation`);
    
    // 恢复旧视图（不包含 lastIsSelf）
    await queryRunner.query(`
      CREATE VIEW IF NOT EXISTS v_boss_chat_relation AS
      SELECT
        boss_chat_relation.id,
        boss_chat_relation.friendId,
        boss_chat_relation.encryptBossId,
        boss_chat_relation.bossName,
        boss_chat_relation.bossTitle,
        boss_chat_relation.bossAvatar,
        boss_chat_relation.encryptJobId,
        boss_chat_relation.jobName,
        job_info.positionName as positionName,
        boss_chat_relation.brandName,
        job_info.salaryLow as salaryLow,
        job_info.salaryHigh as salaryHigh,
        job_info.salaryMonth as salaryMonth,
        job_info.experienceName as experienceName,
        job_info.degreeName as degreeName,
        job_info.address as address,
        boss_chat_relation.lastText,
        boss_chat_relation.unreadCount,
        boss_chat_relation.lastMsgStatus,
        boss_chat_relation.updateTime,
        boss_chat_relation.isTop,
        boss_chat_relation.syncTime,
        boss_chat_relation.encryptUserId
      FROM
        boss_chat_relation
        LEFT JOIN job_info ON boss_chat_relation.encryptJobId = job_info.encryptJobId
      ORDER BY boss_chat_relation.updateTime DESC
    `);
  }
}

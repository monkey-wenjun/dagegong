import { MigrationInterface, QueryRunner } from "typeorm";

export class FixBossChatRelationNullable1770000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 删除旧表（数据会丢失，但这是开发环境，可以接受）
    await queryRunner.query(`DROP TABLE IF EXISTS boss_chat_relation`);
    
    // 创建新表，允许更多字段为空
    await queryRunner.query(`
      CREATE TABLE boss_chat_relation (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        friendId integer NOT NULL,
        encryptBossId varchar NOT NULL,
        bossName varchar NOT NULL,
        bossTitle varchar,
        bossAvatar varchar,
        encryptJobId varchar,
        jobName varchar,
        brandName varchar,
        encryptCompanyId varchar,
        encryptUserId varchar NOT NULL,
        lastText text,
        lastMessageId varchar,
        unreadCount integer NOT NULL DEFAULT (0),
        lastMsgStatus integer,
        lastTS integer,
        updateTime integer NOT NULL,
        isTop integer NOT NULL DEFAULT (0),
        relationType integer,
        friendSource integer,
        goldGeekStatus integer,
        sourceTitle text,
        lastIsSelf boolean NOT NULL DEFAULT (1),
        extInfo text,
        syncTime datetime NOT NULL
      )
    `);
    
    // 重新创建索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_BOSS_CHAT_RELATION_ENCRYPT_BOSS_ID 
      ON boss_chat_relation(encryptBossId)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_BOSS_CHAT_RELATION_ENCRYPT_JOB_ID 
      ON boss_chat_relation(encryptJobId)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_BOSS_CHAT_RELATION_ENCRYPT_USER_ID 
      ON boss_chat_relation(encryptUserId)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_BOSS_CHAT_RELATION_UPDATE_TIME 
      ON boss_chat_relation(updateTime DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 无法回滚
  }
}

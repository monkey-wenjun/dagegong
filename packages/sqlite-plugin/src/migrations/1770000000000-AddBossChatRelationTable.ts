import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddBossChatRelationTable1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "boss_chat_relation",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "friendId",
            type: "integer",
            isNullable: false,
          },
          {
            name: "encryptBossId",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "bossName",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "bossTitle",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "bossAvatar",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "encryptJobId",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "jobName",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "brandName",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "encryptCompanyId",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "encryptUserId",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "lastText",
            type: "text",
            isNullable: true,
          },
          {
            name: "lastMessageId",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "unreadCount",
            type: "integer",
            default: 0,
          },
          {
            name: "lastMsgStatus",
            type: "integer",
            isNullable: true,
          },
          {
            name: "lastTS",
            type: "integer",
            isNullable: true,
          },
          {
            name: "updateTime",
            type: "integer",
            isNullable: false,
          },
          {
            name: "isTop",
            type: "integer",
            default: 0,
          },
          {
            name: "relationType",
            type: "integer",
            isNullable: true,
          },
          {
            name: "friendSource",
            type: "integer",
            isNullable: true,
          },
          {
            name: "goldGeekStatus",
            type: "integer",
            isNullable: true,
          },
          {
            name: "sourceTitle",
            type: "text",
            isNullable: true,
          },
          {
            name: "lastIsSelf",
            type: "boolean",
            default: true,
          },
          {
            name: "extInfo",
            type: "text",
            isNullable: true,
          },
          {
            name: "syncTime",
            type: "datetime",
            isNullable: false,
          },
        ],
      }),
      true
    );

    // 创建索引
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
    await queryRunner.dropTable("boss_chat_relation");
  }
}

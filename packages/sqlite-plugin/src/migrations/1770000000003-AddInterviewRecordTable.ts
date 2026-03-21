import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInterviewRecordTable1770000000003 implements MigrationInterface {
  name = 'AddInterviewRecordTable1770000000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create interview_record table
    await queryRunner.query(`
      CREATE TABLE "interview_record" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "encryptBossId" varchar NOT NULL,
        "encryptJobId" varchar NOT NULL,
        "encryptUserId" varchar,
        "bossName" varchar NOT NULL,
        "bossTitle" varchar,
        "brandName" varchar NOT NULL,
        "jobName" varchar NOT NULL,
        "stage" varchar CHECK("stage" IN ('phone_interview', 'online_interview', 'onsite_interview', 'hr_interview', 'offer_negotiation', 'offer_accepted', 'rejected', 'withdrawn')) DEFAULT 'phone_interview' NOT NULL,
        "source" varchar CHECK("source" IN ('from_chat', 'manual_add')) DEFAULT 'from_chat' NOT NULL,
        "notes" text,
        "interviewTime" datetime,
        "address" varchar,
        "contactPhone" varchar,
        "contactName" varchar,
        "isOfferReceived" boolean DEFAULT 0 NOT NULL,
        "salaryOffered" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "lastChatText" text,
        "lastChatTime" datetime
      )
    `);

    // Create index
    await queryRunner.query(`
      CREATE INDEX "IDX_INTERVIEW_BOSS_JOB" ON "interview_record" ("encryptBossId", "encryptJobId")
    `);
    
    await queryRunner.query(`
      CREATE INDEX "IDX_INTERVIEW_STAGE" ON "interview_record" ("stage")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INTERVIEW_USER" ON "interview_record" ("encryptUserId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_INTERVIEW_USER"`);
    await queryRunner.query(`DROP INDEX "IDX_INTERVIEW_STAGE"`);
    await queryRunner.query(`DROP INDEX "IDX_INTERVIEW_BOSS_JOB"`);
    await queryRunner.query(`DROP TABLE "interview_record"`);
  }
}

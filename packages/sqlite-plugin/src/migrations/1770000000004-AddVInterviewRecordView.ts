import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVInterviewRecordView1770000000004 implements MigrationInterface {
  name = 'AddVInterviewRecordView1770000000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE VIEW "v_interview_record" AS
      SELECT 
        interview_record.*,
        boss_info.avatar AS "bossAvatar",
        job_info."salaryLow",
        job_info."salaryHigh",
        job_info."salaryMonth",
        job_info."cityName",
        job_info."experienceName"
      FROM interview_record
      LEFT JOIN boss_info ON interview_record."encryptBossId" = boss_info."encryptBossId"
      LEFT JOIN job_info ON interview_record."encryptJobId" = job_info."encryptId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW "v_interview_record"`);
  }
}

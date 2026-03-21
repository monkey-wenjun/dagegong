import { MigrationInterface, QueryRunner } from "typeorm";

export class FixVInterviewRecordView1770000000005 implements MigrationInterface {
  name = 'FixVInterviewRecordView1770000000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old view
    await queryRunner.query(`DROP VIEW IF EXISTS "v_interview_record"`);
    
    // Recreate the view without boss_info.avatar (column doesn't exist)
    await queryRunner.query(`
      CREATE VIEW "v_interview_record" AS
      SELECT 
        interview_record.*,
        job_info."salaryLow",
        job_info."salaryHigh",
        job_info."salaryMonth",
        job_info."cityName",
        job_info."experienceName"
      FROM interview_record
      LEFT JOIN job_info ON interview_record."encryptJobId" = job_info."encryptId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "v_interview_record"`);
  }
}

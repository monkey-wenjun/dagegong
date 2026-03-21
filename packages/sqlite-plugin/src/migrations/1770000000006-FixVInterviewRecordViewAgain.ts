import { MigrationInterface, QueryRunner } from "typeorm";

export class FixVInterviewRecordViewAgain1770000000006 implements MigrationInterface {
  name = 'FixVInterviewRecordViewAgain1770000000006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old view
    await queryRunner.query(`DROP VIEW IF EXISTS "v_interview_record"`);
    
    // Recreate the view with only existing columns
    await queryRunner.query(`
      CREATE VIEW "v_interview_record" AS
      SELECT 
        interview_record.*,
        job_info."salaryLow",
        job_info."salaryHigh",
        job_info."salaryMonth",
        job_info."experienceName"
      FROM interview_record
      LEFT JOIN job_info ON interview_record."encryptJobId" = job_info."encryptJobId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "v_interview_record"`);
  }
}

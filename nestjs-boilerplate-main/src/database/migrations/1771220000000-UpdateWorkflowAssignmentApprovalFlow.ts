import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateWorkflowAssignmentApprovalFlow1771220000000
  implements MigrationInterface
{
  name = 'UpdateWorkflowAssignmentApprovalFlow1771220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(
      `UPDATE "workflow_assignment" SET "status" = 'draft' WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD "submittedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD "reviewedByUserId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD "reviewedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD "reviewFeedback" character varying(2000)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_reviewedByUserId" ON "workflow_assignment" ("reviewedByUserId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_workflow_assignment_reviewedByUserId" FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_workflow_assignment_reviewedByUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_reviewedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP COLUMN "reviewFeedback"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP COLUMN "reviewedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP COLUMN "reviewedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP COLUMN "submittedAt"`,
    );
    await queryRunner.query(
      `UPDATE "workflow_assignment" SET "status" = 'pending' WHERE "status" = 'draft'`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowAssignmentTable1771210000000
  implements MigrationInterface
{
  name = 'CreateWorkflowAssignmentTable1771210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow_assignment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "assignedToUserId" integer NOT NULL, "createdByUserId" integer, "entityType" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "templateData" jsonb NOT NULL DEFAULT '{}'::jsonb, "contextData" jsonb NOT NULL DEFAULT '{}'::jsonb, "formData" jsonb NOT NULL DEFAULT '{}'::jsonb, "sourceWorkflowId" uuid, "sourceNodeId" uuid, "createdEntityId" character varying, "notifiedAt" TIMESTAMP, "completedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_workflow_assignment_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_assignedToUserId" ON "workflow_assignment" ("assignedToUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_createdByUserId" ON "workflow_assignment" ("createdByUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_entityType" ON "workflow_assignment" ("entityType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_status" ON "workflow_assignment" ("status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_workflow_assignment_assignedToUserId" FOREIGN KEY ("assignedToUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_workflow_assignment_createdByUserId" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_workflow_assignment_createdByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_workflow_assignment_assignedToUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_entityType"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_createdByUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_assignedToUserId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_assignment"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowScheduleRuntimeTable1773200000000
  implements MigrationInterface
{
  name = 'CreateWorkflowScheduleRuntimeTable1773200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow_schedule_runtime" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflowId" uuid NOT NULL,
        "workflowNodeId" uuid NOT NULL,
        "status" character varying NOT NULL DEFAULT 'scheduled',
        "configSignature" text,
        "mode" character varying,
        "timezone" character varying,
        "nextRunAt" TIMESTAMP,
        "lastExecutedAt" TIMESTAMP,
        "lastEvaluatedAt" TIMESTAMP,
        "lastError" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_schedule_runtime_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_schedule_runtime_workflowId" ON "workflow_schedule_runtime" ("workflowId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_workflow_schedule_runtime_workflowNodeId" ON "workflow_schedule_runtime" ("workflowNodeId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_schedule_runtime" ADD CONSTRAINT "FK_workflow_schedule_runtime_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_schedule_runtime" ADD CONSTRAINT "FK_workflow_schedule_runtime_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_schedule_runtime" DROP CONSTRAINT "FK_workflow_schedule_runtime_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_schedule_runtime" DROP CONSTRAINT "FK_workflow_schedule_runtime_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_schedule_runtime_workflowNodeId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_schedule_runtime_workflowId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_schedule_runtime"`);
  }
}

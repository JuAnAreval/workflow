import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowSavedJsonTable1771235000000
  implements MigrationInterface
{
  name = 'CreateWorkflowSavedJsonTable1771235000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow_saved_json" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workflowId" uuid NOT NULL, "workflowNodeId" uuid, "sourceType" character varying(50) NOT NULL, "sourceNodeType" character varying(120), "nodeLabel" character varying(255), "payload" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_workflow_saved_json_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_saved_json_workflowId" ON "workflow_saved_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_saved_json_workflowNodeId" ON "workflow_saved_json" ("workflowNodeId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" ADD CONSTRAINT "FK_workflow_saved_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" ADD CONSTRAINT "FK_workflow_saved_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" DROP CONSTRAINT "FK_workflow_saved_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" DROP CONSTRAINT "FK_workflow_saved_json_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_saved_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_saved_json_workflowId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_saved_json"`);
  }
}

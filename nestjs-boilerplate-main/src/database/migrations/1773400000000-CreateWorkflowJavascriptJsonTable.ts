import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowJavascriptJsonTable1773400000000
  implements MigrationInterface
{
  name = 'CreateWorkflowJavascriptJsonTable1773400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow_javascript_json" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workflowId" uuid NOT NULL, "workflowNodeId" uuid NOT NULL, "nodeLabel" character varying(255), "payload" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_workflow_javascript_json_workflowNodeId" UNIQUE ("workflowNodeId"), CONSTRAINT "PK_workflow_javascript_json_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_javascript_json_workflowId" ON "workflow_javascript_json" ("workflowId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_javascript_json" ADD CONSTRAINT "FK_workflow_javascript_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_javascript_json" ADD CONSTRAINT "FK_workflow_javascript_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_javascript_json" DROP CONSTRAINT "FK_workflow_javascript_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_javascript_json" DROP CONSTRAINT "FK_workflow_javascript_json_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_javascript_json_workflowId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_javascript_json"`);
  }
}

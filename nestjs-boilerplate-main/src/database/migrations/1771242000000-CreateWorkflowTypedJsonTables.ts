import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowTypedJsonTables1771242000000
  implements MigrationInterface
{
  name = 'CreateWorkflowTypedJsonTables1771242000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow_form_json" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workflowId" uuid NOT NULL, "workflowNodeId" uuid NOT NULL, "nodeLabel" character varying(255), "payload" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_workflow_form_json_workflowNodeId" UNIQUE ("workflowNodeId"), CONSTRAINT "PK_workflow_form_json_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_form_json_workflowId" ON "workflow_form_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_http_json" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workflowId" uuid NOT NULL, "workflowNodeId" uuid NOT NULL, "nodeLabel" character varying(255), "payload" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_workflow_http_json_workflowNodeId" UNIQUE ("workflowNodeId"), CONSTRAINT "PK_workflow_http_json_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_http_json_workflowId" ON "workflow_http_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_webhook_json" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workflowId" uuid NOT NULL, "workflowNodeId" uuid NOT NULL, "nodeLabel" character varying(255), "payload" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_workflow_webhook_json_workflowNodeId" UNIQUE ("workflowNodeId"), CONSTRAINT "PK_workflow_webhook_json_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_webhook_json_workflowId" ON "workflow_webhook_json" ("workflowId") `,
    );

    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "FK_workflow_form_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "FK_workflow_form_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "FK_workflow_http_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "FK_workflow_http_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "FK_workflow_webhook_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "FK_workflow_webhook_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "FK_workflow_webhook_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "FK_workflow_webhook_json_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "FK_workflow_http_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "FK_workflow_http_json_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "FK_workflow_form_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "FK_workflow_form_json_workflowId"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_webhook_json_workflowId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_webhook_json"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_http_json_workflowId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_http_json"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_form_json_workflowId"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_form_json"`);
  }
}

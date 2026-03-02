import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignSchemaWithEntities1772463251746
  implements MigrationInterface
{
  name = 'AlignSchemaWithEntities1772463251746';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "FK_workflow_webhook_json_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "FK_workflow_webhook_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" DROP CONSTRAINT "FK_workflow_saved_json_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" DROP CONSTRAINT "FK_workflow_saved_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "FK_workflow_http_json_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "FK_workflow_http_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "FK_workflow_form_json_workflowId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "FK_workflow_form_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_workflow_assignment_assignedToUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_workflow_assignment_createdByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_workflow_assignment_reviewedByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project" DROP CONSTRAINT "FK_2f887f5bbfef4a5d6cb0f55c88d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_webhook_json_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_saved_json_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_saved_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_http_json_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_form_json_workflowId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_assignedToUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_createdByUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_entityType"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_assignment_reviewedByUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2f887f5bbfef4a5d6cb0f55c88"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "UQ_workflow_webhook_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "UQ_workflow_http_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "UQ_workflow_form_json_workflowNodeId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "templateData" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "contextData" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "formData" SET DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_335066835b9cb2987bad5ee315" ON "workflow_webhook_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d23ff75112e6a8f381859e2907" ON "workflow_webhook_json" ("workflowNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f60d9db1d1d414821b670aa4f1" ON "workflow_saved_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_00e6fdab9be723e6f9cc5523d2" ON "workflow_saved_json" ("workflowNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6e25f4296c5f396bd078e06e62" ON "workflow_http_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1d8b2e06e2a8ef38f1f356487d" ON "workflow_http_json" ("workflowNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fd15b7dcdcc1634cb5fcea91a1" ON "workflow_form_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5015944c144bd14fc3d46ef809" ON "workflow_form_json" ("workflowNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb523ad5ffa31dcf3066e7d565" ON "workflow_assignment" ("assignedToUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_684a0b08c71762236294a16a4b" ON "workflow_assignment" ("createdByUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4029545dd046034d9445c4609a" ON "workflow_assignment" ("entityType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e7671f993e5d3792a139fe3d76" ON "workflow_assignment" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1fd66cb6071b134ecdef9dfd18" ON "workflow_assignment" ("reviewedByUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c4b0d3b77eaf26f8b4da879e6" ON "project" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "FK_335066835b9cb2987bad5ee315b" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "FK_d23ff75112e6a8f381859e29078" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" ADD CONSTRAINT "FK_f60d9db1d1d414821b670aa4f17" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" ADD CONSTRAINT "FK_00e6fdab9be723e6f9cc5523d2f" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "FK_6e25f4296c5f396bd078e06e626" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "FK_1d8b2e06e2a8ef38f1f356487d6" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "FK_fd15b7dcdcc1634cb5fcea91a19" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "FK_5015944c144bd14fc3d46ef8094" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_cb523ad5ffa31dcf3066e7d5656" FOREIGN KEY ("assignedToUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_684a0b08c71762236294a16a4b3" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_1fd66cb6071b134ecdef9dfd18e" FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "project" ADD CONSTRAINT "FK_7c4b0d3b77eaf26f8b4da879e63" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project" DROP CONSTRAINT "FK_7c4b0d3b77eaf26f8b4da879e63"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_1fd66cb6071b134ecdef9dfd18e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_684a0b08c71762236294a16a4b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" DROP CONSTRAINT "FK_cb523ad5ffa31dcf3066e7d5656"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "FK_5015944c144bd14fc3d46ef8094"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" DROP CONSTRAINT "FK_fd15b7dcdcc1634cb5fcea91a19"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "FK_1d8b2e06e2a8ef38f1f356487d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" DROP CONSTRAINT "FK_6e25f4296c5f396bd078e06e626"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" DROP CONSTRAINT "FK_00e6fdab9be723e6f9cc5523d2f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" DROP CONSTRAINT "FK_f60d9db1d1d414821b670aa4f17"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "FK_d23ff75112e6a8f381859e29078"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" DROP CONSTRAINT "FK_335066835b9cb2987bad5ee315b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c4b0d3b77eaf26f8b4da879e6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1fd66cb6071b134ecdef9dfd18"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e7671f993e5d3792a139fe3d76"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4029545dd046034d9445c4609a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_684a0b08c71762236294a16a4b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cb523ad5ffa31dcf3066e7d565"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5015944c144bd14fc3d46ef809"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fd15b7dcdcc1634cb5fcea91a1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1d8b2e06e2a8ef38f1f356487d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6e25f4296c5f396bd078e06e62"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_00e6fdab9be723e6f9cc5523d2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f60d9db1d1d414821b670aa4f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d23ff75112e6a8f381859e2907"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_335066835b9cb2987bad5ee315"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "formData" SET DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "contextData" SET DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ALTER COLUMN "templateData" SET DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "UQ_workflow_form_json_workflowNodeId" UNIQUE ("workflowNodeId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "UQ_workflow_http_json_workflowNodeId" UNIQUE ("workflowNodeId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "UQ_workflow_webhook_json_workflowNodeId" UNIQUE ("workflowNodeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f887f5bbfef4a5d6cb0f55c88" ON "project" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_reviewedByUserId" ON "workflow_assignment" ("reviewedByUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_status" ON "workflow_assignment" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_entityType" ON "workflow_assignment" ("entityType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_createdByUserId" ON "workflow_assignment" ("createdByUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_assignment_assignedToUserId" ON "workflow_assignment" ("assignedToUserId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_form_json_workflowId" ON "workflow_form_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_http_json_workflowId" ON "workflow_http_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_saved_json_workflowNodeId" ON "workflow_saved_json" ("workflowNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_saved_json_workflowId" ON "workflow_saved_json" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_webhook_json_workflowId" ON "workflow_webhook_json" ("workflowId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project" ADD CONSTRAINT "FK_2f887f5bbfef4a5d6cb0f55c88d" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_workflow_assignment_reviewedByUserId" FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_workflow_assignment_createdByUserId" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_assignment" ADD CONSTRAINT "FK_workflow_assignment_assignedToUserId" FOREIGN KEY ("assignedToUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "FK_workflow_form_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_form_json" ADD CONSTRAINT "FK_workflow_form_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "FK_workflow_http_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_http_json" ADD CONSTRAINT "FK_workflow_http_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" ADD CONSTRAINT "FK_workflow_saved_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_saved_json" ADD CONSTRAINT "FK_workflow_saved_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "FK_workflow_webhook_json_workflowNodeId" FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_webhook_json" ADD CONSTRAINT "FK_workflow_webhook_json_workflowId" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}

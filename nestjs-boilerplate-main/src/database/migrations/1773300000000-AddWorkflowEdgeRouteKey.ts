import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowEdgeRouteKey1773300000000
  implements MigrationInterface
{
  name = 'AddWorkflowEdgeRouteKey1773300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD "routeKey" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_edge_routeKey" ON "workflow_edge" ("routeKey")`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" DROP CONSTRAINT "UQ_workflow_edge_connection"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD CONSTRAINT "UQ_workflow_edge_route" UNIQUE ("workflowId", "fromNodeId", "routeKey")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" DROP CONSTRAINT "UQ_workflow_edge_route"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD CONSTRAINT "UQ_workflow_edge_connection" UNIQUE ("workflowId", "fromNodeId", "toNodeId")`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_workflow_edge_routeKey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" DROP COLUMN "routeKey"`,
    );
  }
}

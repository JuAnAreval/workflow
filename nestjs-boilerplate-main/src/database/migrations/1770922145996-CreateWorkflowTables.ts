import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowTables1770922145996 implements MigrationInterface {
  name = 'CreateWorkflowTables1770922145996';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "workflow" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "userId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_eb5e4cc1a9ef2e94805b676751b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c43d4a3144b7c40bcfd707144" ON "workflow" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_node" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "config" character varying NOT NULL, "posY" integer NOT NULL, "posX" integer NOT NULL, "label" character varying NOT NULL, "type" character varying NOT NULL, "workflowId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c4f72dce8fedd10b6104af42b57" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3cacae8a001b006c3f7f4bbf8" ON "workflow_node" ("workflowId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workflow_edge" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "toNodeId" uuid NOT NULL, "fromNodeId" uuid NOT NULL, "workflowId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_workflow_edge_connection" UNIQUE ("workflowId", "fromNodeId", "toNodeId"), CONSTRAINT "PK_1107fb1b4ad55cd55073e1c76ba" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d67c9aa4d78f0aec04e1b0357c" ON "workflow_edge" ("toNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2653d96430aeb21118fc3e07f7" ON "workflow_edge" ("fromNodeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_912585962347a88631917ab6d1" ON "workflow_edge" ("workflowId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow" ADD CONSTRAINT "FK_5c43d4a3144b7c40bcfd7071440" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_node" ADD CONSTRAINT "FK_d3cacae8a001b006c3f7f4bbf81" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD CONSTRAINT "FK_d67c9aa4d78f0aec04e1b0357c7" FOREIGN KEY ("toNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD CONSTRAINT "FK_2653d96430aeb21118fc3e07f79" FOREIGN KEY ("fromNodeId") REFERENCES "workflow_node"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD CONSTRAINT "FK_912585962347a88631917ab6d15" FOREIGN KEY ("workflowId") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" DROP CONSTRAINT "FK_912585962347a88631917ab6d15"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" DROP CONSTRAINT "FK_2653d96430aeb21118fc3e07f79"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" DROP CONSTRAINT "FK_d67c9aa4d78f0aec04e1b0357c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow_node" DROP CONSTRAINT "FK_d3cacae8a001b006c3f7f4bbf81"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflow" DROP CONSTRAINT "FK_5c43d4a3144b7c40bcfd7071440"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_912585962347a88631917ab6d1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2653d96430aeb21118fc3e07f7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d67c9aa4d78f0aec04e1b0357c"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_edge"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d3cacae8a001b006c3f7f4bbf8"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_node"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c43d4a3144b7c40bcfd707144"`,
    );
    await queryRunner.query(`DROP TABLE "workflow"`);
  }
}

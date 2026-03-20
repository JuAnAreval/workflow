import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowEngineBundleTables1773500000000
  implements MigrationInterface
{
  name = 'CreateWorkflowEngineBundleTables1773500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "userId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_userId" ON "workflow" ("userId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_userId'
        ) THEN
          ALTER TABLE "workflow"
          ADD CONSTRAINT "FK_workflow_userId"
          FOREIGN KEY ("userId") REFERENCES "user"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_node" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "config" character varying NOT NULL,
        "posY" integer NOT NULL,
        "posX" integer NOT NULL,
        "label" character varying NOT NULL,
        "type" character varying NOT NULL,
        "workflowId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_node_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_node_workflowId" ON "workflow_node" ("workflowId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_node_workflowId'
        ) THEN
          ALTER TABLE "workflow_node"
          ADD CONSTRAINT "FK_workflow_node_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_edge" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "toNodeId" uuid NOT NULL,
        "fromNodeId" uuid NOT NULL,
        "workflowId" uuid NOT NULL,
        "routeKey" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_edge_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "workflow_edge" ADD COLUMN IF NOT EXISTS "routeKey" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_edge_toNodeId" ON "workflow_edge" ("toNodeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_edge_fromNodeId" ON "workflow_edge" ("fromNodeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_edge_workflowId" ON "workflow_edge" ("workflowId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_edge_routeKey" ON "workflow_edge" ("routeKey")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_workflow_edge_route'
        ) THEN
          ALTER TABLE "workflow_edge"
          ADD CONSTRAINT "UQ_workflow_edge_route"
          UNIQUE ("workflowId", "fromNodeId", "routeKey");
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_edge_toNodeId'
        ) THEN
          ALTER TABLE "workflow_edge"
          ADD CONSTRAINT "FK_workflow_edge_toNodeId"
          FOREIGN KEY ("toNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_edge_fromNodeId'
        ) THEN
          ALTER TABLE "workflow_edge"
          ADD CONSTRAINT "FK_workflow_edge_fromNodeId"
          FOREIGN KEY ("fromNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_edge_workflowId'
        ) THEN
          ALTER TABLE "workflow_edge"
          ADD CONSTRAINT "FK_workflow_edge_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_assignment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "assignedToUserId" integer NOT NULL,
        "createdByUserId" integer,
        "entityType" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'draft',
        "templateData" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "contextData" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "formData" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "sourceWorkflowId" uuid,
        "sourceNodeId" uuid,
        "createdEntityId" character varying,
        "submittedAt" TIMESTAMP,
        "reviewedByUserId" integer,
        "reviewedAt" TIMESTAMP,
        "reviewFeedback" character varying(2000),
        "notifiedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_assignment_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_assignment_assignedToUserId" ON "workflow_assignment" ("assignedToUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_assignment_createdByUserId" ON "workflow_assignment" ("createdByUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_assignment_entityType" ON "workflow_assignment" ("entityType")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_assignment_status" ON "workflow_assignment" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_assignment_reviewedByUserId" ON "workflow_assignment" ("reviewedByUserId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_assignment_assignedToUserId'
        ) THEN
          ALTER TABLE "workflow_assignment"
          ADD CONSTRAINT "FK_workflow_assignment_assignedToUserId"
          FOREIGN KEY ("assignedToUserId") REFERENCES "user"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_assignment_createdByUserId'
        ) THEN
          ALTER TABLE "workflow_assignment"
          ADD CONSTRAINT "FK_workflow_assignment_createdByUserId"
          FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_assignment_reviewedByUserId'
        ) THEN
          ALTER TABLE "workflow_assignment"
          ADD CONSTRAINT "FK_workflow_assignment_reviewedByUserId"
          FOREIGN KEY ("reviewedByUserId") REFERENCES "user"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_form_json" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflowId" uuid NOT NULL,
        "workflowNodeId" uuid NOT NULL,
        "nodeLabel" character varying(255),
        "payload" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_form_json_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workflow_form_json_workflowNodeId" UNIQUE ("workflowNodeId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_form_json_workflowId" ON "workflow_form_json" ("workflowId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_form_json_workflowId'
        ) THEN
          ALTER TABLE "workflow_form_json"
          ADD CONSTRAINT "FK_workflow_form_json_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_form_json_workflowNodeId'
        ) THEN
          ALTER TABLE "workflow_form_json"
          ADD CONSTRAINT "FK_workflow_form_json_workflowNodeId"
          FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_http_json" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflowId" uuid NOT NULL,
        "workflowNodeId" uuid NOT NULL,
        "nodeLabel" character varying(255),
        "payload" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_http_json_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workflow_http_json_workflowNodeId" UNIQUE ("workflowNodeId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_http_json_workflowId" ON "workflow_http_json" ("workflowId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_http_json_workflowId'
        ) THEN
          ALTER TABLE "workflow_http_json"
          ADD CONSTRAINT "FK_workflow_http_json_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_http_json_workflowNodeId'
        ) THEN
          ALTER TABLE "workflow_http_json"
          ADD CONSTRAINT "FK_workflow_http_json_workflowNodeId"
          FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_webhook_json" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflowId" uuid NOT NULL,
        "workflowNodeId" uuid NOT NULL,
        "nodeLabel" character varying(255),
        "payload" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_webhook_json_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workflow_webhook_json_workflowNodeId" UNIQUE ("workflowNodeId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_webhook_json_workflowId" ON "workflow_webhook_json" ("workflowId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_webhook_json_workflowId'
        ) THEN
          ALTER TABLE "workflow_webhook_json"
          ADD CONSTRAINT "FK_workflow_webhook_json_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_webhook_json_workflowNodeId'
        ) THEN
          ALTER TABLE "workflow_webhook_json"
          ADD CONSTRAINT "FK_workflow_webhook_json_workflowNodeId"
          FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_javascript_json" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workflowId" uuid NOT NULL,
        "workflowNodeId" uuid NOT NULL,
        "nodeLabel" character varying(255),
        "payload" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_javascript_json_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workflow_javascript_json_workflowNodeId" UNIQUE ("workflowNodeId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_javascript_json_workflowId" ON "workflow_javascript_json" ("workflowId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_javascript_json_workflowId'
        ) THEN
          ALTER TABLE "workflow_javascript_json"
          ADD CONSTRAINT "FK_workflow_javascript_json_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_javascript_json_workflowNodeId'
        ) THEN
          ALTER TABLE "workflow_javascript_json"
          ADD CONSTRAINT "FK_workflow_javascript_json_workflowNodeId"
          FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_schedule_runtime" (
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
        CONSTRAINT "PK_workflow_schedule_runtime_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_workflow_schedule_runtime_workflowNodeId" UNIQUE ("workflowNodeId")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_schedule_runtime_workflowId" ON "workflow_schedule_runtime" ("workflowId")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_schedule_runtime_workflowId'
        ) THEN
          ALTER TABLE "workflow_schedule_runtime"
          ADD CONSTRAINT "FK_workflow_schedule_runtime_workflowId"
          FOREIGN KEY ("workflowId") REFERENCES "workflow"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_workflow_schedule_runtime_workflowNodeId'
        ) THEN
          ALTER TABLE "workflow_schedule_runtime"
          ADD CONSTRAINT "FK_workflow_schedule_runtime_workflowNodeId"
          FOREIGN KEY ("workflowNodeId") REFERENCES "workflow_node"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "workflow_schedule_runtime"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "workflow_javascript_json"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_webhook_json"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_http_json"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_form_json"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_assignment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_edge"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_node"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow"`);
  }
}

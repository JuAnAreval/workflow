import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectUserRelation1771100000000
  implements MigrationInterface
{
  name = 'AddProjectUserRelation1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project" ADD "userId" integer`);
    await queryRunner.query(
      `UPDATE "project" SET "userId" = (SELECT "id" FROM "user" ORDER BY "id" ASC LIMIT 1) WHERE "userId" IS NULL`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "project" WHERE "userId" IS NULL) THEN
          RAISE EXCEPTION 'No se pudo asignar userId a todos los proyectos existentes.';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "project" ALTER COLUMN "userId" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f887f5bbfef4a5d6cb0f55c88" ON "project" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project" ADD CONSTRAINT "FK_2f887f5bbfef4a5d6cb0f55c88d" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project" DROP CONSTRAINT "FK_2f887f5bbfef4a5d6cb0f55c88d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2f887f5bbfef4a5d6cb0f55c88"`,
    );
    await queryRunner.query(`ALTER TABLE "project" DROP COLUMN "userId"`);
  }
}

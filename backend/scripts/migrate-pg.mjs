/**
 * One-time, data-preserving PostgreSQL migration, run before `prisma db push` on every start (safe to repeat).
 * `db push` alone would drop and re-create these columns, losing data, so this converts them in place first:
 *   - BoardMember.role / Invite.role: text → "Role" enum
 *   - Card.labels (JSON text) → CardLabel rows ("Label" enum), then the old column is dropped
 *   - Card.due: text → DATE (invalid dates become empty)
 *   - Activity/Notification.cardId pointing at deleted cards → NULL (so their new foreign keys can be added)
 * Afterwards `db push` only adds indexes and foreign keys. SQLite (local dev) is skipped.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';

const ROLES = ['owner', 'admin', 'member', 'viewer'];
const LABELS = ['research', 'design', 'bug', 'docs', 'urgent', 'backend', 'slides', 'misc'];
const list = (xs) => xs.map((x) => `'${x}'`).join(', ');

/** `q(sql)` runs one statement and returns rows (for SELECTs). Returns the steps that were applied. */
export async function migrate(q) {
  const one = async (sql) => (await q(sql))[0];
  const tableExists = async (t) =>
    !!(await one(`SELECT 1 AS x FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '${t}'`));
  const column = (t, c) =>
    one(
      `SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${t}' AND column_name = '${c}'`,
    );
  const typeExists = async (n) => !!(await one(`SELECT 1 AS x FROM pg_type WHERE typname = '${n}'`));

  const applied = [];
  if (!(await tableExists('Card'))) return applied; // brand-new database: db push creates everything

  if (!(await typeExists('Role'))) {
    await q(`CREATE TYPE "Role" AS ENUM (${list(ROLES)})`);
    applied.push('created enum Role');
  }
  if (!(await typeExists('Label'))) {
    await q(`CREATE TYPE "Label" AS ENUM (${list(LABELS)})`);
    applied.push('created enum Label');
  }

  for (const table of ['BoardMember', 'Invite']) {
    const c = await column(table, 'role');
    if (c && c.udt_name !== 'Role') {
      await q(
        `ALTER TABLE "${table}" ALTER COLUMN "role" TYPE "Role" USING (CASE WHEN "role" IN (${list(ROLES)}) THEN "role" ELSE 'member' END)::"Role"`,
      );
      applied.push(`${table}.role → Role`);
    }
  }

  if (!(await tableExists('CardLabel'))) {
    await q(
      `CREATE TABLE "CardLabel" ("cardId" TEXT NOT NULL, "label" "Label" NOT NULL, CONSTRAINT "CardLabel_pkey" PRIMARY KEY ("cardId", "label"))`,
    );
    await q(
      `ALTER TABLE "CardLabel" ADD CONSTRAINT "CardLabel_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    applied.push('created table CardLabel');
  }
  if (await column('Card', 'labels')) {
    await q(
      `INSERT INTO "CardLabel" ("cardId", "label")
       SELECT c."id", l.value::"Label"
       FROM "Card" c
       CROSS JOIN LATERAL json_array_elements_text(CASE WHEN c."labels" ~ '^\\s*\\[' THEN c."labels"::json ELSE '[]'::json END) AS l(value)
       WHERE l.value IN (${list(LABELS)})
       ON CONFLICT DO NOTHING`,
    );
    await q(`ALTER TABLE "Card" DROP COLUMN "labels"`);
    applied.push('copied Card.labels into CardLabel and dropped the old column');
  }

  const due = await column('Card', 'due');
  if (due && due.data_type !== 'date') {
    // Only yyyy-MM-dd is accepted (Postgres would also parse words like "tomorrow"). A shape-valid but impossible date
    // such as "2026-02-30" becomes NULL instead of failing the whole migration.
    await q(
      `CREATE OR REPLACE FUNCTION pg_temp.cb_safe_date(t text) RETURNS date AS $$ BEGIN IF t !~ '^\\d{4}-\\d{2}-\\d{2}$' THEN RETURN NULL; END IF; RETURN t::date; EXCEPTION WHEN others THEN RETURN NULL; END $$ LANGUAGE plpgsql`,
    );
    await q(`ALTER TABLE "Card" ALTER COLUMN "due" TYPE DATE USING pg_temp.cb_safe_date("due")`);
    applied.push('Card.due → DATE');
  }

  for (const table of ['Activity', 'Notification']) {
    const n = await q(
      `UPDATE "${table}" SET "cardId" = NULL WHERE "cardId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Card" c WHERE c."id" = "${table}"."cardId") RETURNING 1 AS x`,
    );
    if (n.length) applied.push(`${table}: cleared ${n.length} link(s) to deleted cards`);
  }
  return applied;
}

// Run directly (npm run db:migrate): only on PostgreSQL, all in one transaction.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '')) {
    console.log('migrate: SQLite, nothing to do');
    process.exit(0);
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const applied = await prisma.$transaction(
      (tx) =>
        migrate(async (sql) =>
          /^\s*(SELECT|UPDATE[\s\S]*RETURNING)/i.test(sql) ? tx.$queryRawUnsafe(sql) : (await tx.$executeRawUnsafe(sql), []),
        ),
      { timeout: 120_000, maxWait: 30_000 },
    );
    console.log(applied.length ? `migrate: ${applied.join('; ')}` : 'migrate: already up to date');
  } catch (e) {
    console.error('migrate: FAILED, nothing was changed (rolled back).', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

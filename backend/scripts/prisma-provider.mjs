/**
 * Writes prisma/generated.prisma from schema.prisma: PostgreSQL for postgres:// URLs, SQLite otherwise.
 * SQLite has no enums or native date type, so for SQLite enums become String and @db.* attributes are dropped.
 * Edit schema.prisma only.
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const url = process.env.DATABASE_URL ?? '';
const provider = /^postgres(ql)?:\/\//.test(url) ? 'postgresql' : 'sqlite';

const src = new URL('../prisma/schema.prisma', import.meta.url);
const out = new URL('../prisma/generated.prisma', import.meta.url);
const header = '// GENERATED from schema.prisma by scripts/prisma-provider.mjs. Do not edit; edit schema.prisma.\n';

let schema = readFileSync(src, 'utf8').replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`);

if (provider === 'sqlite') {
  const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{[^}]*\}\s*$/gm)].map((m) => m[1]);
  schema = schema.replace(/^(\/\/\/.*\n)*enum\s+\w+\s*\{[^}]*\}\s*\n/gm, '');
  for (const name of enums) schema = schema.replace(new RegExp(`(^\\s+\\w+\\s+)${name}(\\??)(?=\\s|$)`, 'gm'), '$1String$2');
  schema = schema.replace(/\s@db\.\w+(\([^)]*\))?/g, '');
}

const text = header + schema;
if (!existsSync(out) || readFileSync(out, 'utf8') !== text) writeFileSync(out, text);
console.log(`prisma: using ${provider}`);

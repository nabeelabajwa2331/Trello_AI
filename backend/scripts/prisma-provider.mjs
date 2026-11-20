/** Writes prisma/generated.prisma from schema.prisma: PostgreSQL for postgres:// URLs, SQLite otherwise. Edit schema.prisma only. */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const url = process.env.DATABASE_URL ?? '';
const provider = /^postgres(ql)?:\/\//.test(url) ? 'postgresql' : 'sqlite';

const src = new URL('../prisma/schema.prisma', import.meta.url);
const out = new URL('../prisma/generated.prisma', import.meta.url);
const header = '// GENERATED from schema.prisma by scripts/prisma-provider.mjs. Do not edit; edit schema.prisma.\n';
const text = header + readFileSync(src, 'utf8').replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`);

if (!existsSync(out) || readFileSync(out, 'utf8') !== text) writeFileSync(out, text);
console.log(`prisma: using ${provider}`);

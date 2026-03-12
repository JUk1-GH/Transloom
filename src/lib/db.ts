import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

function resolveDatabaseFilePath() {
  const dataDir = process.env.TRANSLOOM_DATA_DIR?.trim();

  if (dataDir) {
    return path.join(dataDir, 'transloom.db');
  }

  return path.join(process.cwd(), 'prisma', 'transloom.db');
}

const defaultDatabaseUrl = `file:${resolveDatabaseFilePath()}`;

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = defaultDatabaseUrl;
}

const databaseFilePath = process.env.DATABASE_URL.replace(/^file:/, '');
if (databaseFilePath && !fs.existsSync(path.dirname(databaseFilePath))) {
  fs.mkdirSync(path.dirname(databaseFilePath), { recursive: true });
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function getPersistenceUser() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  try {
    return await db.user.upsert({
      where: {
        email: 'local@transloom.app',
      },
      update: {},
      create: {
        email: 'local@transloom.app',
        name: 'Local Transloom User',
      },
    });
  } catch {
    return null;
  }
}

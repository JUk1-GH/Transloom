import type { TranslationMode } from '@prisma/client';
import { db, getPersistenceUser, isDatabaseConfigured } from '@/lib/db';

export interface HistoryRecord {
  id: string;
  mode: 'text' | 'screenshot';
  sourceText: string;
  translatedText: string;
  provider: string;
  sourceLang?: string;
  targetLang?: string;
  screenshotPath?: string;
  charactersUsed?: number;
  success: boolean;
  createdAt: string;
}

const volatileHistoryRecords: HistoryRecord[] = [];

function mapMode(mode: TranslationMode): HistoryRecord['mode'] {
  return mode === 'screenshot' ? 'screenshot' : 'text';
}

export async function getHistorySummary() {
  const records = await listHistoryRecords();
  const successful = records.filter((record) => record.success).length;
  const providers = new Set(records.map((record) => record.provider));

  return {
    total: records.length,
    text: records.filter((record) => record.mode === 'text').length,
    screenshot: records.filter((record) => record.mode === 'screenshot').length,
    successful,
    providers: providers.size,
    latestActivityAt: records[0]?.createdAt ?? null,
  };
}

export async function recordHistory(input: {
  mode: HistoryRecord['mode'];
  sourceText: string;
  translatedText: string;
  provider: string;
  targetLang: string;
  sourceLang?: string;
  screenshotPath?: string;
  charactersUsed?: number;
  success?: boolean;
}) {
  const record: HistoryRecord = {
    id: `hist-${Date.now()}`,
    mode: input.mode,
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    provider: input.provider,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    screenshotPath: input.screenshotPath,
    charactersUsed: input.charactersUsed,
    success: input.success ?? true,
    createdAt: new Date().toISOString(),
  };

  if (!isDatabaseConfigured()) {
    volatileHistoryRecords.unshift(record);
    return record;
  }

  const user = await getPersistenceUser();
  if (!user) {
    volatileHistoryRecords.unshift(record);
    return record;
  }

  const created = await db.translationHistory.create({
    data: {
      userId: user.id,
      mode: input.mode,
      sourceText: input.sourceText,
      translatedText: input.translatedText,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      provider: input.provider,
      charactersUsed: input.charactersUsed ?? input.translatedText.length,
      screenshotPath: input.screenshotPath,
      success: input.success ?? true,
    },
  });

  return {
    id: created.id,
    mode: mapMode(created.mode),
    sourceText: created.sourceText,
    translatedText: created.translatedText,
    provider: created.provider,
    sourceLang: created.sourceLang ?? undefined,
    targetLang: created.targetLang,
    screenshotPath: created.screenshotPath ?? undefined,
    charactersUsed: created.charactersUsed,
    success: created.success,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function recordScreenshotHistory(input: {
  sourceText: string;
  translatedText: string;
  provider: string;
  screenshotPath: string;
  sourceLang?: string;
  targetLang?: string;
  charactersUsed?: number;
  success?: boolean;
}) {
  return recordHistory({
    mode: 'screenshot',
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    provider: input.provider,
    screenshotPath: input.screenshotPath,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang ?? 'zh-CN',
    charactersUsed: input.charactersUsed,
    success: input.success,
  });
}

export async function listHistoryRecords() {
  if (!isDatabaseConfigured()) {
    return [...volatileHistoryRecords];
  }

  const user = await getPersistenceUser();
  if (!user) {
    return [...volatileHistoryRecords];
  }

  const records = await db.translationHistory.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });

  return records.map((record) => ({
    id: record.id,
    mode: mapMode(record.mode),
    sourceText: record.sourceText,
    translatedText: record.translatedText,
    provider: record.provider,
    sourceLang: record.sourceLang ?? undefined,
    targetLang: record.targetLang,
    screenshotPath: record.screenshotPath ?? undefined,
    charactersUsed: record.charactersUsed,
    success: record.success,
    createdAt: record.createdAt.toISOString(),
  }));
}

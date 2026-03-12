import { db, getPersistenceUser, isDatabaseConfigured } from '@/lib/db';

export interface GlossarySummary {
  id: string;
  name: string;
  entries: number;
  sourceLang: string;
  targetLang: string;
  updatedAt: string;
}

export interface GlossaryEntryRecord {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceLang: string;
  targetLang: string;
  sourceTerm: string;
  targetTerm: string;
}

const volatileGlossaries: Array<GlossarySummary & { items: GlossaryEntryRecord[] }> = [];

export async function listGlossarySummaries(): Promise<GlossarySummary[]> {
  if (!isDatabaseConfigured()) {
    return volatileGlossaries.map(({ items, ...glossary }) => ({ ...glossary, entries: items.length }));
  }

  const user = await getPersistenceUser();
  if (!user) {
    return volatileGlossaries.map(({ items, ...glossary }) => ({ ...glossary, entries: items.length }));
  }

  const glossaries = await db.glossary.findMany({
    where: {
      userId: user.id,
    },
    include: {
      entries: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 24,
  });

  return glossaries.map((glossary) => ({
    id: glossary.id,
    name: glossary.name,
    entries: glossary.entries.length,
    sourceLang: glossary.sourceLang,
    targetLang: glossary.targetLang,
    updatedAt: glossary.createdAt.toISOString(),
  }));
}

export async function listGlossaryEntries(glossaryId?: string): Promise<GlossaryEntryRecord[]> {
  if (!isDatabaseConfigured()) {
    return volatileGlossaries.flatMap((glossary) => glossary.items).filter((entry) => !glossaryId || entry.glossaryId === glossaryId);
  }

  const user = await getPersistenceUser();
  if (!user) {
    return volatileGlossaries.flatMap((glossary) => glossary.items).filter((entry) => !glossaryId || entry.glossaryId === glossaryId);
  }

  const entries = await db.glossaryEntry.findMany({
    where: glossaryId
      ? {
          glossaryId,
          glossary: {
            userId: user.id,
          },
        }
      : {
          glossary: {
            userId: user.id,
          },
        },
    include: {
      glossary: {
        select: {
          id: true,
          name: true,
          sourceLang: true,
          targetLang: true,
        },
      },
    },
    orderBy: {
      sourceTerm: 'asc',
    },
  });

  return entries.map((entry) => ({
    id: entry.id,
    glossaryId: entry.glossary.id,
    glossaryName: entry.glossary.name,
    sourceLang: entry.glossary.sourceLang,
    targetLang: entry.glossary.targetLang,
    sourceTerm: entry.sourceTerm,
    targetTerm: entry.targetTerm,
  }));
}

export async function createGlossaryWithEntry(input: {
  name: string;
  sourceLang: string;
  targetLang: string;
  sourceTerm: string;
  targetTerm: string;
}) {
  const payload = {
    name: input.name.trim(),
    sourceLang: input.sourceLang.trim(),
    targetLang: input.targetLang.trim(),
    sourceTerm: input.sourceTerm.trim(),
    targetTerm: input.targetTerm.trim(),
  };

  if (!payload.name || !payload.sourceLang || !payload.targetLang || !payload.sourceTerm || !payload.targetTerm) {
    throw Object.assign(new Error('术语表名称、语言和术语条目不能为空。'), {
      code: 'INVALID_GLOSSARY_INPUT',
      status: 400,
    });
  }

  if (!isDatabaseConfigured()) {
    const glossaryId = `glossary-${Date.now()}`;
    const entryId = `entry-${Date.now()}`;
    volatileGlossaries.unshift({
      id: glossaryId,
      name: payload.name,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      updatedAt: new Date().toISOString(),
      entries: 1,
      items: [
        {
          id: entryId,
          glossaryId,
          glossaryName: payload.name,
          sourceLang: payload.sourceLang,
          targetLang: payload.targetLang,
          sourceTerm: payload.sourceTerm,
          targetTerm: payload.targetTerm,
        },
      ],
    });

    return {
      id: glossaryId,
      name: payload.name,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      entry: {
        id: entryId,
        sourceTerm: payload.sourceTerm,
        targetTerm: payload.targetTerm,
      },
    };
  }

  const user = await getPersistenceUser();
  if (!user) {
    throw Object.assign(new Error('无法初始化本地术语表存储。'), {
      code: 'GLOSSARY_STORAGE_UNAVAILABLE',
      status: 500,
    });
  }

  const glossary = await db.glossary.create({
    data: {
      userId: user.id,
      name: payload.name,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      entries: {
        create: {
          sourceTerm: payload.sourceTerm,
          targetTerm: payload.targetTerm,
        },
      },
    },
    include: {
      entries: true,
    },
  });

  const entry = glossary.entries[0];

  return {
    id: glossary.id,
    name: glossary.name,
    sourceLang: glossary.sourceLang,
    targetLang: glossary.targetLang,
    entry: {
      id: entry.id,
      sourceTerm: entry.sourceTerm,
      targetTerm: entry.targetTerm,
    },
  };
}

export async function getGlossarySummary() {
  const glossaries = await listGlossarySummaries();
  const entries = glossaries.reduce((total, glossary) => total + glossary.entries, 0);
  const languagePairs = new Set(glossaries.map((glossary) => `${glossary.sourceLang}->${glossary.targetLang}`));

  return {
    glossaries: glossaries.length,
    entries,
    languagePairs: languagePairs.size,
    latestUpdatedAt: glossaries[0]?.updatedAt ?? null,
  };
}

import { db, getPersistenceUser, isDatabaseConfigured } from '@/lib/db';

const volatileUsageSummary = {
  monthlyCharacters: 0,
  requestCount: 0,
  screenshotCount: 0,
};

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getUsageSummary() {
  if (!isDatabaseConfigured()) {
    return { ...volatileUsageSummary };
  }

  const user = await getPersistenceUser();
  if (!user) {
    return { ...volatileUsageSummary };
  }

  const [usageRecord, screenshotCount] = await Promise.all([
    db.usageRecord.findUnique({
      where: {
        userId_month: {
          userId: user.id,
          month: getCurrentMonthKey(),
        },
      },
    }),
    db.translationHistory.count({
      where: {
        userId: user.id,
        mode: 'screenshot',
      },
    }),
  ]);

  if (!usageRecord) {
    return {
      monthlyCharacters: 0,
      requestCount: 0,
      screenshotCount,
    };
  }

  return {
    monthlyCharacters: usageRecord.charactersTranslated,
    requestCount: usageRecord.requestCount,
    screenshotCount,
  };
}

export async function recordUsage(input: { charactersTranslated: number; mode?: 'text' | 'screenshot' }) {
  if (!isDatabaseConfigured()) {
    volatileUsageSummary.monthlyCharacters += input.charactersTranslated;
    volatileUsageSummary.requestCount += 1;
    if (input.mode === 'screenshot') {
      volatileUsageSummary.screenshotCount += 1;
    }
    return { ...volatileUsageSummary };
  }

  const user = await getPersistenceUser();
  if (!user) {
    volatileUsageSummary.monthlyCharacters += input.charactersTranslated;
    volatileUsageSummary.requestCount += 1;
    if (input.mode === 'screenshot') {
      volatileUsageSummary.screenshotCount += 1;
    }
    return { ...volatileUsageSummary };
  }

  const usageRecord = await db.usageRecord.upsert({
    where: {
      userId_month: {
        userId: user.id,
        month: getCurrentMonthKey(),
      },
    },
    update: {
      charactersTranslated: {
        increment: input.charactersTranslated,
      },
      requestCount: {
        increment: 1,
      },
    },
    create: {
      userId: user.id,
      month: getCurrentMonthKey(),
      charactersTranslated: input.charactersTranslated,
      requestCount: 1,
    },
  });

  return {
    monthlyCharacters: usageRecord.charactersTranslated,
    requestCount: usageRecord.requestCount,
    screenshotCount: await db.translationHistory.count({
      where: {
        userId: user.id,
        mode: 'screenshot',
      },
    }),
  };
}

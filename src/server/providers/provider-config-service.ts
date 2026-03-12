import { Prisma } from '@prisma/client';
import type { ProviderCredentialMeta } from '@prisma/client';
import type { ProviderConfig, ProviderKind } from '@/domain/translation/provider';
import { db, isDatabaseConfigured } from '@/lib/db';

const volatileProviderConfigs: ProviderConfig[] = [];

function maskApiKey(apiKey?: string | null) {
  if (!apiKey) {
    return undefined;
  }

  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }

  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
}

function mapProviderRecord(record: ProviderCredentialMeta): ProviderConfig {
  return {
    id: record.id,
    kind: record.provider as ProviderKind,
    label: record.label,
    baseUrl: record.baseUrl ?? undefined,
    model: record.model ?? undefined,
    apiKeyMasked: undefined,
    hasApiKey: record.hasStoredSecret,
    enabled: record.isEnabled,
    supportsVision: record.provider === 'openai' || record.provider === 'openai-compatible',
  };
}

function isMissingTableError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
}

async function withProviderTableFallback<T>(operation: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallback();
    }

    throw error;
  }
}

export async function listProviderConfigs() {
  if (!isDatabaseConfigured()) {
    return [...volatileProviderConfigs];
  }

  const records = await withProviderTableFallback(
    () =>
      db.providerCredentialMeta.findMany({
        orderBy: [{ isEnabled: 'desc' }, { createdAt: 'asc' }],
      }),
    () => [],
  );

  return records.map(mapProviderRecord);
}

export async function getProviderConfig(kind: ProviderKind) {
  if (!isDatabaseConfigured()) {
    return volatileProviderConfigs.find((item) => item.kind === kind);
  }

  const record = await withProviderTableFallback(
    () =>
      db.providerCredentialMeta.findFirst({
        where: {
          provider: kind,
        },
        orderBy: [{ isEnabled: 'desc' }, { updatedAt: 'desc' }],
      }),
    () => null,
  );

  return record ? mapProviderRecord(record) : undefined;
}

export async function getDefaultProvider() {
  const configs = await listProviderConfigs();
  return configs.find((item) => item.enabled) ?? configs[0];
}

export async function saveProviderConfig(input: ProviderConfig) {
  if (!isDatabaseConfigured()) {
    const nextConfig = { ...input, apiKeyMasked: maskApiKey(input.apiKeyMasked), hasApiKey: input.hasApiKey ?? Boolean(input.apiKeyMasked) };
    const existingIndex = volatileProviderConfigs.findIndex((item) => item.kind === input.kind);

    if (existingIndex >= 0) {
      volatileProviderConfigs[existingIndex] = nextConfig;
    } else {
      volatileProviderConfigs.push(nextConfig);
    }

    return nextConfig;
  }

  const record = await db.providerCredentialMeta.upsert({
    where: {
      id: input.id,
    },
    update: {
      provider: input.kind,
      label: input.label,
      baseUrl: input.baseUrl,
      model: input.model,
      isEnabled: input.enabled,
      hasStoredSecret: input.hasApiKey ?? false,
      lastValidated: input.hasApiKey ? new Date() : null,
    },
    create: {
      id: input.id,
      provider: input.kind,
      label: input.label,
      baseUrl: input.baseUrl,
      model: input.model,
      isEnabled: input.enabled,
      hasStoredSecret: input.hasApiKey ?? false,
      lastValidated: input.hasApiKey ? new Date() : null,
    },
  });

  return {
    ...mapProviderRecord(record),
    apiKeyMasked: maskApiKey(input.apiKeyMasked),
  };
}

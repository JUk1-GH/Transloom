import { NextResponse } from 'next/server';
import { getDefaultProvider } from '@/server/providers/provider-config-service';

function getRuntimeSnapshot(provider: Awaited<ReturnType<typeof getDefaultProvider>>) {
  const hasConfiguredProvider = Boolean(provider?.enabled);
  const hasBaseUrl = Boolean(provider?.baseUrl);
  const hasModel = Boolean(provider?.model);
  const hasApiKey = Boolean(provider?.hasApiKey);
  const runtimeMode = hasConfiguredProvider && hasBaseUrl && hasModel && hasApiKey ? 'real' : 'mock';
  const status = !provider || !provider.enabled
    ? 'provider-missing'
    : !hasBaseUrl || !hasModel
      ? 'model-missing'
      : !hasApiKey
        ? 'api-key-missing'
        : runtimeMode === 'real'
          ? 'ready'
          : 'mock-fallback';

  return {
    baseUrl: provider?.baseUrl ?? null,
    model: provider?.model ?? null,
    hasApiKey,
    runtimeMode,
    status,
    provider: provider
      ? {
          baseUrl: provider.baseUrl ?? '',
          model: provider.model ?? '',
          hasApiKey,
          enabled: Boolean(provider.enabled),
          label: provider.label,
        }
      : undefined,
  };
}

export async function GET() {
  const provider = await getDefaultProvider();
  return NextResponse.json(getRuntimeSnapshot(provider));
}

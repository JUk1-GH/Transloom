import type { ProviderKind, TranslationProvider } from "@/domain/translation/provider";
import { getDefaultProvider, getProviderConfig } from "@/server/providers/provider-config-service";
import { customOpenAiCompatibleProvider } from "@/server/translation/providers/custom-openai-compatible-provider";
import { deeplProvider } from "@/server/translation/providers/deepl-provider";
import { googleProvider } from "@/server/translation/providers/google-provider";
import { openAiProvider } from "@/server/translation/providers/openai-provider";
import { tencentCloudProvider } from "@/server/translation/providers/tencent-cloud-provider";

export const providerRegistry: Record<ProviderKind, TranslationProvider> = {
  deepl: deeplProvider,
  openai: openAiProvider,
  google: googleProvider,
  "openai-compatible": customOpenAiCompatibleProvider,
  tencent: tencentCloudProvider,
};

export async function resolveProvider(providerId?: string): Promise<TranslationProvider> {
  const normalizedProviderId =
    providerId && providerId in providerRegistry
      ? (providerId as keyof typeof providerRegistry)
      : undefined;
  const configuredProvider = normalizedProviderId ? await getProviderConfig(normalizedProviderId) : undefined;

  if (configuredProvider?.enabled) {
    return providerRegistry[configuredProvider.kind];
  }

  if (normalizedProviderId) {
    return providerRegistry[normalizedProviderId];
  }

  const defaultProvider = await getDefaultProvider();
  if (defaultProvider?.enabled) {
    return providerRegistry[defaultProvider.kind] ?? customOpenAiCompatibleProvider;
  }

  return customOpenAiCompatibleProvider;
}

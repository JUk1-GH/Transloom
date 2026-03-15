import { getDefaultProvider } from '@/server/providers/provider-config-service';
import { getUsageSummary } from '@/server/usage/service';

export async function getBillingSummary() {
  const [usage, provider] = await Promise.all([getUsageSummary(), getDefaultProvider()]);
  const byokEnabled = Boolean(provider?.enabled && provider?.hasApiKey);

  return {
    plan: 'local',
    byokEnabled,
    checkoutReady: false,
    subscriptionStatus: 'disabled',
    monthlyCharacters: usage.monthlyCharacters,
    requestCount: usage.requestCount,
  };
}

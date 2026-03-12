import { getUsageSummary } from "@/server/usage/service";

export async function getBillingSummary() {
  const usage = await getUsageSummary();

  return {
    plan: "local",
    byokEnabled: true,
    checkoutReady: false,
    subscriptionStatus: "disabled",
    monthlyCharacters: usage.monthlyCharacters,
    requestCount: usage.requestCount,
  };
}

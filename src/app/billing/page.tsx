import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { Card } from "@/components/ui/card";
import { getBillingSummary } from "@/server/billing/service";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function BillingPage() {
  const summary = await getBillingSummary();

  return (
    <AppShell
      title="账单与用量"
      description="本地单机版不会发起在线结账，但仍会保留用量统计、BYOK 状态和后续接入边界。"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Plan</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.plan}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Monthly characters</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(summary.monthlyCharacters)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Requests</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(summary.requestCount)}</p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card title="本地版计费边界" eyebrow="Local Edition">
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              在线 checkout 当前被显式禁用；`/api/billing/checkout` 会返回 `410`，避免误连到旧 Stripe 设计。
            </div>
            <ul className="space-y-2">
              <li>- 当前模式：`{summary.subscriptionStatus}`，只保留本地统计与 BYOK 边界。</li>
              <li>- BYOK：{summary.byokEnabled ? "已启用，可直接使用自己的 provider 配置。" : "未启用。"}</li>
              <li>- Checkout：{summary.checkoutReady ? "可用" : "不可用"}，本地版不会发起在线结算。</li>
            </ul>
          </div>
        </Card>

        <Card title="下一步建议" eyebrow="Cleanup">
          <div className="space-y-3">
            <p>如果继续保留本地单机定位，建议把账单页收敛为“用量与配额说明”而不是半成品 SaaS 结账页。</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700">查看 Provider 设置</Link>
              <Link href="/history" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700">查看历史记录</Link>
            </div>
          </div>
        </Card>
      </section>
    </AppShell>
  );
}

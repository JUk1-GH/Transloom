import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { Card } from "@/components/ui/card";
import { getGlossarySummary } from "@/server/glossary/service";
import { getHistorySummary } from "@/server/history/service";
import { getUsageSummary } from "@/server/usage/service";

export default async function AccountPage() {
  const [historySummary, glossarySummary, usageSummary] = await Promise.all([
    getHistorySummary(),
    getGlossarySummary(),
    getUsageSummary(),
  ]);

  return (
    <AppShell
      title="本地账户视图"
      description="当前 Transloom 以本地单用户模式运行，不提供真实登录流，但仍保留一层可读的账户边界。"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Identity</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">local@transloom.app</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Translation runs</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{historySummary.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Glossary entries</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{glossarySummary.entries}</p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card title="当前账户策略" eyebrow="Single User">
          <div className="space-y-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-900">
              这不是 SaaS 登录页。当前仓库通过本地默认用户承接 history、glossary、usage 等持久化数据，避免引入半成品 auth/订阅链路。
            </div>
            <ul className="space-y-2">
              <li>- 历史记录：{historySummary.total} 条，最近活动 {historySummary.latestActivityAt ?? "暂无"}</li>
              <li>- 术语表：{glossarySummary.glossaries} 个 glossary，{glossarySummary.entries} 条 entry</li>
              <li>- 当月用量：{usageSummary.monthlyCharacters} 字符 / {usageSummary.requestCount} 次请求</li>
            </ul>
          </div>
        </Card>

        <Card title="下一步建议" eyebrow="Roadmap">
          <div className="space-y-3">
            <p>如果以后要恢复账户体系，建议只在明确需要多用户同步或云订阅时再引入最小登录态，而不是保留无效跳转。</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/history" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700">查看历史</Link>
              <Link href="/glossary" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700">查看术语表</Link>
              <Link href="/billing" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700">查看用量</Link>
            </div>
          </div>
        </Card>
      </section>
    </AppShell>
  );
}

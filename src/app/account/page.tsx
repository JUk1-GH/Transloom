import { AppShell } from '@/components/ui/app-shell';
import { getPersistenceUser } from '@/lib/db';
import { getDefaultProvider } from '@/server/providers/provider-config-service';
import { getUsageSummary } from '@/server/usage/service';

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function getProviderUsageBreakdown(requestCount: number, providerBaseUrl?: string) {
  const normalizedBaseUrl = providerBaseUrl?.toLowerCase() ?? '';
  const isLocal = normalizedBaseUrl.includes('localhost') || normalizedBaseUrl.includes('127.0.0.1');

  return {
    localRequests: isLocal ? requestCount : 0,
    cloudRequests: isLocal ? 0 : requestCount,
    isLocal,
  };
}

function UserIcon() {
  return (
    <svg width='28' height='28' viewBox='0 0 28 28' fill='none' aria-hidden='true'>
      <circle cx='14' cy='14' r='10.2' stroke='currentColor' strokeWidth='1.8' />
      <circle cx='14' cy='11.2' r='3.15' stroke='currentColor' strokeWidth='1.8' />
      <path d='M8.9 20.3C10.05 17.65 11.85 16.4 14 16.4C16.15 16.4 17.95 17.65 19.1 20.3' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8 2.2L12 3.7V7.55C12 10.1 10.5 12.35 8 13.6C5.5 12.35 4 10.1 4 7.55V3.7L8 2.2Z' stroke='currentColor' strokeWidth='1.3' strokeLinejoin='round' />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
      <path d='M8.55 7.45A2.75 2.75 0 1 0 3.05 7.45A2.75 2.75 0 1 0 8.55 7.45Z' stroke='currentColor' strokeWidth='1.3' />
      <path d='M8.55 7.45H13.1' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <path d='M11.45 7.45V9.05' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
      <path d='M12.8 7.45V8.55' stroke='currentColor' strokeWidth='1.3' strokeLinecap='round' />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 18 18' fill='none' aria-hidden='true'>
      <path d='M3.4 12.3L6.6 9.1L8.9 11.4L14.6 5.7' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' />
      <path d='M11.8 5.7H14.6V8.5' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 18 18' fill='none' aria-hidden='true'>
      <rect x='4.7' y='4.7' width='8.6' height='8.6' rx='1.8' stroke='currentColor' strokeWidth='1.4' />
      <path d='M9 1.9V4' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M9 14V16.1' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M1.9 9H4' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M14 9H16.1' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M4 3.1L5.2 4.3' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M12.8 12.8L14 14' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M12.8 4.3L14 3.1' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
      <path d='M4 14L5.2 12.8' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' />
    </svg>
  );
}

export default async function AccountPage() {
  const [usageSummary, user, provider] = await Promise.all([getUsageSummary(), getPersistenceUser(), getDefaultProvider()]);

  const userId = user?.id ? `local-${user.id.slice(-8)}` : 'local-a8f9c21';
  const providerLabel = provider?.label?.trim() || '本地 API';
  const providerModel = provider?.model?.trim() || '本地 DeepSeek';
  const providerBaseUrl = provider?.baseUrl ?? '';
  const requestBreakdown = getProviderUsageBreakdown(usageSummary.requestCount, providerBaseUrl);
  const totalCharacters = usageSummary.monthlyCharacters;
  const totalRequests = usageSummary.requestCount;

  return (
    <AppShell title='账户' contentClassName='md:px-5 md:py-5'>
      <div className='flex h-full min-h-0 flex-col'>
        <div className='mb-8'>
          <h1 className='text-[24px] font-semibold tracking-[-0.03em] text-[#262626]'>账户与用量</h1>
          <p className='mt-1 text-[15px] text-[#747b87]'>查看本地身份信息与近期使用统计。</p>
        </div>

        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
          <section className='flex min-h-[332px] flex-col rounded-[20px] border border-[#d9dbe1] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'>
            <div className='mb-4 flex items-center gap-4'>
              <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f5f6f8] text-[#717782]'>
                <UserIcon />
              </div>

              <div className='min-w-0'>
                <h2 className='text-[18px] font-semibold text-[#2a2e35]'>本地用户</h2>
                <p className='mt-0.5 font-mono text-[12px] text-[#7c838f]'>ID：{userId}</p>
              </div>
            </div>

            <div className='flex-1' />

            <div className='space-y-3 border-t border-[#eef0f3] pt-4'>
              <div className='flex items-center justify-between text-[14px]'>
                <span className='flex items-center gap-2 text-[#606775]'>
                  <ShieldIcon />
                  数据策略
                </span>
                <span className='font-medium text-[#00a86b]'>本地优先</span>
              </div>

              <div className='flex items-center justify-between text-[14px]'>
                <span className='flex items-center gap-2 text-[#606775]'>
                  <KeyIcon />
                  调用策略
                </span>
                <span className='font-medium text-[#2f3541]'>BYOK / 本地 API</span>
              </div>
            </div>
          </section>

          <section className='flex flex-col rounded-[20px] border border-[#d9dbe1] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:col-span-2'>
            <div className='flex items-start justify-between gap-4'>
              <div className='flex items-center gap-2 text-[#2a2e35]'>
                <ChartIcon />
                <h2 className='text-[18px] font-semibold'>用量统计</h2>
              </div>

              <div className='rounded-[8px] border border-[#dde1e6] bg-[#fafafa] px-2.5 py-1 text-[12px] font-medium text-[#4d5560]'>
                最近 30 天
              </div>
            </div>

            <div className='grid gap-6 pt-4 md:grid-cols-3'>
              <div>
                <div className='text-[11px] uppercase tracking-[0.1em] text-[#7e8591]'>总字符数</div>
                <div className='mt-1 text-[38px] font-semibold leading-none tracking-[-0.05em] text-[#24282f]'>
                  {formatNumber(totalCharacters)}
                </div>
                <div className='mt-1 text-[11px] text-[#8a909a]'>
                  {requestBreakdown.isLocal ? '全部由本地处理。' : '由本地或你配置的服务处理。'}
                </div>
              </div>

              <div>
                <div className='text-[11px] uppercase tracking-[0.1em] text-[#7e8591]'>本地 API 请求</div>
                <div className='mt-1 text-[38px] font-semibold leading-none tracking-[-0.05em] text-[#24282f]'>
                  {formatNumber(requestBreakdown.localRequests)}
                </div>
                <div className='mt-1 text-[11px] text-[#8a909a]'>
                  {requestBreakdown.isLocal ? `${providerModel}（${totalRequests > 0 ? '100%' : '0%'}）` : '还没有发送本地请求'}
                </div>
              </div>

              <div>
                <div className='text-[11px] uppercase tracking-[0.1em] text-[#7e8591]'>云端 API 请求</div>
                <div className='mt-1 text-[38px] font-semibold leading-none tracking-[-0.05em] text-[#24282f]'>
                  {formatNumber(requestBreakdown.cloudRequests)}
                </div>
                <div className='mt-1 text-[11px] text-[#8a909a]'>
                  {requestBreakdown.cloudRequests > 0 ? `通过 ${providerLabel} 发送` : '还没有发送外部请求'}
                </div>
              </div>
            </div>

            <div className='mt-6 rounded-[14px] border border-[#dce8ff] bg-[#f5f8ff] p-4 text-[#2050da]'>
              <div className='flex items-start gap-3'>
                <div className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white/80'>
                  <CpuIcon />
                </div>
                <div>
                  <div className='text-[14px] font-semibold'>
                    {requestBreakdown.isLocal ? '当前使用本地算力' : '当前使用云端服务'}
                  </div>
                  <p className='mt-1 text-[12px] leading-6 text-[#2f5eff]'>
                    {requestBreakdown.isLocal
                      ? `当前翻译使用的是 ${providerLabel || '你的本地模型'}。数据不会离开这台机器，并且由你的本地端点满足当前的 BYOK 策略。`
                      : `当前翻译服务为 ${providerLabel}。请求会通过你配置的外部 API 并使用你自己的凭证发出。`}
                  </p>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </AppShell>
  );
}

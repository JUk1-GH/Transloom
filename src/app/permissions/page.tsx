import { AccountPermissionsCard } from '@/components/account/account-permissions-card';
import { AppShell } from '@/components/ui/app-shell';

export default function PermissionsPage() {
  return (
    <AppShell title='权限' contentClassName='md:px-5 md:py-5'>
      <div className='mx-auto flex h-full w-full max-w-[980px] flex-col'>
        <div className='mb-8'>
          <h1 className='text-[24px] font-semibold tracking-[-0.03em] text-[#262626]'>权限</h1>
          <p className='mt-1 text-[15px] text-[#747b87]'>辅助功能和屏幕录制都集中在这里处理，不再分散在其他页面。</p>
        </div>

        <div className='grid gap-6'>
          <section className='rounded-[20px] border border-[#d9dbe1] bg-[#fafafa] px-5 py-4 text-[14px] leading-7 text-[#606775]'>
            如果你刚在 macOS 里切过权限开关，先回到这里点一次“刷新”；辅助功能在开发模式下通常还需要重新打开应用，状态才会更新准确。
          </section>

          <AccountPermissionsCard />
        </div>
      </div>
    </AppShell>
  );
}

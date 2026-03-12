'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type DesktopCapabilities = {
  desktopAvailable: boolean;
  accessibility: {
    granted: boolean;
    status: 'granted' | 'not-granted';
    message: string;
    canOpenSettings?: boolean;
  };
  screenRecording?: {
    granted: boolean;
    status: 'granted' | 'not-granted';
    message: string;
    canOpenSettings?: boolean;
  };
  selectedTextTrigger: {
    available: boolean;
    requiresShortcut: boolean;
  };
};

export function PermissionOnboarding({
  capabilities,
  refreshing,
  onRefresh,
  onOpenAccessibilitySettings,
  onOpenScreenRecordingSettings,
  prominent = false,
}: {
  capabilities: DesktopCapabilities | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onOpenAccessibilitySettings?: () => void;
  onOpenScreenRecordingSettings?: () => void;
  prominent?: boolean;
}) {
  const accessibilityGranted = capabilities?.accessibility.granted ?? false;
  const screenRecordingGranted = capabilities?.screenRecording?.granted ?? false;
  const missingPermission = !accessibilityGranted
    ? 'accessibility'
    : !screenRecordingGranted
      ? 'screen-recording'
      : null;
  const statusLabel = missingPermission ? 'Need Authorization' : 'Permission Ready';
  const cardTitle = missingPermission === 'screen-recording' ? '屏幕录制权限引导' : '辅助功能权限引导';
  const cardEyebrow = missingPermission === 'screen-recording' ? 'Screen Recording' : 'Accessibility';
  const primaryMessage = missingPermission === 'screen-recording'
    ? (capabilities?.screenRecording?.message ?? '正在检测屏幕录制权限...')
    : (capabilities?.accessibility.message ?? '正在检测桌面权限能力...');
  const canOpenSettings = missingPermission === 'screen-recording'
    ? capabilities?.screenRecording?.canOpenSettings
    : capabilities?.accessibility.canOpenSettings;
  const handleOpenSettings = missingPermission === 'screen-recording'
    ? onOpenScreenRecordingSettings
    : onOpenAccessibilitySettings;

  return (
    <Card title={cardTitle} eyebrow={cardEyebrow} className={`overflow-hidden border-slate-300 bg-[linear-gradient(180deg,#fffdf8_0%,#fff7ed_100%)] ${prominent ? 'shadow-[0_28px_90px_rgba(245,158,11,0.18)] ring-1 ring-amber-200/70' : ''}`}>
      <div className='space-y-4'>
        <div className='rounded-[20px] border border-amber-200/80 bg-white/80 p-4 shadow-sm'>
          <div className='mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700'>
            <span className='inline-flex h-2 w-2 rounded-full bg-amber-500' />
            {statusLabel}
          </div>
          <div className='grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]'>
            <div className='relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3 text-white'>
              <div className='mb-3 text-[10px] uppercase tracking-[0.22em] text-white/55'>AI 图示占位</div>
              <div className='space-y-2'>
                <div className='rounded-xl border border-white/10 bg-white/5 p-2'>
                  <div className='mb-1 text-[10px] text-white/45'>1</div>
                  <div className='h-5 rounded-md bg-white/90' />
                </div>
                <div className='rounded-xl border border-violet-300/30 bg-violet-400/10 p-2'>
                  <div className='mb-1 text-[10px] text-violet-200/80'>2</div>
                  <div className='h-5 rounded-md border border-dashed border-violet-300/50' />
                </div>
                <div className='rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-2'>
                  <div className='mb-1 text-[10px] text-emerald-100/75'>3</div>
                  <div className='h-5 rounded-md bg-emerald-200/85' />
                </div>
              </div>
            </div>
            <div className='space-y-3'>
              <p className='text-sm leading-6 text-slate-700'>{primaryMessage}</p>
              <ol className='space-y-2 text-sm leading-6 text-slate-600'>
                <li>1. 打开系统设置中的“隐私与安全性”。</li>
                <li>2. 若要划词后快捷键弹窗翻译，请在“辅助功能”中允许 Transloom。</li>
                <li>3. 若要使用区域截图，请在“屏幕录制”中允许 Transloom。</li>
                <li>4. 返回 Transloom，点击“刷新状态”确认权限已生效。</li>
              </ol>
              <div className='rounded-xl border border-dashed border-amber-200 bg-amber-50/70 px-3.5 py-3 text-sm text-amber-800'>
                当前优先处理：{missingPermission === 'screen-recording' ? '屏幕录制权限，决定是否能启动区域截图。' : missingPermission === 'accessibility' ? '辅助功能权限，决定是否能读取选中文本并唤起小窗。' : '两项关键桌面权限均已就绪。'}
              </div>
              {prominent ? (
                <div className='rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-600'>
                  建议先完成授权，再体验“选中文本 → 快捷键 → Transloom 小窗”的完整桌面闭环。
                </div>
              ) : null}
              <div className='flex flex-wrap gap-3'>
                {onRefresh ? (
                  <Button variant='secondary' onClick={onRefresh} disabled={refreshing || !capabilities?.desktopAvailable}>
                    {refreshing ? '刷新中...' : '刷新状态'}
                  </Button>
                ) : null}
                {handleOpenSettings ? (
                  <Button onClick={handleOpenSettings} disabled={!capabilities?.desktopAvailable || !canOpenSettings}>
                    打开系统设置
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

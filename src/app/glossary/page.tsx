'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

async function readResponsePayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return {
    message: text.trim() || `接口返回了 ${response.status}，但没有可读取的 JSON 内容。`,
  };
}

type GlossarySummary = {
  id: string;
  name: string;
  entries: number;
  sourceLang: string;
  targetLang: string;
  updatedAt: string;
};

type GlossaryEntry = {
  id: string;
  glossaryId: string;
  glossaryName: string;
  sourceLang: string;
  targetLang: string;
  sourceTerm: string;
  targetTerm: string;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function GlossaryPage() {
  const [summaries, setSummaries] = useState<GlossarySummary[]>([]);
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [message, setMessage] = useState('翻译前会优先做本地精确替换；载入完成后会在右侧显示当前术语表。');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: 'Product UI',
    sourceLang: 'en',
    targetLang: 'zh-CN',
    sourceTerm: 'Settings',
    targetTerm: '设置',
  });

  async function loadGlossary() {
    const response = await fetch('/api/glossary', { cache: 'no-store' });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(payload.message ?? payload.code ?? '读取术语表失败');
    }

    return {
      summaries: payload.summaries ?? [],
      entries: payload.entries ?? [],
    };
  }

  const refreshGlossary = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const payload = await loadGlossary();
      setSummaries(payload.summaries);
      setEntries(payload.entries);
      setLoadError(null);
      setMessage(payload.entries.length > 0 ? '已加载本地术语表。' : '当前还没有术语表，可以先创建一条。');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : '读取术语表失败。';
      setSummaries([]);
      setEntries([]);
      setLoadError(nextMessage);
      setMessage(nextMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGlossary();
  }, [refreshGlossary]);

  async function handleCreate() {
    const payload = {
      name: form.name.trim(),
      sourceLang: form.sourceLang.trim(),
      targetLang: form.targetLang.trim(),
      sourceTerm: form.sourceTerm.trim(),
      targetTerm: form.targetTerm.trim(),
    };

    if (!payload.name || !payload.sourceLang || !payload.targetLang || !payload.sourceTerm || !payload.targetTerm) {
      setMessage('术语表名称、语言和术语条目都不能为空。');
      return;
    }

    setIsSubmitting(true);
    setLoadError(null);
    setMessage('正在保存术语表...');

    try {
      const response = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await readResponsePayload(response);
      if (!response.ok) {
        setMessage(result.message ?? result.code ?? '保存失败');
        return;
      }

      setSummaries(result.summaries ?? []);
      setEntries(result.entries ?? []);
      setMessage('术语表已保存，可以回翻译页验证命中效果。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存术语表失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell title='术语表'>
      <div className='grid h-full min-h-0 gap-2 lg:grid-cols-[minmax(320px,0.96fr)_minmax(0,1.18fr)]'>
        <section className='flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#d6d6d6] bg-[#f7f7f7] shadow-[0_1px_0_rgba(255,255,255,0.75)]'>
          <div className='flex items-start justify-between gap-3 border-b border-[#dedede] px-4 py-3'>
            <div className='min-w-0'>
              <div className='text-[15px] font-medium text-[#111111]'>新增术语</div>
              <div className='mt-1 text-xs text-[#7d7d7d]'>直接录入一条本地替换规则，保存后右侧列表会立即刷新。</div>
            </div>
            <div className='shrink-0 rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-[11px] text-[#6b6b6b]'>本地草稿</div>
          </div>
          <div className='app-scrollbar min-h-0 flex-1 overflow-auto px-4 py-3'>
            <div className='space-y-2.5'>
              <div className='grid gap-2 md:grid-cols-[minmax(0,1.1fr)_repeat(2,minmax(0,0.62fr))]'>
                <div className='space-y-1.5'>
                  <label htmlFor='glossary-name' className='text-[11px] font-medium uppercase tracking-[0.08em] text-[#7b7b7b]'>术语表名称</label>
                  <Input id='glossary-name' value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>

                <div className='space-y-1.5'>
                  <label htmlFor='glossary-source-lang' className='text-[11px] font-medium uppercase tracking-[0.08em] text-[#7b7b7b]'>源语言</label>
                  <Input id='glossary-source-lang' value={form.sourceLang} onChange={(event) => setForm((current) => ({ ...current, sourceLang: event.target.value }))} />
                </div>

                <div className='space-y-1.5'>
                  <label htmlFor='glossary-target-lang' className='text-[11px] font-medium uppercase tracking-[0.08em] text-[#7b7b7b]'>目标语言</label>
                  <Input id='glossary-target-lang' value={form.targetLang} onChange={(event) => setForm((current) => ({ ...current, targetLang: event.target.value }))} />
                </div>
              </div>

              <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)]'>
                <div className='space-y-1.5'>
                  <label htmlFor='glossary-source-term' className='text-[11px] font-medium uppercase tracking-[0.08em] text-[#7b7b7b]'>原词</label>
                  <Input id='glossary-source-term' value={form.sourceTerm} onChange={(event) => setForm((current) => ({ ...current, sourceTerm: event.target.value }))} />
                </div>
                <div className='flex items-end justify-center pb-2 text-sm text-[#8a8a8a]'>→</div>
                <div className='space-y-1.5'>
                  <label htmlFor='glossary-target-term' className='text-[11px] font-medium uppercase tracking-[0.08em] text-[#7b7b7b]'>译词</label>
                  <Input id='glossary-target-term' value={form.targetTerm} onChange={(event) => setForm((current) => ({ ...current, targetTerm: event.target.value }))} />
                </div>
              </div>

              <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
                <div className='flex min-w-0 flex-wrap items-center gap-2 rounded-[14px] border border-[#dfdfdf] bg-white px-3 py-2 text-[12px] text-[#5a5a5a]'>
                  <span className='rounded-full bg-[#f3f3f3] px-2.5 py-1 text-[11px] text-[#666666]'>术语表：{form.name || '未命名'}</span>
                  <span className='rounded-full bg-[#f3f3f3] px-2.5 py-1 text-[11px] text-[#666666]'>{form.sourceLang || '源语言'} → {form.targetLang || '目标语言'}</span>
                  <span className='truncate rounded-full bg-[#f3f3f3] px-2.5 py-1 text-[11px] text-[#666666] max-md:max-w-full'>{form.sourceTerm || '原词'} → {form.targetTerm || '译词'}</span>
                </div>
                <Button className='w-full sm:w-auto sm:self-start' onClick={() => void handleCreate()} disabled={isLoading || isSubmitting}>
                  {isSubmitting ? '保存中...' : isLoading ? '正在载入...' : '保存术语表'}
                </Button>
              </div>

              <div className='rounded-[14px] border border-[#dfdfdf] bg-white px-3 py-2 text-sm text-[#555555]'>
                {message}
              </div>
            </div>
          </div>
        </section>

        <section className='flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#d6d6d6] bg-[#f7f7f7] shadow-[0_1px_0_rgba(255,255,255,0.75)]'>
          <div className='flex items-start justify-between gap-2 border-b border-[#dedede] px-4 py-3'>
            <div>
              <div className='text-[15px] font-medium text-[#111111]'>当前术语表</div>
              <div className='mt-1 text-xs text-[#7d7d7d]'>统一查看当前语言对、最近更新时间与会命中的本地替换规则。</div>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <div className='rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-[11px] text-[#6b6b6b]'>{summaries.length} 组</div>
              <div className='rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-[11px] text-[#6b6b6b]'>{entries.length} 条</div>
            </div>
          </div>
          <div className='grid min-h-0 flex-1 divide-y divide-[#dddddd] lg:grid-rows-[minmax(0,0.86fr)_minmax(0,1fr)] lg:divide-y-0'>
            <div className='app-scrollbar min-h-[132px] overflow-auto px-4 py-3 text-sm text-[#555555] lg:border-b lg:border-[#dddddd]'>
              {isLoading ? <div>正在同步本地术语表与条目...</div> : null}
              {!isLoading && loadError ? (
                <div className='space-y-3 rounded-[12px] border border-[#e3c7c7] bg-[#fff7f7] px-3 py-3 text-[#7a3030]'>
                  <div>当前无法读取术语表。{loadError}</div>
                  <Button size='sm' variant='secondary' onClick={() => void refreshGlossary()}>
                    重新加载
                  </Button>
                </div>
              ) : null}
              {!isLoading && !loadError && summaries.length === 0 ? <div>暂无术语表。先在左侧新增一条，或稍后重新加载。</div> : null}
              {!isLoading && !loadError && summaries.length > 0 ? (
                <div className='space-y-2'>
                  {summaries.map((item) => (
                    <div key={item.id} className='rounded-[12px] border border-[#dddddd] bg-white px-3 py-2.5'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <div className='truncate font-medium text-[#111111]'>{item.name}</div>
                          <div className='mt-0.5 text-[12px] text-[#6f6f6f]'>{item.sourceLang} → {item.targetLang}</div>
                        </div>
                        <div className='shrink-0 rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[11px] text-[#666666]'>{item.entries} 条</div>
                      </div>
                      <div className='mt-1 text-[11px] text-[#7a7a7a]'>更新于 {formatUpdatedAt(item.updatedAt)}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className='app-scrollbar min-h-0 overflow-auto'>
              {isLoading ? <div className='px-4 py-6 text-sm text-[#666666]'>条目会在读取完成后显示。</div> : null}
              {!isLoading && loadError ? (
                <div className='px-4 py-6 text-sm text-[#7a3030]'>术语条目暂时不可用，请先恢复上方的数据读取。</div>
              ) : null}
              {!isLoading && !loadError && entries.length === 0 ? (
                <div className='px-4 py-6 text-sm text-[#666666]'>暂无术语条目。新增后会立即显示在这里。</div>
              ) : null}
              {!isLoading && !loadError && entries.length > 0 ? (
                <div className='divide-y divide-[#dddddd]'>
                  {entries.map((entry) => (
                    <article key={entry.id} className='grid gap-2 px-4 py-2.5 text-sm text-[#555555] md:grid-cols-[minmax(0,1fr)_124px] md:items-center'>
                      <div className='min-w-0'>
                        <div className='truncate font-medium text-[#111111]'>{entry.sourceTerm} → {entry.targetTerm}</div>
                        <div className='mt-0.5 truncate text-[12px] text-[#6f6f6f]'>{entry.glossaryName}</div>
                      </div>
                      <div className='text-[11px] text-[#7a7a7a] md:text-right'>{entry.sourceLang} → {entry.targetLang}</div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

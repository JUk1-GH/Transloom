'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export default function GlossaryPage() {
  const [summaries, setSummaries] = useState<GlossarySummary[]>([]);
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [message, setMessage] = useState('正在读取本地术语表...');
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
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? payload.code ?? '读取术语表失败');
    }

    return {
      summaries: payload.summaries ?? [],
      entries: payload.entries ?? [],
    };
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const payload = await loadGlossary();
        if (cancelled) {
          return;
        }

        setSummaries(payload.summaries);
        setEntries(payload.entries);
        setMessage(payload.entries.length > 0 ? '已加载本地术语表。' : '当前还没有术语表，可以先创建一条。');
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : '读取术语表失败。');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
    setMessage('正在保存术语表...');

    try {
      const response = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
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
    <AppShell title='术语表' description='翻译前会优先做本地精确替换。'>
      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>新增术语</div>
          <div className='space-y-4 px-4 py-4'>
            <div className='grid gap-3 md:grid-cols-2'>
              <div className='space-y-2 md:col-span-2'>
                <label htmlFor='glossary-name' className='text-xs text-[#777777]'>术语表名称</label>
                <Input id='glossary-name' value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>

              <div className='space-y-2'>
                <label htmlFor='glossary-source-lang' className='text-xs text-[#777777]'>源语言</label>
                <Input id='glossary-source-lang' value={form.sourceLang} onChange={(event) => setForm((current) => ({ ...current, sourceLang: event.target.value }))} />
              </div>

              <div className='space-y-2'>
                <label htmlFor='glossary-target-lang' className='text-xs text-[#777777]'>目标语言</label>
                <Input id='glossary-target-lang' value={form.targetLang} onChange={(event) => setForm((current) => ({ ...current, targetLang: event.target.value }))} />
              </div>

              <div className='space-y-2'>
                <label htmlFor='glossary-source-term' className='text-xs text-[#777777]'>原词</label>
                <Input id='glossary-source-term' value={form.sourceTerm} onChange={(event) => setForm((current) => ({ ...current, sourceTerm: event.target.value }))} />
              </div>

              <div className='space-y-2'>
                <label htmlFor='glossary-target-term' className='text-xs text-[#777777]'>译词</label>
                <Input id='glossary-target-term' value={form.targetTerm} onChange={(event) => setForm((current) => ({ ...current, targetTerm: event.target.value }))} />
              </div>
            </div>

            <div className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3 text-sm text-[#555555]'>
              {message}
            </div>

            <Button onClick={() => void handleCreate()} disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : '保存术语表'}
            </Button>
          </div>
        </section>

        <section className='rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
          <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>当前术语表</div>
          <div className='space-y-2 px-4 py-4 text-sm text-[#555555]'>
            {isLoading ? <div>正在读取术语表...</div> : null}
            {!isLoading && summaries.length === 0 ? <div>暂无术语表。</div> : null}
            {summaries.map((item) => (
              <div key={item.id} className='rounded-[10px] border border-[#d9d9d9] bg-white px-3 py-3'>
                <div className='font-medium text-[#111111]'>{item.name}</div>
                <div className='mt-1'>{item.sourceLang} → {item.targetLang}</div>
                <div className='mt-1 text-xs text-[#7a7a7a]'>{item.entries} 条 · 更新于 {item.updatedAt}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className='overflow-hidden rounded-[14px] border border-[#d2d2d2] bg-[#f6f6f6]'>
        <div className='border-b border-[#dddddd] px-4 py-3 text-[15px] font-medium text-[#111111]'>术语条目</div>
        <div className='divide-y divide-[#dddddd]'>
          {!isLoading && entries.length === 0 ? (
            <div className='px-4 py-6 text-sm text-[#666666]'>暂无术语条目。</div>
          ) : null}

          {entries.map((entry) => (
            <article key={entry.id} className='flex flex-wrap items-start justify-between gap-3 px-4 py-4 text-sm text-[#555555]'>
              <div>
                <div className='font-medium text-[#111111]'>{entry.sourceTerm} → {entry.targetTerm}</div>
                <div className='mt-1'>{entry.glossaryName}</div>
              </div>
              <div className='text-[#7a7a7a]'>{entry.sourceLang} → {entry.targetLang}</div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/ui/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
        setMessage(payload.entries.length > 0 ? '已加载本地术语表。' : '当前还没有术语表，可先创建一条。');
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
      setMessage('术语表已保存。接下来可在翻译页验证术语命中。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存术语表失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell title='术语表' description='首版术语表支持本地创建与命中验证，翻译前会进行精确字符串替换。'>
      <div className='grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_360px]'>
        <Card title='新增术语' eyebrow='Create'>
          <div className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2 md:col-span-2'>
                <label htmlFor='glossary-name' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Glossary name</label>
                <Input id='glossary-name' value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder='术语表名称' />
              </div>
              <div className='space-y-2'>
                <label htmlFor='glossary-source-lang' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Source language</label>
                <Input id='glossary-source-lang' value={form.sourceLang} onChange={(event) => setForm((current) => ({ ...current, sourceLang: event.target.value }))} placeholder='source lang' />
              </div>
              <div className='space-y-2'>
                <label htmlFor='glossary-target-lang' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Target language</label>
                <Input id='glossary-target-lang' value={form.targetLang} onChange={(event) => setForm((current) => ({ ...current, targetLang: event.target.value }))} placeholder='target lang' />
              </div>
              <div className='space-y-2'>
                <label htmlFor='glossary-source-term' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Source term</label>
                <Input id='glossary-source-term' value={form.sourceTerm} onChange={(event) => setForm((current) => ({ ...current, sourceTerm: event.target.value }))} placeholder='源术语' />
              </div>
              <div className='space-y-2'>
                <label htmlFor='glossary-target-term' className='text-xs font-medium uppercase tracking-[0.16em] text-slate-500'>Target term</label>
                <Input id='glossary-target-term' value={form.targetTerm} onChange={(event) => setForm((current) => ({ ...current, targetTerm: event.target.value }))} placeholder='目标术语' />
              </div>
            </div>
            <div className='rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-slate-600'>{message}</div>
            <Button onClick={() => void handleCreate()} disabled={isSubmitting}>{isSubmitting ? '保存中...' : '保存术语表'}</Button>
          </div>
        </Card>

        <Card title='本地术语表摘要' eyebrow='Library'>
          <div className='space-y-3'>
            {isLoading ? <div className='rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-slate-500'>正在读取术语表...</div> : null}
            {!isLoading && summaries.length === 0 ? <div className='rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-slate-500'>暂无术语表。</div> : null}
            {summaries.map((item) => (
              <article key={item.id} className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-4'>
                <div className='font-medium text-slate-900'>{item.name}</div>
                <div className='mt-1 text-sm text-slate-500'>{item.sourceLang} → {item.targetLang}</div>
                <div className='mt-2 text-xs text-slate-500'>{item.entries} entries · 更新于 {item.updatedAt}</div>
              </article>
            ))}
          </div>
        </Card>
      </div>

      <Card title='术语条目' eyebrow='Entries'>
        <div className='space-y-2'>
          {!isLoading && entries.length === 0 ? <div className='rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-slate-500'>暂无术语条目。</div> : null}
          {entries.map((entry) => (
            <article key={entry.id} className='flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3'>
              <div>
                <div className='font-medium text-slate-900'>{entry.sourceTerm} → {entry.targetTerm}</div>
                <div className='mt-1 text-sm text-slate-500'>{entry.glossaryName}</div>
              </div>
              <div className='text-xs text-slate-500'>{entry.sourceLang} → {entry.targetLang}</div>
            </article>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

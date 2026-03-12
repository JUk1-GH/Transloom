'use client';

import { AppShell } from '@/components/ui/app-shell';
import { TextTranslationWorkspace } from '@/components/workspace/text-translation-workspace';

export default function TranslatePage() {
  return (
    <AppShell title='翻译文本' description='像桌面翻译器一样直接工作：左边输入，右边查看结果。'>
      <TextTranslationWorkspace initialSource='' />
    </AppShell>
  );
}

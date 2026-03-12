'use client';

import { AppShell } from '@/components/ui/app-shell';
import { TextTranslationWorkspace } from '@/components/workspace/text-translation-workspace';

export default function TranslatePage() {
  return (
    <AppShell title='文本翻译工作区' description='以主编辑区为中心，保持 DeepL 风格的高频翻译节奏，并为截图与小窗链路预留统一上下文。'>
      <TextTranslationWorkspace />
    </AppShell>
  );
}

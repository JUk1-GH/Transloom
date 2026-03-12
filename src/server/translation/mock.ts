import type { TranslateInput, TranslateResult } from '@/domain/translation/provider';

function guessLanguageLabel(targetLang: string) {
  switch (targetLang) {
    case 'zh-CN':
      return '简中';
    case 'ja':
      return '日语';
    case 'ko':
      return '韩语';
    case 'fr':
      return '法语';
    case 'de':
      return '德语';
    default:
      return targetLang;
  }
}

export function buildMockTranslation(input: TranslateInput, warning?: string): TranslateResult {
  return {
    text: `【Mock ${guessLanguageLabel(input.targetLang)}】${input.text}`,
    provider: 'mock',
    mode: 'mock',
    warning: warning ?? '当前未连接真实 provider，已自动切换到 Mock 模式。',
    detectedSourceLang: input.sourceLang || 'auto',
    charactersBilled: input.text.length,
  };
}

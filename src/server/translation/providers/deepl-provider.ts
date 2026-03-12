import type { TranslateInput, TranslateResult, TranslationProvider } from '@/domain/translation/provider';

export const deeplProvider: TranslationProvider = {
  id: 'deepl',
  label: 'DeepL',
  async translate(input: TranslateInput): Promise<TranslateResult> {
    return {
      text: `[DeepL] ${input.text}`,
      provider: 'deepl',
      mode: 'real',
      charactersBilled: input.text.length,
    };
  },
  supportsGlossary: true,
};

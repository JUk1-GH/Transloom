import type { TranslateInput, TranslateResult, TranslationProvider } from '@/domain/translation/provider';

export const googleProvider: TranslationProvider = {
  id: 'google',
  label: 'Google Translate',
  async translate(input: TranslateInput): Promise<TranslateResult> {
    return {
      text: `[Google] ${input.text}`,
      provider: 'google',
      mode: 'real',
      charactersBilled: input.text.length,
    };
  },
};

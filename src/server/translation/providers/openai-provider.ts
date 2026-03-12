import type { TranslateInput, TranslateResult, TranslationProvider } from '@/domain/translation/provider';

export const openAiProvider: TranslationProvider = {
  id: 'openai',
  label: 'OpenAI',
  async translate(input: TranslateInput): Promise<TranslateResult> {
    return {
      text: `[OpenAI] ${input.text}`,
      provider: 'openai',
      mode: 'real',
      charactersBilled: input.text.length,
    };
  },
  supportsVision: true,
};

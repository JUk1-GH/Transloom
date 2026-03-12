import type { TranslateInput } from '@/domain/translation/provider';
import { listGlossaryEntries } from '@/server/glossary/service';
import { recordHistory } from '@/server/history/service';
import { buildMockTranslation } from '@/server/translation/mock';
import { resolveProvider } from '@/server/translation/providers/provider-registry';
import { recordUsage } from '@/server/usage/service';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function applyGlossary(text: string, glossaryId?: string) {
  const entries = await listGlossaryEntries(glossaryId);
  if (entries.length === 0) {
    return { text, glossaryApplied: false };
  }

  let nextText = text;
  let glossaryApplied = false;

  for (const entry of entries) {
    if (!entry.sourceTerm.trim() || !entry.targetTerm.trim()) {
      continue;
    }

    const pattern = new RegExp(escapeRegExp(entry.sourceTerm), 'g');
    if (pattern.test(nextText)) {
      glossaryApplied = true;
      nextText = nextText.replace(pattern, entry.targetTerm);
    }
  }

  return { text: nextText, glossaryApplied };
}

export async function translateText(input: TranslateInput) {
  const provider = await resolveProvider(input.providerId);
  const { text: preparedText, glossaryApplied } = await applyGlossary(input.text, input.glossaryId);
  const nextInput = { ...input, text: preparedText };
  const shouldPersistUsage = input.persistUsage ?? true;
  const shouldPersistHistory = input.persistHistory ?? true;

  try {
    const result = await provider.translate(nextInput);

    await Promise.all([
      shouldPersistUsage
        ? recordUsage({
            charactersTranslated: result.charactersBilled ?? nextInput.text.length,
            mode: 'text',
          })
        : Promise.resolve(),
      shouldPersistHistory
        ? recordHistory({
            mode: 'text',
            sourceText: input.text,
            translatedText: result.text,
            sourceLang: result.detectedSourceLang ?? input.sourceLang,
            targetLang: input.targetLang,
            provider: result.provider,
            charactersUsed: result.charactersBilled ?? nextInput.text.length,
            success: true,
          })
        : Promise.resolve(),
    ]);

    return {
      ...result,
      mode: 'real' as const,
      warning: glossaryApplied ? '已命中术语表并优先替换术语。' : result.warning,
    };
  } catch (error) {
    const fallback = buildMockTranslation(input, error instanceof Error ? error.message : undefined);

    await Promise.all([
      shouldPersistUsage
        ? recordUsage({
            charactersTranslated: fallback.charactersBilled ?? input.text.length,
            mode: 'text',
          })
        : Promise.resolve(),
      shouldPersistHistory
        ? recordHistory({
            mode: 'text',
            sourceText: input.text,
            translatedText: fallback.text,
            sourceLang: input.sourceLang,
            targetLang: input.targetLang,
            provider: fallback.provider,
            charactersUsed: fallback.charactersBilled ?? input.text.length,
            success: true,
          })
        : Promise.resolve(),
    ]);

    return {
      ...fallback,
      warning: glossaryApplied ? `${fallback.warning} 术语表命中已在 Mock 前生效。` : fallback.warning,
    };
  }
}

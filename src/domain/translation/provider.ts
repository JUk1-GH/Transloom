export type ProviderKind = 'deepl' | 'openai' | 'google' | 'openai-compatible';
export type RuntimeMode = 'real' | 'mock';

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  model?: string;
  apiKeyMasked?: string;
  hasApiKey?: boolean;
  enabled: boolean;
  supportsVision?: boolean;
}

export interface TranslateInput {
  text: string;
  sourceLang?: string;
  targetLang: string;
  glossaryId?: string;
  providerId?: string;
  userId?: string;
  persistHistory?: boolean;
  persistUsage?: boolean;
  providerConfig?: {
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

export interface TranslateResult {
  text: string;
  provider: string;
  mode: RuntimeMode;
  warning?: string;
  detectedSourceLang?: string;
  charactersBilled?: number;
}

export interface TranslationProvider {
  id: string;
  label: string;
  translate(input: TranslateInput): Promise<TranslateResult>;
  validateConfig?(config: ProviderConfig): Promise<boolean>;
  supportsGlossary?: boolean;
  supportsFormality?: boolean;
  supportsVision?: boolean;
}

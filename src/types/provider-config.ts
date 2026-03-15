export interface ProviderConfigRecord {
  id: string;
  kind: "deepl" | "openai" | "google" | "openai-compatible" | "tencent";
  label: string;
  baseUrl?: string;
  model?: string;
  apiKeyMasked?: string;
  hasApiKey?: boolean;
  enabled: boolean;
  supportsVision?: boolean;
}

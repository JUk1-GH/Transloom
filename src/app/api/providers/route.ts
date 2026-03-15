import { NextResponse } from "next/server";
import type { ProviderConfig, ProviderKind } from "@/domain/translation/provider";
import { listProviderConfigs, saveProviderConfig } from "@/server/providers/provider-config-service";

const providerKinds: ProviderKind[] = ["deepl", "openai", "google", "openai-compatible", "tencent"];

function isProviderKind(value: unknown): value is ProviderKind {
  return typeof value === "string" && providerKinds.includes(value as ProviderKind);
}

export async function GET() {
  return NextResponse.json(await listProviderConfigs());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ProviderConfig>;

  if (!isProviderKind(body.kind)) {
    return NextResponse.json({ error: "Invalid provider kind." }, { status: 400 });
  }

  const savedConfig = await saveProviderConfig({
    id: body.id?.trim() || `provider-${body.kind}`,
    kind: body.kind,
    label: body.label?.trim() || body.kind,
    enabled: body.enabled ?? false,
    baseUrl: body.baseUrl?.trim() || undefined,
    model: body.model?.trim() || undefined,
    apiKeyMasked: body.apiKeyMasked?.trim() || undefined,
    hasApiKey: body.hasApiKey ?? Boolean(body.apiKeyMasked?.trim()),
    supportsVision: body.supportsVision,
  });

  return NextResponse.json(
    {
      persisted: true,
      provider: savedConfig,
      availableProviders: await listProviderConfigs(),
    },
    { status: 201 },
  );
}

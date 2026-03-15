import { NextResponse } from "next/server";
import { z } from "zod";
import { translateText } from "@/server/translation/translate-text";

const translateRequestSchema = z.object({
  text: z.string().trim().min(1, "请输入要翻译的文本。"),
  sourceLang: z.string().trim().optional(),
  targetLang: z.string().trim().min(1, "请选择目标语言。"),
  glossaryId: z.string().trim().optional(),
  providerId: z.string().trim().optional(),
  providerConfig: z
    .object({
      kind: z.enum(["deepl", "openai", "google", "openai-compatible", "tencent"]).optional(),
      baseUrl: z.string().trim().optional(),
      model: z.string().trim().optional(),
      apiKey: z.string().trim().optional(),
      secretId: z.string().trim().optional(),
      secretKey: z.string().trim().optional(),
      region: z.string().trim().optional(),
      projectId: z.union([z.string().trim(), z.number()]).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = translateRequestSchema.parse(await request.json());
    const result = await translateText({
      text: body.text,
      sourceLang: body.sourceLang,
      targetLang: body.targetLang,
      glossaryId: body.glossaryId,
      providerId: body.providerId,
      providerConfig: body.providerConfig,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: "INVALID_REQUEST",
          message: error.issues[0]?.message ?? "请求参数不合法。",
          detail: error.issues,
        },
        { status: 400 },
      );
    }

    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "TRANSLATION_FAILED";
    const message = error instanceof Error ? error.message : "翻译失败，请稍后重试。";
    const detail = typeof error === "object" && error !== null && "detail" in error ? error.detail : undefined;

    return NextResponse.json(
      {
        code,
        message,
        detail,
      },
      { status },
    );
  }
}

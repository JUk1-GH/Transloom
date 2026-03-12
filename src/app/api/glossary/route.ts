import { NextResponse } from 'next/server';
import { createGlossaryWithEntry, listGlossaryEntries, listGlossarySummaries } from '@/server/glossary/service';

export async function GET() {
  return NextResponse.json({
    summaries: await listGlossarySummaries(),
    entries: await listGlossaryEntries(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      sourceLang?: string;
      targetLang?: string;
      sourceTerm?: string;
      targetTerm?: string;
    };

    const created = await createGlossaryWithEntry({
      name: body.name ?? '',
      sourceLang: body.sourceLang ?? '',
      targetLang: body.targetLang ?? '',
      sourceTerm: body.sourceTerm ?? '',
      targetTerm: body.targetTerm ?? '',
    });

    return NextResponse.json(
      {
        created,
        summaries: await listGlossarySummaries(),
        entries: await listGlossaryEntries(),
      },
      { status: 201 },
    );
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'GLOSSARY_SAVE_FAILED';

    return NextResponse.json(
      {
        code,
        message: error instanceof Error ? error.message : '保存术语表失败。',
      },
      { status },
    );
  }
}

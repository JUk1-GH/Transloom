import { NextResponse } from 'next/server';
import { addGlossaryEntry, listGlossaryEntries, listGlossarySummaries } from '@/server/glossary/service';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      glossaryId?: string;
      sourceTerm?: string;
      targetTerm?: string;
    };

    const created = await addGlossaryEntry({
      glossaryId: body.glossaryId ?? '',
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
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'GLOSSARY_ENTRY_SAVE_FAILED';

    return NextResponse.json(
      {
        code,
        message: error instanceof Error ? error.message : '保存术语规则失败。',
      },
      { status },
    );
  }
}

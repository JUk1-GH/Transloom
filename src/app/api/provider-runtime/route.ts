import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    baseUrl: null,
    model: null,
    hasApiKey: false,
    runtimeMode: 'mock',
  });
}

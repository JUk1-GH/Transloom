import { NextResponse } from "next/server";
import { listHistoryRecords } from "@/server/history/service";

export async function GET() {
  return NextResponse.json(await listHistoryRecords());
}

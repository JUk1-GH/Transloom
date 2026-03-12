import { NextResponse } from "next/server";
import { getUsageSummary } from "@/server/usage/service";

export async function GET() {
  return NextResponse.json(await getUsageSummary());
}

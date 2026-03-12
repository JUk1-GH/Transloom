import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      code: "UNAVAILABLE_IN_LOCAL_DESKTOP",
      message: "本地单机版未启用在线结账能力。",
    },
    { status: 410 },
  );
}

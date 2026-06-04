import { NextResponse } from "next/server";
import { configuredAppTokens, fetchReport } from "@/lib/adjust";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const startDate = url.searchParams.get("start") ?? defaultStart();
  const endDate = url.searchParams.get("end") ?? today();
  const withCountry = url.searchParams.get("country") === "1";
  const withDay = url.searchParams.get("day") === "1";

  try {
    const rows = await fetchReport({
      startDate,
      endDate,
      withCountry,
      withDay,
      appTokens: configuredAppTokens(),
    });
    return NextResponse.json({
      rows,
      startDate,
      endDate,
      withCountry,
      withDay,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

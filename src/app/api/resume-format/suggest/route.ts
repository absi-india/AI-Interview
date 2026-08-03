import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { reviewResume } from "@/lib/resume-formatting/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Second analysis pass: wording suggestions only. Runs after the editor is
 * already open, so a slow or failed review never blocks the user.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rawText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawText = typeof body.rawText === "string" ? body.rawText : "";
  if (!rawText.trim()) return NextResponse.json({ suggestions: [] });

  try {
    const suggestions = await reviewResume(rawText);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[resume-format/suggest] failed", err);
    // Non-fatal: the editor stays usable without suggestions.
    return NextResponse.json({ suggestions: [] });
  }
}

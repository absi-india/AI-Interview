import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { reviewResume } from "@/lib/resume-formatting/analyze";
import { punctuationSuggestions } from "@/lib/resume-formatting/punctuation";
import type { ResumeModel, Suggestion } from "@/lib/resume-formatting/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Second analysis pass: wording suggestions only. Runs after the editor is
 * already open, so a slow or failed review never blocks the user.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rawText?: string; model?: ResumeModel };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawText = typeof body.rawText === "string" ? body.rawText : "";
  if (!rawText.trim()) return NextResponse.json({ suggestions: [] });

  // Rule-based punctuation fixes run regardless of what the AI review returns,
  // so mechanical errors like ".." are always caught.
  let mechanical: Suggestion[] = [];
  if (body.model) {
    try {
      mechanical = punctuationSuggestions(body.model, () => randomUUID());
    } catch (err) {
      console.warn("[resume-format/suggest] punctuation scan failed", err);
    }
  }

  let aiSuggestions: Suggestion[] = [];
  try {
    aiSuggestions = await reviewResume(rawText);
  } catch (err) {
    console.error("[resume-format/suggest] review failed", err);
  }

  // Drop AI items that target text a punctuation fix already covers.
  const taken = new Set(mechanical.map((s) => s.original));
  const merged = [...mechanical, ...aiSuggestions.filter((s) => !taken.has(s.original))];

  return NextResponse.json({ suggestions: merged });
}

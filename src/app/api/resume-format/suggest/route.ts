import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { reviewResume } from "@/lib/resume-formatting/analyze";
import { punctuationSuggestions } from "@/lib/resume-formatting/punctuation";
import { spellingSuggestions } from "@/lib/resume-formatting/spelling";
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

  // Rule-based spelling and punctuation fixes run regardless of what the AI
  // review returns, so typos and mechanical errors like ".." are always
  // caught rather than being dropped as too small to be worth a suggestion.
  let mechanical: Suggestion[] = [];
  if (body.model) {
    const run = (name: string, scan: (m: ResumeModel, id: () => string) => Suggestion[]) => {
      try {
        return scan(body.model as ResumeModel, () => randomUUID());
      } catch (err) {
        console.warn(`[resume-format/suggest] ${name} scan failed`, err);
        return [];
      }
    };

    const spelling = run("spelling", spellingSuggestions);
    // A spelling item rewrites a whole sentence and tidies its punctuation on
    // the way, so a punctuation item quoting part of that sentence would no
    // longer match once it was applied. Keep only the ones that do not overlap.
    const punctuation = run("punctuation", punctuationSuggestions).filter(
      (p) => !spelling.some((s) => s.original.includes(p.original)),
    );
    mechanical = [...spelling, ...punctuation];
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

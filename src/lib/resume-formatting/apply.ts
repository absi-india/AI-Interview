import type { QualityScores, ResumeModel, Suggestion, SuggestionType } from "./types";

/** The text that should be used when a suggestion is applied. */
export function effectiveSuggestionText(s: Suggestion): string {
  return s.status === "edited" ? s.editedText ?? s.suggested : s.suggested;
}

function replaceAll(text: string, from: string, to: string): string {
  if (!from || !text.includes(from)) return text;
  return text.split(from).join(to);
}

/**
 * Produce a resume model with all accepted / edited suggestions applied.
 * Rejected and pending suggestions leave the original text untouched, so no
 * wording change ever reaches the export without explicit approval.
 */
export function applyAcceptedSuggestions(model: ResumeModel, suggestions: Suggestion[]): ResumeModel {
  const active = suggestions.filter((s) => s.status === "accepted" || s.status === "edited");
  if (!active.length) return model;

  const clone: ResumeModel = structuredClone(model);
  const apply = (text: string | undefined): string | undefined => {
    if (!text) return text;
    let out = text;
    for (const s of active) out = replaceAll(out, s.original, effectiveSuggestionText(s));
    return out;
  };

  clone.summary = apply(clone.summary);
  clone.summaryBullets = clone.summaryBullets?.map((b) => apply(b) ?? b);
  clone.title = apply(clone.title);
  clone.additional = apply(clone.additional);
  clone.experience = clone.experience.map((e) => ({
    ...e,
    title: apply(e.title),
    bullets: e.bullets.map((b) => apply(b) ?? b),
    environment: apply(e.environment),
  }));
  clone.projects = clone.projects.map((p) => ({
    ...p,
    description: apply(p.description),
    bullets: p.bullets.map((b) => apply(b) ?? b),
  }));
  clone.skills = clone.skills.map((s) => ({ ...s, skills: s.skills.map((x) => apply(x) ?? x) }));
  return clone;
}

const TYPE_TO_SCORES: Record<SuggestionType, (keyof QualityScores)[]> = {
  spelling: ["spelling", "professional"],
  grammar: ["grammar", "professional"],
  "professional-wording": ["professional", "readability"],
  clarity: ["readability", "professional"],
  ats: ["ats"],
  formatting: ["formatting"],
  "date-inconsistency": ["formatting"],
  duplicate: ["readability", "ats"],
  "missing-info": ["ats", "formatting"],
};

/**
 * Nudge the AI's baseline scores upward as the user accepts suggestions, so the
 * quality panel improves live. Estimates only — never a guarantee of hiring/ATS.
 */
export function liveScores(base: QualityScores, suggestions: Suggestion[]): QualityScores {
  const out: QualityScores = { ...base };
  const cap = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  for (const s of suggestions) {
    if (s.status !== "accepted" && s.status !== "edited") continue;
    for (const key of TYPE_TO_SCORES[s.type]) {
      out[key] = cap(out[key] + 3);
    }
  }
  out.overall = cap(
    (out.grammar + out.spelling + out.ats + out.readability + out.formatting + out.professional) / 6,
  );
  return out;
}

export interface SuggestionCounts {
  pending: number;
  accepted: number;
  rejected: number;
  edited: number;
  clarify: number;
}

export function countSuggestions(suggestions: Suggestion[]): SuggestionCounts {
  const c: SuggestionCounts = { pending: 0, accepted: 0, rejected: 0, edited: 0, clarify: 0 };
  for (const s of suggestions) c[s.status] += 1;
  return c;
}

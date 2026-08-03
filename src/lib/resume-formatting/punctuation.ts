import type { ResumeModel, Suggestion } from "./types";

/**
 * Deterministic punctuation and spacing fixes.
 *
 * These are mechanical errors (".." , " ,", "word,word") that an AI review may
 * or may not happen to notice, so they are detected with rules instead — every
 * occurrence is caught, every time. They are still raised as suggestions and
 * applied only once the user accepts them.
 */

interface Rule {
  /** Must be global; each match becomes a suggestion. */
  re: RegExp;
  fix: (m: RegExpMatchArray) => string;
  reason: string;
}

const RULES: Rule[] = [
  {
    re: /([A-Za-z0-9])\.{2,}(?!\.)(\s|$)/g,
    fix: (m) => `${m[1]}.${m[2]}`,
    reason: "Repeated full stop — a sentence should end with a single period.",
  },
  {
    re: /\s+([,.;:!?])/g,
    fix: (m) => m[1],
    reason: "Space before punctuation removed.",
  },
  {
    re: /([,;:])([A-Za-z])/g,
    fix: (m) => `${m[1]} ${m[2]}`,
    reason: "Missing space after punctuation.",
  },
  {
    re: /([a-z0-9])\.([A-Z][a-z])/g,
    fix: (m) => `${m[1]}. ${m[2]}`,
    reason: "Missing space between sentences.",
  },
  {
    re: /,{2,}/g,
    fix: () => ",",
    reason: "Repeated comma reduced to one.",
  },
  {
    re: /[ \t]{2,}(?=\S)/g,
    fix: () => " ",
    reason: "Extra spacing collapsed to a single space.",
  },
];

/**
 * Apply every rule to a snippet. Fixing one issue often exposes another —
 * "SSIS ,and" needs both the space-before-comma and space-after-comma rules —
 * so a single pass per rule would leave the text half corrected.
 */
function cleanSnippet(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      out = out.replace(rule.re, (...args) => {
        const groups = args.slice(0, -2) as string[];
        return rule.fix(groups as unknown as RegExpMatchArray);
      });
      rule.re.lastIndex = 0;
    }
    if (out === before) break;
  }
  return out;
}

/** Widen a match to the surrounding sentence so the card shows useful context. */
function contextAround(text: string, index: number, length: number): { start: number; end: number } {
  const before = text.lastIndexOf(" ", Math.max(0, index - 40));
  const start = Math.max(0, before === -1 ? Math.max(0, index - 40) : before + 1);
  const afterFrom = index + length + 40;
  const after = text.indexOf(" ", Math.min(text.length, afterFrom));
  const end = after === -1 ? text.length : after;
  return { start, end };
}

function scanText(
  text: string,
  section: string,
  seen: Set<string>,
  makeId: () => string,
): Suggestion[] {
  const out: Suggestion[] = [];
  if (!text || text.length < 3) return out;

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      if (m[0] === undefined) break;
      const { start, end } = contextAround(text, m.index, m[0].length);
      const original = text.slice(start, end);
      // The snippet must be locatable and uniquely replaceable later on.
      if (!original.trim() || seen.has(original)) continue;

      const corrected = cleanSnippet(original);
      if (corrected === original) continue;

      seen.add(original);
      out.push({
        id: makeId(),
        type: "grammar",
        section,
        original,
        suggested: corrected,
        reason: rule.reason,
        status: "pending",
      });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

/** Punctuation suggestions across every text field of the resume. */
export function punctuationSuggestions(model: ResumeModel, makeId: () => string): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];

  const add = (text: string | undefined, section: string) => {
    if (!text) return;
    out.push(...scanText(text, section, seen, makeId));
  };

  add(model.summary, "Professional Summary");
  (model.summaryBullets ?? []).forEach((b) => add(b, "Professional Summary"));
  model.experience.forEach((e) => {
    add(e.title, "Professional Experience");
    e.bullets.forEach((b) => add(b, "Professional Experience"));
    add(e.environment, "Professional Experience");
  });
  model.projects.forEach((p) => {
    add(p.description, "Projects");
    p.bullets.forEach((b) => add(b, "Projects"));
  });
  add(model.additional, "Additional Information");

  return out.slice(0, 30);
}

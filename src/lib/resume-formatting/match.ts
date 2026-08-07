import { BULLET_MARK } from "./segment";
import type { ResumeModel, Suggestion } from "./types";

/**
 * Content match check: how much of the uploaded resume actually survived into
 * the formatted document, and precisely what did not.
 *
 * This exists to be checked rather than trusted. Extraction is a language-model
 * step and it has dropped roles, bullets and whole sections before, so the
 * result is verified against the original text instead of being assumed
 * correct. The figure is deliberately unforgiving: anything that cannot be
 * found is reported as missing, even when the omission was reasonable.
 */

export type MatchStatus = "exact" | "reworded" | "missing";

export interface MatchedUnit {
  text: string;
  status: MatchStatus;
  /** Set when an accepted suggestion deliberately changed the wording. */
  changedTo?: string;
}

export interface MatchReport {
  /** Percentage of the original's content units found in the output, 0-100. */
  coverage: number;
  totalUnits: number;
  exact: number;
  reworded: number;
  missingUnits: MatchedUnit[];
  /** Lines skipped as page furniture rather than content. */
  ignored: number;
}

/** Strip to comparable form: lowercase, alphanumerics and single spaces only. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(" ").filter((t) => t.length > 2);
}

/** Share of the original's words present in the candidate, 0-1. */
function overlap(source: string[], candidate: Set<string>): number {
  if (!source.length) return 0;
  let hit = 0;
  for (const t of source) if (candidate.has(t)) hit += 1;
  return hit / source.length;
}

// Page furniture and separators that are not resume content.
const NOISE = [
  /^page\s*\d+(\s*of\s*\d+)?$/i,
  /^\d+$/,
  /^[-–—_=*.·•\s]+$/,
  /^(continued|cont\.?)$/i,
];

function isNoise(line: string): boolean {
  const t = line.trim();
  if (t.length < 12) return true; // headings and stray fragments carry little content
  return NOISE.some((re) => re.test(t));
}

/** Every text value the formatted resume will actually render. */
function modelStrings(model: ResumeModel): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    if (v && v.trim()) out.push(v);
  };

  push(model.name);
  push(model.title);
  push(model.requisitionNumber);
  push(model.summary);
  (model.summaryBullets ?? []).forEach(push);
  push(model.contact.location);
  push(model.contact.phone);
  push(model.contact.email);
  push(model.contact.linkedin);
  push(model.contact.website);
  push(model.additional);

  for (const s of model.skills) {
    push(s.category);
    s.skills.forEach(push);
  }
  for (const e of model.experience) {
    push(e.company);
    push(e.location);
    push(e.startDate);
    push(e.endDate);
    push(e.title);
    push(e.environment);
    e.bullets.forEach(push);
  }
  for (const e of model.education) {
    push(e.degree);
    push(e.areaOfStudy);
    push(e.school);
    push(e.location);
    push(e.date);
  }
  for (const c of model.certifications) {
    push(c.name);
    push(c.issuer);
    push(c.date);
  }
  for (const p of model.projects) {
    push(p.name);
    push(p.description);
    p.bullets.forEach(push);
  }

  return out;
}

/**
 * Compare the uploaded resume against the formatted result.
 *
 * `suggestions` are consulted so that wording the user deliberately approved is
 * reported as reworded rather than lost.
 */
export function buildMatchReport(
  rawText: string,
  model: ResumeModel,
  suggestions: Suggestion[] = [],
): MatchReport {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(new RegExp(`^${BULLET_MARK.trim()}\\s*`), "").trim())
    .filter(Boolean);

  const units: string[] = [];
  let ignored = 0;
  const seen = new Set<string>();
  for (const line of lines) {
    if (isNoise(line)) {
      ignored += 1;
      continue;
    }
    // Running page headers repeat verbatim; count them once.
    const key = normalize(line);
    if (seen.has(key)) {
      ignored += 1;
      continue;
    }
    seen.add(key);
    units.push(line);
  }

  const strings = modelStrings(model);
  const haystack = ` ${strings.map(normalize).join(" | ")} `;
  const candidates = strings.map((s) => ({ text: s, set: new Set(tokens(s)) }));
  // Some source lines are split across separate fields in the output — a date
  // range becomes a start and an end, a company line becomes company plus
  // location — so a whole-document token check catches those too.
  const allTokens = new Set<string>();
  for (const c of candidates) for (const t of c.set) allTokens.add(t);

  // Text the user approved a change to still counts as present.
  const acceptedFrom = new Map<string, string>();
  for (const s of suggestions) {
    if (s.status === "accepted" || s.status === "edited") {
      acceptedFrom.set(normalize(s.original), s.editedText ?? s.suggested);
    }
  }

  let exact = 0;
  let reworded = 0;
  const missingUnits: MatchedUnit[] = [];

  for (const unit of units) {
    const norm = normalize(unit);
    if (!norm) {
      ignored += 1;
      continue;
    }

    if (haystack.includes(norm)) {
      exact += 1;
      continue;
    }

    const approved = acceptedFrom.get(norm);
    if (approved) {
      reworded += 1;
      continue;
    }

    // Allow for light reformatting: most of the words present in one place.
    const unitTokens = tokens(unit);
    let best = 0;
    let bestText = "";
    for (const c of candidates) {
      const score = overlap(unitTokens, c.set);
      if (score > best) {
        best = score;
        bestText = c.text;
      }
      if (best === 1) break;
    }

    if (best >= 0.85) {
      reworded += 1;
      continue;
    }

    // Short factual lines only: every word must be present somewhere in the
    // output. Long prose is excluded so a genuinely dropped bullet cannot slip
    // through on incidental word reuse.
    if (unitTokens.length > 0 && unitTokens.length <= 8 && overlap(unitTokens, allTokens) >= 0.95) {
      exact += 1;
      continue;
    }
    if (best >= 0.6) {
      // Recognisable but materially altered — reported, not counted as present.
      missingUnits.push({ text: unit, status: "reworded", changedTo: bestText });
      continue;
    }
    missingUnits.push({ text: unit, status: "missing" });
  }

  const total = units.length;
  const found = exact + reworded;
  return {
    coverage: total ? Math.round((found / total) * 100) : 100,
    totalUnits: total,
    exact,
    reworded,
    missingUnits,
    ignored,
  };
}

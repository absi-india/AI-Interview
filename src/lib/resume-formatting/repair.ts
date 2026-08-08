import { splitSourceJobs, type SourceJob } from "./segment";
import type { ResumeModel } from "./types";

/**
 * Guarantee that every bullet present in the uploaded resume survives.
 *
 * The model is asked to copy bullets verbatim, but it does not always return
 * all of them — long roles came back with several bullets missing. Rather than
 * trusting the extraction, the bullets are read straight from the source text
 * and any that the model omitted are restored, in their original order.
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** First meaningful words, used for loose matching between source and model. */
function fingerprint(s: string): string {
  return normalize(s).split(" ").slice(0, 8).join(" ");
}

function alreadyPresent(bullet: string, existing: string[]): boolean {
  const fp = fingerprint(bullet);
  if (!fp) return true;
  return existing.some((e) => {
    const efp = fingerprint(e);
    return efp === fp || efp.startsWith(fp) || fp.startsWith(efp);
  });
}

/** Reduce a date to a comparable year-month key, tolerating "Jun'07" and "2007". */
function dateKey(value: string | undefined): string {
  const v = normalize(value ?? "");
  if (!v) return "";
  const year = v.match(/\b(19|20)?(\d{2})\b(?!.*\b(19|20)?\d{2}\b)/);
  const month = v.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  const y = year ? year[2] : "";
  return `${month ? month[1] : ""}${y}`;
}

/**
 * Collapse the same engagement listed more than once.
 *
 * Resumes commonly carry a summary table of every project AND a detailed
 * write-up of each one further down. Both are extracted, which would otherwise
 * present every role twice. Entries are merged only when the employer and the
 * dates agree — the same client engaged across different years stays separate.
 */
export function mergeDuplicateRoles(model: ResumeModel): ResumeModel {
  const merged: ResumeModel["experience"] = [];
  const indexByKey = new Map<string, number>();
  let collapsed = 0;

  for (const entry of model.experience) {
    const company = normalize(entry.company ?? "");
    const key = `${company}|${dateKey(entry.startDate)}|${dateKey(entry.endDate)}`;
    // Without a company or any date there is nothing safe to match on.
    const existingIdx = company && (entry.startDate || entry.endDate) ? indexByKey.get(key) : undefined;

    if (existingIdx === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...entry, bullets: [...entry.bullets] });
      continue;
    }

    const target = merged[existingIdx];
    // Keep the fuller title and location, and add only genuinely new bullets.
    if ((entry.title ?? "").length > (target.title ?? "").length) target.title = entry.title;
    if ((entry.location ?? "").length > (target.location ?? "").length) target.location = entry.location;
    if ((entry.environment ?? "").length > (target.environment ?? "").length) target.environment = entry.environment;
    for (const b of entry.bullets) {
      if (!alreadyPresent(b, target.bullets)) target.bullets.push(b);
    }
    collapsed += 1;
  }

  if (collapsed) {
    console.info(`[resume-formatting] merged ${collapsed} duplicate role entr(ies)`);
  }
  return { ...model, experience: merged };
}

/**
 * Pick the model entry corresponding to a source job block.
 *
 * Scored rather than first-match: resumes routinely list the same client across
 * several separate engagements, so a company name on its own identifies the
 * wrong one. Dates break the tie, and a weak match is refused outright —
 * attaching one employer's responsibilities to another is worse than leaving
 * them where the extraction put them.
 */
function matchIndex(job: SourceJob, model: ResumeModel, usedIndexes: Set<number>): number {
  const header = normalize(job.header);
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < model.experience.length; i++) {
    if (usedIndexes.has(i)) continue;
    const e = model.experience[i];
    let score = 0;

    const company = normalize(e.company ?? "");
    if (company && company.length > 2 && header.includes(company)) score += 3;

    const title = normalize(e.title ?? "");
    if (title && title.length > 3 && header.includes(title)) score += 1;

    for (const d of [e.startDate, e.endDate]) {
      const date = normalize(d ?? "");
      if (date && date.length > 2 && header.includes(date)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Needs a company or a date agreement; a job title alone is too weak.
  return bestScore >= 2 ? bestIdx : -1;
}

export function repairExperienceBullets(model: ResumeModel, experienceText: string): ResumeModel {
  const jobs = splitSourceJobs(experienceText);
  if (!jobs.length) return model;

  const experience = model.experience.map((e) => ({ ...e, bullets: [...e.bullets] }));
  const used = new Set<number>();
  let restored = 0;

  const companies = experience.map((e) => normalize(e.company ?? "")).filter(Boolean);
  const hasRepeatedEmployer = new Set(companies).size !== companies.length;

  jobs.forEach((job, jobIdx) => {
    if (!job.bullets.length) return;

    let idx = matchIndex(job, { ...model, experience }, used);
    // Positional pairing only when the two lists correspond one-for-one AND no
    // employer is listed twice; otherwise position says nothing about identity.
    if (idx === -1 && jobs.length === experience.length && !used.has(jobIdx) && !hasRepeatedEmployer) {
      idx = jobIdx;
    }
    if (idx === -1 || !experience[idx]) return;
    used.add(idx);

    const target = experience[idx];
    const missing = job.bullets.filter((b) => !alreadyPresent(b, target.bullets));
    if (!missing.length) return;

    // Re-insert in source order so the role still reads correctly.
    const ordered: string[] = [];
    for (const b of job.bullets) {
      const existing = target.bullets.find((e) => alreadyPresent(b, [e]));
      ordered.push(existing ?? b);
    }
    // Keep anything the model produced that has no source counterpart.
    for (const b of target.bullets) if (!ordered.includes(b)) ordered.push(b);

    restored += missing.length;
    target.bullets = ordered;
  });

  if (restored) {
    console.info(`[resume-formatting] restored ${restored} bullet(s) dropped during extraction`);
  }

  return { ...model, experience };
}

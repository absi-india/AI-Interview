import type { ResumeModel } from "./types";

/**
 * At-a-glance summary for a recruiter, computed from the extracted resume so a
 * reviewer does not have to read the whole document. Everything here is derived
 * from the candidate's own content — nothing is invented.
 */

export interface EmploymentGap {
  afterCompany: string;
  beforeCompany: string;
  months: number;
}

export interface RecruiterSnapshot {
  totalYears: number | null;
  currentTitle: string;
  currentCompany: string;
  companyCount: number;
  /** Most recent employers first. */
  companies: string[];
  averageTenureMonths: number | null;
  gaps: EmploymentGap[];
  topSkills: string[];
  projectCount: number;
  educationSummary: string[];
  certificationCount: number;
  certifications: string[];
  location: string;
  /** True when dates were too unclear to compute tenure reliably. */
  datesIncomplete: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse loose resume dates: "June 2025", "Jun 2025", "06/2025", "2025". */
export function parseResumeDate(value: string | undefined): Date | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/^(present|current|to date|now|till date|ongoing)$/.test(v)) return new Date();

  const monthName = v.match(/([a-z]{3,9})[a-z.]*\s+(\d{4})/);
  if (monthName) {
    const m = MONTHS[monthName[1].slice(0, 3)];
    if (m !== undefined) return new Date(Number(monthName[2]), m, 1);
  }
  const numeric = v.match(/(\d{1,2})[/-](\d{4})/);
  if (numeric) {
    const m = Number(numeric[1]) - 1;
    if (m >= 0 && m <= 11) return new Date(Number(numeric[2]), m, 1);
  }
  const yearOnly = v.match(/\b(19|20)\d{2}\b/);
  if (yearOnly) return new Date(Number(yearOnly[0]), 0, 1);
  return null;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function isPresent(value: string | undefined): boolean {
  return /present|current|to date|now|till date|ongoing/i.test(value ?? "");
}

export function buildSnapshot(model: ResumeModel): RecruiterSnapshot {
  const ranges: { start: Date; end: Date; company: string }[] = [];
  let datesIncomplete = false;

  for (const e of model.experience) {
    const start = parseResumeDate(e.startDate);
    const end = isPresent(e.endDate) ? new Date() : parseResumeDate(e.endDate);
    if (start && end && end >= start) {
      ranges.push({ start, end, company: e.company || e.title || "Unknown" });
    } else if (e.company || e.title) {
      datesIncomplete = true;
    }
  }

  ranges.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Total experience from merged ranges, so overlapping roles are not counted twice.
  let totalMonths = 0;
  let cursorStart: Date | null = null;
  let cursorEnd: Date | null = null;
  for (const r of ranges) {
    if (!cursorStart || !cursorEnd) {
      cursorStart = r.start;
      cursorEnd = r.end;
      continue;
    }
    if (r.start <= cursorEnd) {
      if (r.end > cursorEnd) cursorEnd = r.end;
    } else {
      totalMonths += monthsBetween(cursorStart, cursorEnd);
      cursorStart = r.start;
      cursorEnd = r.end;
    }
  }
  if (cursorStart && cursorEnd) totalMonths += monthsBetween(cursorStart, cursorEnd);

  // Gaps of six months or more between consecutive roles.
  const gaps: EmploymentGap[] = [];
  for (let i = 1; i < ranges.length; i++) {
    const prevEnd = ranges[i - 1].end;
    const nextStart = ranges[i].start;
    const months = monthsBetween(prevEnd, nextStart);
    if (months >= 6) {
      gaps.push({ afterCompany: ranges[i - 1].company, beforeCompany: ranges[i].company, months });
    }
  }

  const current = model.experience.find((e) => isPresent(e.endDate)) ?? model.experience[0];
  const companies = model.experience.map((e) => e.company).filter(Boolean) as string[];

  const topSkills: string[] = [];
  for (const group of model.skills) {
    for (const s of group.skills) {
      if (topSkills.length >= 12) break;
      if (!topSkills.includes(s)) topSkills.push(s);
    }
  }

  const educationSummary = model.education
    .map((e) => [e.degree, e.areaOfStudy].filter(Boolean).join(" ") || e.school || "")
    .filter(Boolean);

  return {
    totalYears: ranges.length ? Math.round((totalMonths / 12) * 10) / 10 : null,
    currentTitle: current?.title ?? "",
    currentCompany: current?.company ?? "",
    companyCount: companies.length,
    companies,
    averageTenureMonths: ranges.length ? Math.round(totalMonths / ranges.length) : null,
    gaps,
    topSkills,
    projectCount: model.projects.length,
    educationSummary,
    certificationCount: model.certifications.length,
    certifications: model.certifications.map((c) => c.name),
    location: model.contact.location ?? "",
    datesIncomplete,
  };
}

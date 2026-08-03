import "server-only";

import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { chunkText, segmentResume } from "./segment";
import {
  emptyResumeModel,
  type AnalyzeResult,
  type ClarifyQuestion,
  type QualityScores,
  type ResumeModel,
  type Suggestion,
  type SuggestionType,
} from "./types";

const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
// Effectively the whole document: long resumes used to be cut off at 16k chars,
// which silently discarded everything past roughly page three.
const MAX_INPUT_CHARS = 120_000;
/** Per-request slice of a long section, small enough to echo back in full. */
const CHUNK_CHARS = 6_000;
const MAX_OUTPUT_TOKENS = 8_000;

function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (key.includes("...")) return null;
  if (key.toLowerCase().includes("your-")) return null;
  if (key.toLowerCase().includes("replace")) return null;
  return key;
}

const SUGGESTION_TYPES: SuggestionType[] = [
  "spelling",
  "grammar",
  "professional-wording",
  "clarity",
  "ats",
  "formatting",
  "date-inconsistency",
  "duplicate",
  "missing-info",
];

const RULES = `ABSOLUTE RULES:
1. Never invent candidate information. Only use facts present in the provided resume text.
2. Never add employers, job titles, employment dates, degrees, certifications, skills, technologies, projects, achievements, responsibilities, or contact details that are not in the text.
3. Preserve the original meaning of every sentence.
4. Never silently rewrite content — improvements are returned as suggestions for the user to approve.
5. When information is missing, unclear, or conflicting, raise a clarification question instead of guessing.`;

/**
 * Pass 1 — structure only. Kept free of suggestions so the response stays small
 * and the editor can open quickly; the review pass runs separately.
 */
const STRUCTURE_PROMPT = `You are a resume-formatting assistant for a staffing company. You reorganize resumes WITHOUT inventing anything.

${RULES}

You are given ONE SECTION of a resume at a time. Extract only what appears in the text you are given, and leave every other field empty. Extract EVERY entry and EVERY bullet present — never summarise, merge, shorten or drop any of them.

Return ONE JSON object with exactly these keys: "model", "clarifications", "scores".

"model" is the faithfully extracted resume with this shape:
{
  "name": string, "title": string, "requisitionNumber": string, "summary": string, "summaryBullets": [string],
  "contact": { "location": string, "phone": string, "email": string, "linkedin": string, "website": string },
  "skills": [ { "category": string, "skills": [string] } ],
  "experience": [ { "company": string, "location": string, "startDate": string, "endDate": string, "title": string, "bullets": [string], "environment": string } ],
  "education": [ { "degree": string, "areaOfStudy": string, "school": string, "location": string, "awarded": string, "date": string } ],
  "certifications": [ { "name": string, "issuer": string, "date": string } ],
  "projects": [ { "name": string, "description": string, "bullets": [string] } ],
  "additional": string
}
Use empty string "" or [] for anything not present. Copy every bullet VERBATIM and in full — do not improve, shorten, truncate or omit any of them. If the professional summary is written as bullets, put each one in "summaryBullets" rather than flattening them into "summary".

"clarifications" is an array of at most 12 questions for missing/unclear/conflicting info:
{ "question": string, "field": dotted hint like "contact.location" or "experience[0].endDate" }

"scores" is: { "overall", "grammar", "spelling", "ats", "readability", "formatting", "professional" } — each an integer 0-100 estimating current quality. These are estimates, not guarantees.

Return only the JSON object.`;

/** Pass 2 — the review, returning only suggested wording changes. */
const REVIEW_PROMPT = `You are reviewing a resume for a staffing company.

${RULES}

Return ONE JSON object with a single key "suggestions": an array of at most 20 items:
{ "type": one of ${SUGGESTION_TYPES.map((t) => `"${t}"`).join(", ")},
  "section": string (e.g. "Professional Experience"),
  "original": exact substring copied verbatim from the resume text,
  "suggested": improved version preserving the original meaning,
  "reason": short explanation }

Focus on the highest-value issues: spelling, grammar, weak/unclear/overly-long sentences, weak action verbs, repeated responsibilities, inconsistent verb tense, ATS wording, inconsistent date formats. "original" MUST appear verbatim in the resume text so it can be located. Prefer 10-20 strong suggestions over many trivial ones.

Return only the JSON object.`;

function toStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function toArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function toStrArr(v: unknown): string[] {
  return toArr(v)
    .map((x) => toStr(x))
    .filter(Boolean);
}
function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeModel(raw: unknown): ResumeModel {
  const r = (raw ?? {}) as Record<string, unknown>;
  const contact = (r.contact ?? {}) as Record<string, unknown>;
  return {
    name: toStr(r.name),
    title: toStr(r.title),
    requisitionNumber: toStr(r.requisitionNumber),
    summary: toStr(r.summary),
    summaryBullets: toStrArr(r.summaryBullets),
    contact: {
      location: toStr(contact.location),
      phone: toStr(contact.phone),
      email: toStr(contact.email),
      linkedin: toStr(contact.linkedin),
      website: toStr(contact.website),
    },
    skills: toArr(r.skills).map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return { category: toStr(o.category), skills: toStrArr(o.skills) };
    }).filter((s) => s.category || s.skills.length),
    experience: toArr(r.experience).map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return {
        company: toStr(o.company),
        location: toStr(o.location),
        startDate: toStr(o.startDate),
        endDate: toStr(o.endDate),
        title: toStr(o.title),
        bullets: toStrArr(o.bullets),
        environment: toStr(o.environment),
      };
    }).filter((e) => e.company || e.title || e.bullets.length),
    education: toArr(r.education).map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return {
        degree: toStr(o.degree),
        areaOfStudy: toStr(o.areaOfStudy),
        school: toStr(o.school),
        location: toStr(o.location),
        awarded: toStr(o.awarded),
        date: toStr(o.date),
      };
    }).filter((e) => e.degree || e.areaOfStudy || e.school),
    certifications: toArr(r.certifications).map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { name: toStr(o.name), issuer: toStr(o.issuer), date: toStr(o.date) };
    }).filter((c) => c.name),
    projects: toArr(r.projects).map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { name: toStr(o.name), description: toStr(o.description), bullets: toStrArr(o.bullets) };
    }).filter((p) => p.name || p.description),
    additional: toStr(r.additional),
  };
}

function normalizeSuggestions(raw: unknown): Suggestion[] {
  return toArr(raw)
    .map((s): Suggestion | null => {
      const o = (s ?? {}) as Record<string, unknown>;
      const original = toStr(o.original);
      const suggested = toStr(o.suggested);
      if (!original || !suggested || original === suggested) return null;
      const type = SUGGESTION_TYPES.includes(o.type as SuggestionType)
        ? (o.type as SuggestionType)
        : "professional-wording";
      return {
        id: randomUUID(),
        type,
        section: toStr(o.section) || "Resume",
        original,
        suggested,
        reason: toStr(o.reason) || "Improves clarity and professionalism while preserving meaning.",
        status: "pending",
      };
    })
    .filter((s): s is Suggestion => s !== null)
    .slice(0, 20);
}

function normalizeClarifications(raw: unknown): ClarifyQuestion[] {
  return toArr(raw)
    .map((c): ClarifyQuestion | null => {
      const o = (c ?? {}) as Record<string, unknown>;
      const question = toStr(o.question);
      if (!question) return null;
      return { id: randomUUID(), question, field: toStr(o.field) };
    })
    .filter((c): c is ClarifyQuestion => c !== null)
    .slice(0, 20);
}

function normalizeScores(raw: unknown): QualityScores {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    overall: clampScore(o.overall),
    grammar: clampScore(o.grammar),
    spelling: clampScore(o.spelling),
    ats: clampScore(o.ats),
    readability: clampScore(o.readability),
    formatting: clampScore(o.formatting),
    professional: clampScore(o.professional),
  };
}

/** Fallback when AI is unavailable: keep the raw text so the user can still edit/export. */
function fallbackResult(rawText: string, fileName: string): AnalyzeResult {
  const model = emptyResumeModel();
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  model.name = lines[0] ?? "";
  model.summary = rawText.slice(0, 1200);
  return {
    model,
    suggestions: [],
    clarifications: [
      {
        id: randomUUID(),
        question:
          "Automatic AI analysis is unavailable right now. Please review the extracted text and fill in the resume sections manually before exporting.",
        field: "",
      },
    ],
    rawText,
    scores: { overall: 0, grammar: 0, spelling: 0, ats: 0, readability: 0, formatting: 0, professional: 0 },
    fileName,
  };
}

async function callJson(system: string, user: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");
  const client = new OpenAI({ apiKey, timeout: timeoutMs });
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    // Without an explicit ceiling the JSON gets cut off mid-document and the
    // tail of the resume is lost.
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
}

/** Merge a partial model from one chunk into the accumulating result. */
function mergeModel(base: ResumeModel, add: ResumeModel): ResumeModel {
  return {
    name: base.name || add.name,
    title: base.title || add.title,
    requisitionNumber: base.requisitionNumber || add.requisitionNumber,
    summary: base.summary || add.summary,
    summaryBullets: [...(base.summaryBullets ?? []), ...(add.summaryBullets ?? [])],
    contact: {
      location: base.contact.location || add.contact.location,
      phone: base.contact.phone || add.contact.phone,
      email: base.contact.email || add.contact.email,
      linkedin: base.contact.linkedin || add.contact.linkedin,
      website: base.contact.website || add.contact.website,
    },
    skills: [...base.skills, ...add.skills],
    experience: [...base.experience, ...add.experience],
    education: [...base.education, ...add.education],
    certifications: [...base.certifications, ...add.certifications],
    projects: [...base.projects, ...add.projects],
    additional: [base.additional, add.additional].filter(Boolean).join("\n").trim(),
  };
}

/**
 * Pass 1: extract the structured resume.
 *
 * The resume is segmented and each part sent as its own small request, run in
 * parallel. Previously one request carried the whole document, so anything past
 * the input cap or the model's output limit was silently lost — on a six-page
 * resume that was most of it.
 */
export async function analyzeResume(rawText: string, fileName: string): Promise<AnalyzeResult> {
  const text = rawText.slice(0, MAX_INPUT_CHARS);
  if (!getOpenAiApiKey() || !text.trim()) return fallbackResult(rawText, fileName);

  const seg = segmentResume(text);

  // Head/summary/skills are small and always sent together; the bulky sections
  // are chunked so no single request has to echo back too much.
  const profileText = [seg.head, seg.summary && `PROFESSIONAL SUMMARY\n${seg.summary}`, seg.skills && `TECHNICAL SKILLS\n${seg.skills}`]
    .filter(Boolean)
    .join("\n\n");
  const qualsText = [
    seg.education && `EDUCATION\n${seg.education}`,
    seg.certifications && `CERTIFICATIONS\n${seg.certifications}`,
    seg.projects && `PROJECTS\n${seg.projects}`,
    seg.additional && `ADDITIONAL INFORMATION\n${seg.additional}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const jobs: { label: string; body: string }[] = [
    ...(profileText ? [{ label: "PROFILE", body: profileText }] : []),
    ...chunkText(seg.experience, CHUNK_CHARS).map((c) => ({ label: "PROFESSIONAL EXPERIENCE", body: c })),
    ...(qualsText ? [{ label: "QUALIFICATIONS", body: qualsText }] : []),
  ];

  // Nothing recognised (unusual layout) — fall back to one request over all text.
  if (!jobs.length) jobs.push({ label: "RESUME", body: text });

  try {
    const parts = await Promise.all(
      jobs.map(async ({ label, body }) => {
        try {
          const parsed = await callJson(
            STRUCTURE_PROMPT,
            `SECTION: ${label}\nRESUME TEXT:\n"""\n${body}\n"""`,
            50_000,
          );
          return parsed;
        } catch (err) {
          console.warn("[resume-formatting] chunk failed", label, err);
          return null;
        }
      }),
    );

    let model = emptyResumeModel();
    const clarifications: ClarifyQuestion[] = [];
    const scoreSets: QualityScores[] = [];

    for (const parsed of parts) {
      if (!parsed) continue;
      model = mergeModel(model, normalizeModel(parsed.model));
      clarifications.push(...normalizeClarifications(parsed.clarifications));
      const s = normalizeScores(parsed.scores);
      if (s.overall) scoreSets.push(s);
    }

    // Nothing came back at all — keep the text rather than showing an empty resume.
    if (!model.name && !model.experience.length && !model.summary && !model.summaryBullets?.length) {
      return fallbackResult(rawText, fileName);
    }

    const avg = (pick: (s: QualityScores) => number) =>
      scoreSets.length ? Math.round(scoreSets.reduce((a, s) => a + pick(s), 0) / scoreSets.length) : 0;

    return {
      model,
      suggestions: [],
      clarifications: clarifications.slice(0, 20),
      rawText,
      scores: {
        overall: avg((s) => s.overall),
        grammar: avg((s) => s.grammar),
        spelling: avg((s) => s.spelling),
        ats: avg((s) => s.ats),
        readability: avg((s) => s.readability),
        formatting: avg((s) => s.formatting),
        professional: avg((s) => s.professional),
      },
      fileName,
    };
  } catch (err) {
    console.warn("[resume-formatting] structure pass failed, using fallback", err);
    return fallbackResult(rawText, fileName);
  }
}

/** Pass 2: the wording review. Failure here is non-fatal — the editor still works. */
export async function reviewResume(rawText: string): Promise<Suggestion[]> {
  const trimmed = rawText.slice(0, MAX_INPUT_CHARS);
  if (!getOpenAiApiKey() || !trimmed) return [];

  try {
    const parsed = await callJson(REVIEW_PROMPT, `RESUME TEXT:\n"""\n${trimmed}\n"""`, 55_000);
    return normalizeSuggestions(parsed.suggestions);
  } catch (err) {
    console.warn("[resume-formatting] review pass failed", err);
    return [];
  }
}

/**
 * Deterministic pre-segmentation of resume text.
 *
 * The AI used to receive the whole resume in one request and echo it back, which
 * meant long resumes lost everything past the input cap or the output limit.
 * Splitting the text here keeps each AI request small, so every part of the
 * resume gets processed and nothing is silently dropped.
 */

/** Marker prefixed to every list item so bullet boundaries survive extraction. */
export const BULLET_MARK = "• ";

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Flatten converted DOCX HTML into lines, marking list items.
 *
 * Raw text extraction cannot tell a list item from a paragraph, so a role's
 * bullets arrive as anonymous lines and get merged or dropped later. Keeping
 * the <li> boundaries makes every bullet individually identifiable.
 */
export function htmlToMarkedLines(html: string): string[] {
  const lines: string[] = [];
  const blockRe = /<(p|li|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const text = decodeEntities(m[2]);
    if (!text) continue;
    lines.push(tag === "li" ? `${BULLET_MARK}${text}` : text);
  }
  return lines;
}

/** A job as it appears in the source text, used to guarantee no bullet is lost. */
export interface SourceJob {
  header: string;
  bullets: string[];
}

/** "Mar 2023 – Jul 2024", "2018 - Present", "Feb 2018 — Aug 2019". */
const DATE_RANGE =
  /(?:[A-Za-z]{3,9}\.?\s+)?(?:19|20)\d{2}\s*(?:[–—]|-{1,2}|\bto\b)\s*(?:(?:[A-Za-z]{3,9}\.?\s+)?(?:19|20)\d{2}|present|current|till\s*date|to\s*date|now|ongoing)/i;

/**
 * Split the experience section into the jobs actually present in the source.
 * A new job begins at any non-bullet line carrying a date range.
 */
export function splitSourceJobs(experienceText: string): SourceJob[] {
  const jobs: SourceJob[] = [];
  let current: SourceJob | null = null;

  for (const raw of experienceText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = line.startsWith(BULLET_MARK.trim());

    if (!isBullet && DATE_RANGE.test(line)) {
      current = { header: line, bullets: [] };
      jobs.push(current);
      continue;
    }
    if (!current) continue;
    if (isBullet) {
      const text = line.replace(/^[•\-*•●▪]\s*/, "").trim();
      if (text) current.bullets.push(text);
    }
  }

  return jobs;
}

export interface ResumeSegments {
  /** Everything before the first recognised section heading (name, contact, title). */
  head: string;
  summary: string;
  skills: string;
  experience: string;
  education: string;
  certifications: string;
  projects: string;
  additional: string;
}

type SegmentKey = Exclude<keyof ResumeSegments, "head">;

// Heading patterns, longest/most specific first.
const HEADING_PATTERNS: { key: SegmentKey; re: RegExp }[] = [
  { key: "summary", re: /^(professional\s+summary|career\s+summary|executive\s+summary|summary\s+of\s+qualifications|profile|summary|objective)\s*:?\s*$/i },
  { key: "skills", re: /^(technical\s+skills?|core\s+competenc(?:y|ies)|skill\s*set|skills?\s*(&|and)\s*(tools|technologies)|technical\s+expertise|areas\s+of\s+expertise|skills?)\s*:?\s*$/i },
  { key: "experience", re: /^(professional\s+experience|work\s+experience|employment\s+history|work\s+history|experience|professional\s+background|relevant\s+experience)\s*:?\s*$/i },
  { key: "education", re: /^(education(\s*(&|and)\s*certifications?)?|academic\s+background|academics?|educational\s+qualifications?)\s*:?\s*$/i },
  { key: "certifications", re: /^(certifications?|licenses?\s*(&|and)\s*certifications?|professional\s+certifications?)\s*:?\s*$/i },
  { key: "projects", re: /^(projects?|key\s+projects?|selected\s+projects?|project\s+experience)\s*:?\s*$/i },
  { key: "additional", re: /^(additional\s+information|other\s+information|miscellaneous|interests|awards?|publications?|languages?)\s*:?\s*$/i },
];

function matchHeading(line: string): SegmentKey | null {
  const cleaned = line.trim().replace(/[_*]+/g, "").trim();
  // Headings are short; a long line that merely starts with the word is body text.
  if (!cleaned || cleaned.length > 60) return null;
  for (const { key, re } of HEADING_PATTERNS) {
    if (re.test(cleaned)) return key;
  }
  return null;
}

export function segmentResume(rawText: string): ResumeSegments {
  const segments: ResumeSegments = {
    head: "",
    summary: "",
    skills: "",
    experience: "",
    education: "",
    certifications: "",
    projects: "",
    additional: "",
  };

  const lines = rawText.split(/\r?\n/);
  let current: SegmentKey | "head" = "head";
  const buckets: Record<string, string[]> = {};

  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      current = heading;
      // Education & Certifications often share one heading; keep the text in
      // education and let the extractor pull certifications out of it.
      continue;
    }
    (buckets[current] ??= []).push(line);
  }

  for (const [key, value] of Object.entries(buckets)) {
    segments[key as keyof ResumeSegments] = value.join("\n").trim();
  }

  return segments;
}

/**
 * Split a long section into chunks at blank-line boundaries so each AI request
 * stays small. Never splits mid-line, so no sentence is cut in half.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const blocks = trimmed.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buf = "";

  const pushBuf = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const block of blocks) {
    if (block.length > maxChars) {
      // A single huge block: fall back to splitting on line boundaries.
      pushBuf();
      let lineBuf = "";
      for (const line of block.split(/\r?\n/)) {
        if (lineBuf.length + line.length + 1 > maxChars && lineBuf) {
          chunks.push(lineBuf.trim());
          lineBuf = "";
        }
        lineBuf += (lineBuf ? "\n" : "") + line;
      }
      if (lineBuf.trim()) chunks.push(lineBuf.trim());
      continue;
    }
    if (buf.length + block.length + 2 > maxChars && buf) pushBuf();
    buf += (buf ? "\n\n" : "") + block;
  }
  pushBuf();

  return chunks;
}

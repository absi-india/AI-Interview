/**
 * Deterministic pre-segmentation of resume text.
 *
 * The AI used to receive the whole resume in one request and echo it back, which
 * meant long resumes lost everything past the input cap or the output limit.
 * Splitting the text here keeps each AI request small, so every part of the
 * resume gets processed and nothing is silently dropped.
 */

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

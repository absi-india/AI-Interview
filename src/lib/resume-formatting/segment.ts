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

/**
 * Prefix identifying a chunk that continues the role named after it, rather
 * than starting a new one. Repeating a role's header verbatim across chunks
 * caused each piece to be read as a separate employer.
 */
export const CONTINUATION_MARK = "[CONTINUES THE SAME ROLE] ";

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
  // Tables are matched first and consumed whole, so their cells are not also
  // picked up as loose paragraphs. Resumes often hold the entire project list
  // in a table, where a row's date, client and role must stay on one line.
  const blockRe = /<table\b[\s\S]*?<\/table>|<(p|li|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(html)) !== null) {
    if (m[0].toLowerCase().startsWith("<table")) {
      const table = m[0];
      const rows: string[][] = [];
      const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let r: RegExpExecArray | null;
      while ((r = rowRe.exec(table)) !== null) {
        const cells: string[] = [];
        const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let c: RegExpExecArray | null;
        while ((c = cellRe.exec(r[1])) !== null) cells.push(c[1]);
        if (cells.length) rows.push(cells);
      }

      // Word is also used to lay a whole resume out inside a table. Flattening
      // that would destroy its lists and paragraphs, so a table is only treated
      // as data when its rows are genuinely tabular: several cells, none of
      // which carries list markup.
      const isLayout =
        !rows.length ||
        rows.every((cells) => cells.length < 2) ||
        /<(ul|ol|li)\b/i.test(table);

      if (isLayout) {
        lines.push(...htmlToMarkedLines(rows.flat().join("\n")));
      } else {
        for (const cells of rows) {
          const texts = cells
            .map((cell) => decodeEntities(cell.replace(/<\/p>\s*<p[^>]*>/gi, " ")))
            .filter(Boolean);
          if (texts.length) lines.push(texts.join("  |  "));
        }
      }
      continue;
    }

    const tag = (m[1] ?? "").toLowerCase();
    const text = decodeEntities(m[2] ?? "");
    if (!text) continue;
    lines.push(tag === "li" ? `${BULLET_MARK}${text}` : text);
  }
  return lines;
}

/**
 * Split a bullet into its lead-in label and the rest, e.g.
 * "Payments Modernization: Architected …". Resumes use the label as a scannable
 * heading, so it is emboldened as in the source. A colon appearing late, or
 * after sentence punctuation, is ordinary prose and left alone.
 */
export function splitBulletLabel(text: string): { label: string; rest: string } | null {
  const idx = text.indexOf(":");
  if (idx < 2 || idx > 70) return null;
  const lead = text.slice(0, idx);
  if (/[.!?]/.test(lead)) return null;
  const rest = text.slice(idx + 1);
  if (!rest.trim()) return null;
  return { label: text.slice(0, idx + 1), rest };
}

/** A job as it appears in the source text, used to guarantee no bullet is lost. */
export interface SourceJob {
  header: string;
  bullets: string[];
}

// A year is either four digits or an apostrophe form: 2024, '07, ’99.
// Word autocorrects apostrophes to curly quotes, and which one it picks varies:
// "Aug ’21 – Apr ‘22" carries both. Missing one merges two roles into one.
const YEAR = String.raw`(?:(?:19|20)\d{2}|['’‘]\s?\d{2})`;
const MONTH = String.raw`(?:[A-Za-z]{3,9}\.?\s*)?`;
const OPEN_END = String.raw`(?:present|current|till\s*date|to\s*date|now|ongoing)`;
/**
 * "Mar 2023 – Jul 2024", "2018 - Present", "Jun'07 – Jan'09".
 * The apostrophe form matters: resumes using it were not being recognised as
 * new roles at all, so their bullets accumulated under the previous employer.
 */
const DATE_RANGE = new RegExp(
  `${MONTH}${YEAR}\\s*(?:[–—]|-{1,2}|\\bto\\b)\\s*(?:${MONTH}${YEAR}|${OPEN_END})`,
  "i",
);

/** True when a line looks like the start of a role rather than body text. */
function isJobHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith(BULLET_MARK.trim())) return false;
  // Table rows carrying a role can be long; prose paragraphs are longer still.
  if (t.length > 200) return false;
  return DATE_RANGE.test(t);
}

/**
 * Where a role actually begins.
 *
 * Many resumes put the employer on its own line and the job title with the
 * dates on the next:
 *
 *   BCBS, Jacksonville - FL (Remote)
 *   Salesforce Technical Architect/Developer - L4        Apr '22 - Present
 *
 * Anchoring on the date alone leaves the employer behind, and the role then
 * takes its name from a word in the title — inventing an employer the candidate
 * never worked for. The plain line immediately above is taken as part of the
 * header when it looks like a company rather than prose or another role.
 */
function roleStartIndex(lines: string[], dateLineIdx: number): number {
  const prev = lines[dateLineIdx - 1]?.trim();
  if (!prev) return dateLineIdx;
  if (prev.startsWith(BULLET_MARK.trim())) return dateLineIdx;
  if (DATE_RANGE.test(prev)) return dateLineIdx; // already a role header of its own
  if (prev.length > 90) return dateLineIdx; // a sentence, not a company line
  if (/[.!?]$/.test(prev)) return dateLineIdx; // prose
  return dateLineIdx - 1;
}

/**
 * Chunk the experience section on role boundaries.
 *
 * Splitting on blank lines could cut a role in half, leaving a chunk that opens
 * with bullets and no employer. Those bullets were then attributed to whichever
 * company happened to be in view, which is how one client's responsibilities
 * ended up filed under another. Roles are kept whole; a role too large for one
 * chunk is split with its header repeated so the employer is never in doubt.
 */
export function chunkExperienceByJob(experienceText: string, maxChars: number): string[] {
  const text = experienceText.trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const lines = text.split(/\r?\n/);
  const blocks: { header: string; lines: string[] }[] = [];
  let current: { header: string; lines: string[] } | null = null;
  let consumedIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === consumedIdx) continue;

    if (isJobHeader(line)) {
      const start = roleStartIndex(lines, i);
      // Begin the role at its employer line so the chunk carries the company,
      // not just the title and dates.
      const headerLines = start < i ? [lines[start], line] : [line];
      if (start < i && current) current.lines.pop(); // it belonged here, not above
      current = { header: headerLines.map((l) => l.trim()).join(" — "), lines: [...headerLines] };
      blocks.push(current);
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      // Preamble before the first role.
      if (!blocks.length) blocks.push({ header: "", lines: [] });
      blocks[0].lines.push(line);
    }
  }

  const chunks: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const joined = buf.join("\n").trim();
    if (joined) chunks.push(joined);
    buf = [];
  };

  for (const block of blocks) {
    const body = block.lines.join("\n");
    if (body.length > maxChars) {
      flush();
      // An oversized role has to be split, but repeating its header verbatim
      // made each piece read as a fresh role, inventing employers that do not
      // exist. Continuation pieces are labelled instead, so the extractor knows
      // the bullets belong to the role already described.
      const headerLineCount = block.header && block.lines.length ? (block.header.includes(" — ") ? 2 : 1) : 0;
      const headerLines = block.lines.slice(0, headerLineCount);
      const contMarker = `${CONTINUATION_MARK}${block.header}`;
      let piece: string[] = [...headerLines];
      let size = piece.join("\n").length;
      let first = true;

      for (const line of block.lines.slice(headerLineCount)) {
        if (size + line.length + 1 > maxChars && piece.length > (first ? headerLineCount : 1)) {
          chunks.push(piece.join("\n").trim());
          first = false;
          piece = [contMarker];
          size = contMarker.length;
        }
        piece.push(line);
        size += line.length + 1;
      }
      if (piece.length > (first ? headerLineCount : 1)) chunks.push(piece.join("\n").trim());
      continue;
    }
    if (buf.join("\n").length + body.length + 1 > maxChars && buf.length) flush();
    buf.push(body);
  }
  flush();

  return chunks.filter(Boolean);
}

/**
 * Split the experience section into the jobs actually present in the source.
 * A new job begins at any non-bullet line carrying a date range.
 */
export function splitSourceJobs(experienceText: string): SourceJob[] {
  const lines = experienceText.split(/\r?\n/);
  const jobs: SourceJob[] = [];
  let current: SourceJob | null = null;
  // Set when the preceding line has been absorbed as the employer, so it is
  // not then also read as body text.
  let consumedIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || i === consumedIdx) continue;
    const isBullet = line.startsWith(BULLET_MARK.trim());

    if (isJobHeader(line)) {
      const start = roleStartIndex(lines, i);
      // Carry the employer line into the header so the role is identified by
      // the company rather than by a word from its job title.
      const header = start < i ? `${lines[start].trim()} ${line}` : line;
      if (start < i && current) {
        // That line was provisionally part of the previous role; take it back.
        current.bullets = current.bullets.filter((b) => b !== lines[start].trim());
      }
      current = { header, bullets: [] };
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

/**
 * Looser second pass for headings that carry extra words or trailing marks —
 * "Skill sets in SAP –", "SAP Project Experience", "Education –". Real resumes
 * rarely use the bare canonical wording, and an unmatched heading used to dump
 * the entire document into one block.
 */
const HEADING_KEYWORDS: { key: SegmentKey; re: RegExp }[] = [
  { key: "certifications", re: /\bcertificat/i },
  { key: "education", re: /\beducation|\bacademic|\bqualifications?\b/i },
  { key: "experience", re: /\b(experience|employment|work\s+history|projects?)\b/i },
  { key: "skills", re: /\bskills?\b|\bcompetenc|\bexpertise\b|\btechnolog(y|ies)\b/i },
  { key: "summary", re: /\bsummary\b|\bprofile\b|\bobjective\b|\bsynopsis\b/i },
  { key: "additional", re: /\badditional\b|\bawards?\b|\bpublications?\b|\blanguages?\b|\binterests\b/i },
];

function matchHeading(line: string): SegmentKey | null {
  const raw = line.trim();
  // Bullets are body text, never headings.
  if (!raw || raw.startsWith(BULLET_MARK.trim())) return null;

  const cleaned = raw.replace(/[_*]+/g, "").trim();
  // Headings are short; a long line that merely contains the word is body text.
  if (!cleaned || cleaned.length > 60) return null;

  for (const { key, re } of HEADING_PATTERNS) {
    if (re.test(cleaned)) return key;
  }

  // Strip trailing separators/colons and any leading numbering before the
  // looser check, so "Education –" and "1. Skills:" still register.
  const stripped = cleaned
    .replace(/^[0-9]+[.)]\s*/, "")
    .replace(/[\s:–—-]+$/, "")
    .trim();
  if (!stripped || stripped.length > 45) return null;
  // A heading is a label, not a sentence.
  if (/[.!?]$/.test(stripped) || stripped.split(/\s+/).length > 6) return null;

  for (const { key, re } of HEADING_KEYWORDS) {
    if (re.test(stripped)) return key;
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

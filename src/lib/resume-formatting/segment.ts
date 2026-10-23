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
 * Glyphs a resume uses to start a list item. A PDF hands back whichever
 * character the document was written with; only DOCX arrives already marked.
 */
const STRONG_BULLET = /^[•·●○◦▪▫‣⁃∙*]\s*/;
/** Dashes also start lists, but can begin an ordinary line, so they are checked. */
const WEAK_BULLET = /^[-–—]\s+/;
/** A second bullet glyph part-way through a line, where a list ran together. */
const INLINE_BULLET = /\s*[•·●○◦▪▫‣⁃∙]\s+/g;

/**
 * Rewrite every list item to start with the same marker.
 *
 * Only the DOCX path produced this marker, because it can see <li> elements. A
 * PDF arrives with whatever glyph the author typed, so nothing downstream
 * recognised its bullets: the guarantee that no bullet is lost (see
 * repair.ts) silently did nothing for PDF uploads, and anything the extraction
 * dropped was dropped for good. Headers are left alone — a line carrying a
 * date range is a role, not a list item, however it begins.
 */
export function normalizeBulletLines(text: string): string {
  const out: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }

    const strong = STRONG_BULLET.test(line);
    // A dash only starts a list when the line is not a role header.
    const weak = !strong && WEAK_BULLET.test(line) && !isJobHeader(line);
    if (!strong && !weak) {
      out.push(line);
      continue;
    }

    const body = line.replace(strong ? STRONG_BULLET : WEAK_BULLET, "");
    // "— EDUCATION" is a decorated section heading, not a list item. Marking it
    // as a bullet would stop it being recognised and fold the whole section
    // into whichever one came before it.
    if (matchHeading(body.trim())) {
      out.push(body.trim());
      continue;
    }
    // Extracted PDFs often run a whole list onto one line, each item divided by
    // the same glyph. Those are separate bullets and have to be split back out,
    // or the entire role arrives as a single unreadable paragraph.
    for (const part of body.split(INLINE_BULLET)) {
      const piece = part.trim();
      if (piece) out.push(`${BULLET_MARK}${piece}`);
    }
  }

  return out.join("\n");
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
 * The employer where it is written *under* the title instead of above it:
 *
 *   Sr. Technical Project Manager            Jan '25 – Till Date
 *   Florida Department of Agriculture and Consumer Services – FL, USA
 *
 * Without taking that line into the header, the role is identified by its
 * dates alone, and matching a role back to the right employer — which is what
 * keeps one company's responsibilities from being filed under another — has
 * almost nothing to go on.
 */
function employerBelowIndex(lines: string[], dateLineIdx: number): number {
  const next = lines[dateLineIdx + 1]?.trim();
  if (!next) return dateLineIdx;
  if (next.startsWith(BULLET_MARK.trim())) return dateLineIdx; // body text
  if (DATE_RANGE.test(next)) return dateLineIdx; // the next role
  if (next.length > 90) return dateLineIdx; // a sentence, not a company line
  if (/[.!?]$/.test(next)) return dateLineIdx; // prose
  return dateLineIdx + 1;
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
  const blocks: { header: string; lines: string[]; headerCount: number }[] = [];
  let current: { header: string; lines: string[]; headerCount: number } | null = null;
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
      if (start === i) {
        // Employer written underneath the title instead of above it. Without
        // it the chunk sent for extraction names no company at all.
        const below = employerBelowIndex(lines, i);
        if (below > i) {
          headerLines.push(lines[below]);
          consumedIdx = below;
        }
      }
      current = {
        header: headerLines.map((l) => l.trim()).join(" — "),
        lines: [...headerLines],
        headerCount: headerLines.length,
      };
      blocks.push(current);
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      // Preamble before the first role.
      if (!blocks.length) blocks.push({ header: "", lines: [], headerCount: 0 });
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
      // Counted when the block was built: a header can be one line, two, or
      // three when the employer sits under the title as well.
      const headerLineCount = block.lines.length ? block.headerCount : 0;
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
      let header = start < i ? `${lines[start].trim()} ${line}` : line;
      if (start < i && current) {
        // That line was provisionally part of the previous role; take it back.
        current.bullets = current.bullets.filter((b) => b !== lines[start].trim());
      }
      if (start === i) {
        // Nothing usable above, so look underneath.
        const below = employerBelowIndex(lines, i);
        if (below > i) {
          header = `${line} ${lines[below].trim()}`;
          consumedIdx = below;
        }
      }
      current = { header, bullets: [] };
      jobs.push(current);
      continue;
    }
    if (!current) continue;

    // Marked or not, a line sitting under a role is that role's work.
    //
    // Only marked lines were collected, and resumes routinely lose the marker
    // on some lines — a paragraph typed without one, or a bullet the
    // conversion flattened. Those lines were invisible here, so they were
    // neither protected from being dropped nor recognised when the extraction
    // filed them under the summary instead. Headings and employer lines have
    // already been taken out above, so what remains is body text.
    const text = isBullet ? line.replace(/^[•\-*●▪]\s*/, "").trim() : line;
    if (text.length > 2) current.bullets.push(text);
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
  // "Career" on its own heads the work history in plenty of resumes. It was
  // missing here, and an unrecognised heading does not merely lose its own
  // name — everything beneath it is filed under whatever came before, so one
  // resume's entire employment history sat outside the experience section and
  // the guarantee that no bullet is lost had nothing to work on.
  { key: "experience", re: /^(professional\s+experience|work\s+experience|employment\s+history|work\s+history|employment|experience|career(\s+(history|profile|details|highlights))?|professional\s+career|professional\s+background|relevant\s+experience)\s*:?\s*$/i },
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

/** Only the exact section names, with none of the looser guessing. */
function exactHeading(line: string): SegmentKey | null {
  const cleaned = line.trim().replace(/[_*]+/g, "").trim();
  if (!cleaned || cleaned.length > 40) return null;
  for (const { key, re } of HEADING_PATTERNS) if (re.test(cleaned)) return key;
  return null;
}

/**
 * Split "Summary<tab>PMP-certified project manager with 18 years…" into the
 * heading and the text beneath it.
 *
 * Word's two-column layouts put the section name in the left cell and the
 * section itself in the right, and extraction returns them as a single line.
 * That line is far too long to read as a heading, so the section is never
 * recognised and everything below it is filed under whatever came before.
 *
 * Only the exact section names are split this way. A skills line reading
 * "Project Management: Agile, Waterfall" must stay as it is — splitting on any
 * label that happened to contain a section word would invent headings in the
 * middle of a list.
 */
function splitLabelledSections(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z&/ ]{3,40}?)\s*(?:[:|]|\t| {2,})\s*(\S.*)$/);
    const label = m?.[1]?.trim();
    const key = label ? exactHeading(label) : null;
    // "Project: Medicaid MMIS Modernization" names the engagement a role was
    // delivered under, not a Projects section. Splitting it started a new
    // section in the middle of the work history and sent every role after it
    // out of the experience section. A standalone "Projects" line is still
    // read as a heading in the ordinary way; only this rewrite declines it.
    if (m && label && key && key !== "projects") {
      out.push(label, m[2].trim());
      continue;
    }
    out.push(line);
  }
  return out;
}

function matchHeading(line: string, allowLoose = true): SegmentKey | null {
  const raw = line.trim();
  // Bullets are body text, never headings.
  if (!raw || raw.startsWith(BULLET_MARK.trim())) return null;

  const cleaned = raw.replace(/[_*]+/g, "").trim();
  // Headings are short; a long line that merely contains the word is body text.
  if (!cleaned || cleaned.length > 60) return null;

  for (const { key, re } of HEADING_PATTERNS) {
    if (re.test(cleaned)) return key;
  }

  if (!allowLoose) return null;

  // Strip trailing separators/colons and any leading numbering before the
  // looser check, so "Education –" and "1. Skills:" still register.
  const stripped = cleaned
    .replace(/^[0-9]+[.)]\s*/, "")
    .replace(/[\s:–—-]+$/, "")
    .trim();
  if (!stripped || stripped.length > 45) return null;
  // A heading is a label, not a sentence.
  if (/[.!?]$/.test(stripped) || stripped.split(/\s+/).length > 6) return null;

  /*
   * The loose check may only fire on something shaped like a label.
   *
   * "Technical Writer/ Technology Policy Analyst" is a job title, but it
   * contains a heading word, so it was being read as the start of the skills
   * section — which ended the experience section at the first role and sent
   * every remaining bullet of the resume into skills. A label announces
   * itself: it ends with a separator, or it is set in capitals, or it is two
   * or three words. A five-word title in sentence case is none of those.
   */
  const words = stripped.split(/\s+/).length;
  const labelShaped =
    /[:–—-]\s*$/.test(cleaned) || stripped === stripped.toUpperCase() || words <= 3;
  if (!labelShaped) return null;

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

  const lines = splitLabelledSections(rawText.split(/\r?\n/));
  let current: SegmentKey | "head" = "head";
  const buckets: Record<string, string[]> = {};

  // The line straight after a role header is that role's job title. Titles
  // carry words like "Technology" and "Projects", and reading one as a section
  // heading ended the experience section at the first role. Only the exact
  // headings are honoured in that position.
  let afterRoleHeader = false;

  for (const line of lines) {
    const heading = matchHeading(line, !afterRoleHeader);
    if (heading) {
      current = heading;
      afterRoleHeader = false;
      // Education & Certifications often share one heading; keep the text in
      // education and let the extractor pull certifications out of it.
      continue;
    }
    if (line.trim()) afterRoleHeader = isJobHeader(line);
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

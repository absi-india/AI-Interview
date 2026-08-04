import "server-only";

import mammoth from "mammoth";
import { htmlToMarkedLines } from "./segment";

/** Uploaded file types we accept for formatting. */
export const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx"] as const;

export function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Mirrors the existing candidate-resume extraction in resumeContext.ts.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Text from the DOCX page headers.
 *
 * Some resumes put the candidate's name and contact details only in the running
 * page header. Mammoth converts the document body alone, so that identity block
 * never arrived and the name came out blank. The header parts are read straight
 * from the package and prepended once, with the repeated page numbering that
 * accompanies them stripped.
 */
async function extractDocxHeaderText(buffer: Buffer): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/i.test(n));
    const seen = new Set<string>();
    const lines: string[] = [];

    for (const name of names.sort()) {
      const xml = await zip.files[name].async("string");
      // Each <w:p> is a line; <w:t> runs hold its text.
      for (const para of xml.split(/<w:p[ >]/).slice(1)) {
        const text = (para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
          .map((t) => t.replace(/<[^>]+>/g, ""))
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) continue;
        if (/^page\b|\bpage \d+ of\b/i.test(text)) continue; // page numbering
        if (seen.has(text)) continue; // repeats on every page
        seen.add(text);
        lines.push(text);
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Extract DOCX text via HTML so that list items stay distinguishable from
 * paragraphs; see htmlToMarkedLines for why that matters.
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const [{ value: html }, headerText] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    extractDocxHeaderText(buffer),
  ]);
  const lines = htmlToMarkedLines(html);

  if (!lines.length) {
    // Unusual document — fall back to raw text rather than returning nothing.
    const raw = await mammoth.extractRawText({ buffer });
    return [headerText, raw.value].filter(Boolean).join("\n").trim();
  }
  return [headerText, lines.join("\n")].filter(Boolean).join("\n").trim();
}

export interface ExtractionResult {
  text: string;
  /** True when we could not extract usable text (e.g. legacy .doc or a scanned PDF). */
  needsManualText: boolean;
}

/**
 * Extract plain text from an uploaded resume.
 * - .docx  → mammoth
 * - .pdf   → pdf-parse
 * - .doc   → not supported by mammoth (legacy binary); returns needsManualText
 * Never throws for unsupported content; the caller asks the user to help instead.
 */
export async function extractResumeText(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractionResult> {
  const ext = getExtension(fileName);

  try {
    if (ext === "pdf") {
      const text = await extractPdfText(buffer);
      const clean = text.trim();
      return { text: clean, needsManualText: clean.length < 30 };
    }

    if (ext === "docx") {
      const clean = await extractDocxText(buffer);
      return { text: clean, needsManualText: clean.length < 30 };
    }

    // Legacy .doc — mammoth cannot parse the old binary format. Try mammoth
    // anyway (some .doc files are actually .docx), then fall back gracefully.
    if (ext === "doc") {
      try {
        const result = await mammoth.extractRawText({ buffer });
        const clean = result.value.trim();
        if (clean.length >= 30) return { text: clean, needsManualText: false };
      } catch {
        // fall through
      }
      return { text: "", needsManualText: true };
    }
  } catch (err) {
    console.warn("[resume-formatting] extraction failed", err);
  }

  return { text: "", needsManualText: true };
}

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
 * Extract DOCX text via HTML so that list items stay distinguishable from
 * paragraphs; see htmlToMarkedLines for why that matters.
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const lines = htmlToMarkedLines(html);

  if (!lines.length) {
    // Unusual document — fall back to raw text rather than returning nothing.
    const raw = await mammoth.extractRawText({ buffer });
    return raw.value.trim();
  }
  return lines.join("\n").trim();
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

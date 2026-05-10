import "server-only";

import mammoth from "mammoth";

const MAX_TRAINING_QUESTIONS = 20;
const MAX_TRAINING_TEXT_CHARS = 20000;

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function cleanTrainingQuestionText(value: string) {
  return value.replace(/^\s*(?:q\s*)?\d+\s*[\).:-]\s*/i, "").replace(/^\s*[-*\u2022]\s*/, "").trim();
}

export function parseTrainingQuestions(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((item): item is string => typeof item === "string")
      .map(cleanTrainingQuestionText)
      .filter(Boolean)
      .slice(0, MAX_TRAINING_QUESTIONS);
  }

  if (typeof input !== "string") return [];

  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const paragraphs = text.split(/\n\s*\n+/).map(cleanTrainingQuestionText).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs.slice(0, MAX_TRAINING_QUESTIONS);

  const numberedQuestions = text
    .replace(/\s+(?=(?:q\s*)?\d+\s*[\).:-]\s+)/gi, "\n")
    .split("\n")
    .map(cleanTrainingQuestionText)
    .filter(Boolean);
  if (numberedQuestions.length > 1) return numberedQuestions.slice(0, MAX_TRAINING_QUESTIONS);

  return text
    .split("\n")
    .map(cleanTrainingQuestionText)
    .filter(Boolean)
    .slice(0, MAX_TRAINING_QUESTIONS);
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function extractTrainingQuestionText(buffer: Buffer, fileName: string) {
  const extension = getExtension(fileName);
  let text = "";

  if (extension === "pdf") {
    text = await extractPdfText(buffer);
  } else if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (["txt", "md", "csv"].includes(extension)) {
    text = buffer.toString("utf8");
  } else {
    throw new Error("Unsupported file type. Upload PDF, DOCX, TXT, MD, or CSV.");
  }

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return normalized.length > MAX_TRAINING_TEXT_CHARS
    ? normalized.slice(0, MAX_TRAINING_TEXT_CHARS)
    : normalized;
}

import "server-only";

import mammoth from "mammoth";
import { inflateRawSync, inflateSync } from "node:zlib";

const MAX_TRAINING_QUESTIONS = 20;
const MAX_TRAINING_TEXT_CHARS = 20000;

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function cleanTrainingQuestionText(value: string) {
  return value.replace(/^\s*(?:q\s*)?\d+\s*[\).:-]\s*/i, "").replace(/^\s*[-*\u2022]\s*/, "").trim();
}

function looksLikeRawPdf(value: string) {
  return (
    value.includes("%PDF-") ||
    value.includes("%%EOF") ||
    /\/Type\s*\/Page/.test(value) ||
    /startxref\s+\d+/i.test(value)
  );
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
  if (looksLikeRawPdf(text)) return [];

  const numberedQuestions = text
    .replace(/\s+(?=(?:q\s*)?\d+\s*[\).:-]\s+)/gi, "\n")
    .split("\n")
    .map(cleanTrainingQuestionText)
    .filter(Boolean);
  if (numberedQuestions.length > 1) return numberedQuestions.slice(0, MAX_TRAINING_QUESTIONS);

  const paragraphs = text.split(/\n\s*\n+/).map(cleanTrainingQuestionText).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs.slice(0, MAX_TRAINING_QUESTIONS);

  const questionSentences = text
    .match(/[^?\n]+?\?/g)
    ?.map(cleanTrainingQuestionText)
    .filter(Boolean) ?? [];
  if (questionSentences.length > 1) return questionSentences.slice(0, MAX_TRAINING_QUESTIONS);

  return text
    .split("\n")
    .map(cleanTrainingQuestionText)
    .filter(Boolean)
    .slice(0, MAX_TRAINING_QUESTIONS);
}

async function extractPdfText(buffer: Buffer) {
  const text = extractSimplePdfText(buffer);
  if (text) return text;

  const looseText = extractLoosePdfText(buffer);
  if (looseText) return looseText;

  throw new Error(
    "Could not extract readable questions from this PDF. Please upload a text-based PDF, DOCX, TXT, MD, CSV, or paste the questions directly."
  );
}

function decodeHexPdfString(value: string) {
  const compact = value.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < compact.length - 1; i += 2) {
    const byte = parseInt(compact.slice(i, i + 2), 16);
    if (!Number.isNaN(byte)) bytes.push(byte);
  }

  return Buffer.from(bytes).toString("utf8").replace(/\u0000/g, "");
}

function decodePdfString(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, escaped: string) => {
      switch (escaped) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "b":
        case "f":
          return "";
        default:
          return escaped;
      }
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function extractTextOperators(stream: string) {
  const chunks: string[] = [];
  const stringPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  const hexStringPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;
  const arrayPattern = /\[((?:.|\n)*?)\]\s*TJ/g;
  const arrayStringPattern = /\(((?:\\.|[^\\)])*)\)/g;
  const arrayHexPattern = /<([0-9a-fA-F\s]+)>/g;

  for (const match of stream.matchAll(stringPattern)) {
    chunks.push(decodePdfString(match[1]));
  }

  for (const match of stream.matchAll(hexStringPattern)) {
    chunks.push(decodeHexPdfString(match[1]));
  }

  for (const arrayMatch of stream.matchAll(arrayPattern)) {
    const parts: string[] = [];
    for (const stringMatch of arrayMatch[1].matchAll(arrayStringPattern)) {
      parts.push(decodePdfString(stringMatch[1]));
    }
    for (const hexMatch of arrayMatch[1].matchAll(arrayHexPattern)) {
      parts.push(decodeHexPdfString(hexMatch[1]));
    }
    if (parts.length > 0) chunks.push(parts.join(""));
  }

  return chunks.join("\n").replace(/\s+\?/g, "?");
}

function extractSimplePdfText(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const streamPattern = /<<(?:.|\n|\r)*?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  const textChunks: string[] = [];

  for (const match of source.matchAll(streamPattern)) {
    const dictionary = match[0].slice(0, match[0].indexOf("stream"));
    const rawStream = Buffer.from(match[1], "latin1");
    let streamBuffer = rawStream;

    if (/\/FlateDecode\b/.test(dictionary)) {
      try {
        streamBuffer = inflateSync(rawStream);
      } catch {
        try {
          streamBuffer = inflateRawSync(rawStream);
        } catch {
          continue;
        }
      }
    }

    const text = extractTextOperators(streamBuffer.toString("latin1"));
    if (text) textChunks.push(text);
  }

  return textChunks.join("\n").replace(/[^\S\r\n]+/g, " ").trim();
}

function extractLoosePdfText(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const chunks = [
    ...source.matchAll(/\(((?:\\.|[^\\)]){8,})\)/g),
    ...source.matchAll(/<([0-9a-fA-F\s]{16,})>/g),
  ]
    .map((match) => {
      const raw = match[1] ?? "";
      return /^[0-9a-fA-F\s]+$/.test(raw) ? decodeHexPdfString(raw) : decodePdfString(raw);
    })
    .map((value) => value.replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 8 && !looksLikeRawPdf(value));

  return chunks.join("\n").trim();
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

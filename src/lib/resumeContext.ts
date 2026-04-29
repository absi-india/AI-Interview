import "server-only";

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { readFile } from "node:fs/promises";
import { getPresignedUrl, BUCKET_RESUMES } from "@/lib/minio";
import { isHttpUrl, parseResumeFileRef } from "@/lib/resume";
import { getLocalResumePath } from "@/lib/resumeFile";

const MAX_RESUME_CONTEXT_CHARS = 12000;

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function limitText(value: string) {
  const normalized = normalizeText(value);
  return normalized.length > MAX_RESUME_CONTEXT_CHARS
    ? `${normalized.slice(0, MAX_RESUME_CONTEXT_CHARS)}...`
    : normalized;
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractFileText(buffer: Buffer, fileName: string) {
  const extension = getExtension(fileName);

  if (extension === "pdf") {
    return extractPdfText(buffer);
  }

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (["txt", "rtf"].includes(extension)) {
    return buffer.toString("utf8");
  }

  return "";
}

async function readResumeFile(ref: NonNullable<ReturnType<typeof parseResumeFileRef>>) {
  if (ref.provider === "local") {
    const localPath = getLocalResumePath(ref.objectKey);
    if (!localPath) return "";
    return extractFileText(await readFile(localPath), ref.fileName);
  }

  const url = await getPresignedUrl(BUCKET_RESUMES, ref.objectKey, 60 * 5);
  const response = await fetch(url);
  if (!response.ok) return "";

  const buffer = Buffer.from(await response.arrayBuffer());
  return extractFileText(buffer, ref.fileName);
}

export async function getResumeContext(resumeUrl: string | null | undefined) {
  if (!resumeUrl) return "";

  const fileRef = parseResumeFileRef(resumeUrl);
  if (fileRef) {
    try {
      const extractedText = await readResumeFile(fileRef);
      const limitedText = limitText(extractedText);
      if (limitedText) return limitedText;
    } catch {
      // Fall back to file metadata below so generation can still proceed.
    }

    return `Resume attachment available: ${fileRef.fileName}. Text could not be extracted automatically.`;
  }

  if (isHttpUrl(resumeUrl)) {
    return `Resume link provided: ${resumeUrl}`;
  }

  return limitText(resumeUrl);
}

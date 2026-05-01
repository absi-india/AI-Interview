import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BUCKET_RESUMES, getPresignedUrl, uploadResume } from "@/lib/minio";
import { createResumeDbRef, createResumeLocalRef, createResumeMinioRef, parseResumeFileRef } from "@/lib/resume";
import { getLocalResumePath } from "@/lib/resumeFile";
import { ensureStoredFileTable } from "@/lib/storedFile";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx", "txt", "rtf", "odt"]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/octet-stream",
]);

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") return false;
  return typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

function getExtension(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ext;
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "resume";
}

function getContentType(fileName: string) {
  const extension = getExtension(fileName);
  if (extension === "pdf") return "application/pdf";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "ppt") return "application/vnd.ms-powerpoint";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (extension === "txt") return "text/plain; charset=utf-8";
  if (extension === "rtf") return "application/rtf";
  if (extension === "odt") return "application/vnd.oasis.opendocument.text";
  return "application/octet-stream";
}

function contentDisposition(fileName: string) {
  const fallbackName = sanitizeFileName(fileName).replace(/"/g, "");
  return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function getAuthorizedCandidate(id: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  if (session.user.role !== "ADMIN" && candidate.recruiterId !== session.user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { candidate };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await getAuthorizedCandidate(id);
  if ("error" in access) return access.error;
  const { candidate } = access;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!isFileLike(file)) {
      return NextResponse.json({ error: "Resume file is required" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Selected file is empty" }, { status: 400 });
    }

    if (file.size > MAX_RESUME_SIZE_BYTES) {
      return NextResponse.json({ error: "Resume file is too large (max 10MB)" }, { status: 400 });
    }

    const originalName = typeof file.name === "string" && file.name.trim() ? file.name : "resume";
    const extension = getExtension(originalName);
    const mimeType = (typeof file.type === "string" && file.type ? file.type : "application/octet-stream").toLowerCase();
    const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);
    const mimeAllowed = ALLOWED_MIME_TYPES.has(mimeType);

    if (!extensionAllowed && !mimeAllowed) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, DOC, DOCX, PPT, PPTX, TXT, RTF, ODT." },
        { status: 400 },
      );
    }

    const safeName = sanitizeFileName(originalName);
    const objectFileName = `${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let resumeRef: string;
    try {
      const objectKey = await uploadResume(candidate.id, objectFileName, buffer, mimeType);
      resumeRef = createResumeMinioRef(originalName, objectKey);
    } catch (uploadErr: unknown) {
      console.warn("[resume/upload] Object storage unavailable; saving resume in database", uploadErr);

      if (process.env.NODE_ENV === "production") {
        await ensureStoredFileTable();
        const stored = await prisma.storedFile.create({
          data: {
            kind: "resume",
            fileName: originalName,
            contentType: getContentType(originalName),
            data: buffer,
          },
        });
        resumeRef = createResumeDbRef(originalName, stored.id);
      } else {
        // Local dev fallback when MinIO is not running:
        // persist file under /public so it remains downloadable in-browser.
        const relativePublicPath = `/uploads/resumes/${candidate.id}/${objectFileName}`;
        const absoluteDir = path.join(process.cwd(), "public", "uploads", "resumes", candidate.id);
        const absoluteFile = path.join(absoluteDir, objectFileName);
        await mkdir(absoluteDir, { recursive: true });
        await writeFile(absoluteFile, buffer);
        resumeRef = createResumeLocalRef(originalName, relativePublicPath);
      }
    }

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        resumeUrl: resumeRef,
      },
    });

    const uploadedRef = parseResumeFileRef(resumeRef);

    return NextResponse.json({
      ok: true,
      fileName: originalName,
      resumeDownloadPath: uploadedRef?.provider === "local"
        ? uploadedRef.objectKey
        : `/api/candidates/${candidate.id}/resume`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upload resume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await getAuthorizedCandidate(id);
  if ("error" in access) return access.error;
  const { candidate } = access;

  const ref = parseResumeFileRef(candidate.resumeUrl);
  if (!ref) {
    return NextResponse.json({ error: "No uploaded resume found" }, { status: 404 });
  }

  try {
    if (ref.provider === "local") {
      const localPath = getLocalResumePath(ref.objectKey);
      if (!localPath) {
        return NextResponse.json({ error: "Invalid resume path" }, { status: 404 });
      }

      const buffer = await readFile(localPath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Disposition": contentDisposition(ref.fileName),
          "Content-Length": buffer.byteLength.toString(),
          "Content-Type": getContentType(ref.fileName),
        },
      });
    }

    if (ref.provider === "db") {
      await ensureStoredFileTable();
      const stored = await prisma.storedFile.findUnique({ where: { id: ref.objectKey } });
      if (!stored || stored.kind !== "resume") {
        return NextResponse.json({ error: "Resume file not found" }, { status: 404 });
      }

      return new NextResponse(stored.data, {
        headers: {
          "Content-Disposition": contentDisposition(stored.fileName),
          "Content-Length": stored.data.byteLength.toString(),
          "Content-Type": stored.contentType,
        },
      });
    }

    const presigned = await getPresignedUrl(BUCKET_RESUMES, ref.objectKey, 60 * 30);
    return NextResponse.redirect(presigned);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create download link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { analyzeResume } from "@/lib/resume-formatting/analyze";
import { ACCEPTED_EXTENSIONS, extractResumeText, getExtension } from "@/lib/resume-formatting/extract";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") return false;
  return typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!isFileLike(file)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 10 MB." }, { status: 400 });
  }

  const ext = getExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return NextResponse.json(
      { error: "Unsupported file type. Please upload a PDF, DOC, or DOCX file." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { text, needsManualText } = await extractResumeText(buffer, file.name);

  if (needsManualText || !text) {
    return NextResponse.json(
      {
        error:
          ext === "doc"
            ? "This looks like a legacy .doc file we couldn't read. Please save it as .docx or PDF and upload again."
            : "We couldn't extract text from this file. If it's a scanned image, please upload a text-based PDF or a DOCX.",
        needsManualText: true,
      },
      { status: 422 },
    );
  }

  const result = await analyzeResume(text, file.name);
  return NextResponse.json(result);
}

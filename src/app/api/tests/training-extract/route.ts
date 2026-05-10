import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const [{ auth }, { extractTrainingQuestionText, parseTrainingQuestions }] = await Promise.all([
      import("@/auth"),
      import("@/lib/trainingQuestions"),
    ]);

    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Question file is required" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File is too large. Upload a file under 10 MB." }, { status: 400 });
    }

    const fileName = file.name || "questions";
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTrainingQuestionText(buffer, fileName);
    const questions = parseTrainingQuestions(text);

    if (!text || questions.length === 0) {
      return NextResponse.json(
        { error: "Could not find readable questions in that file. Please paste the questions manually." },
        { status: 400 }
      );
    }

    return NextResponse.json({ text, questionCount: questions.length, fileName });
  } catch (err: unknown) {
    console.error("[tests/training-extract] Failed", err);
    const message = err instanceof Error ? err.message : "Failed to read question file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

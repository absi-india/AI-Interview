import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { buildResumeDocx, resumeFileName } from "@/lib/resume-formatting/docx";
import { TEMPLATE_IDS, type ResumeModel, type TemplateId } from "@/lib/resume-formatting/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { model?: ResumeModel; templateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const templateId = body.templateId as TemplateId | undefined;
  if (!templateId || !TEMPLATE_IDS.includes(templateId)) {
    return NextResponse.json({ error: "Unknown resume template." }, { status: 400 });
  }
  if (!body.model || typeof body.model !== "object") {
    return NextResponse.json({ error: "Missing resume content." }, { status: 400 });
  }

  try {
    const buffer = await buildResumeDocx(body.model, templateId);
    const fileName = resumeFileName(body.model, templateId);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[resume-format/export] failed", err);
    return NextResponse.json({ error: "Could not generate the document. Please try again." }, { status: 500 });
  }
}

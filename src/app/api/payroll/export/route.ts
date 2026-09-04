import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { buildPayslipWorkbook } from "@/lib/payroll/excel";
import { buildPayslipPdf, buildPayslipPdfBundle, pdfFileName } from "@/lib/payroll/pdf";
import type { Payslip } from "@/lib/payroll/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function canSeePayroll(role: string | undefined): boolean {
  return role === "ADMIN" || role === "ACCOUNTS";
}

/**
 * Produce the selected payslips.
 *
 * The slips come from the browser, already corrected by whoever reviewed them,
 * so the file and the screen cannot disagree. Nothing is stored: the response
 * is the only copy.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeePayroll(session.user.role)) {
    return NextResponse.json({ error: "You do not have access to payroll." }, { status: 403 });
  }

  let body: { format?: string; payslips?: Payslip[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const payslips = Array.isArray(body.payslips) ? body.payslips : [];
  if (!payslips.length) {
    return NextResponse.json({ error: "Select at least one payslip to generate." }, { status: 400 });
  }

  try {
    if (body.format === "xlsx") {
      const buffer = await buildPayslipWorkbook(payslips);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="Payslips.xlsx"',
          "Cache-Control": "no-store",
        },
      });
    }

    // One slip downloads under the employee's own name; several arrive as a
    // single document, a page each, since a browser cannot receive many files
    // from one request.
    const single = payslips.length === 1;
    const buffer = single ? await buildPayslipPdf(payslips[0]) : await buildPayslipPdfBundle(payslips);
    const name = single ? pdfFileName(payslips[0]) : "Payslips.pdf";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[payroll/export] failed", err);
    return NextResponse.json({ error: "Could not generate the payslips. Please try again." }, { status: 500 });
  }
}

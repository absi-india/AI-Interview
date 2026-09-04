import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { parseEdrWorkbook } from "@/lib/payroll/parseEdr";
import { buildPayslip } from "@/lib/payroll/payslip";
import type { Payslip, PayrollWarning } from "@/lib/payroll/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

/** Payroll carries salary, PAN and bank details; recruiters have no business here. */
export function canSeePayroll(role: string | undefined): boolean {
  return role === "ADMIN" || role === "ACCOUNTS";
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") return false;
  return typeof value.arrayBuffer === "function" && typeof value.size === "number";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeePayroll(session.user.role)) {
    return NextResponse.json({ error: "You do not have access to payroll." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!isFileLike(file)) return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large. Maximum size is 15 MB." }, { status: 400 });
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    return NextResponse.json({ error: "Please upload the salary workbook as .xlsx." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { months, rowsByMonth, master, warnings } = await parseEdrWorkbook(buffer);

    if (!months.length) {
      return NextResponse.json(
        { error: "No month sheets were found in that workbook. Expected sheets such as \"April 2026\"." },
        { status: 422 },
      );
    }

    const all: PayrollWarning[] = [...warnings];
    const payslips: Payslip[] = [];
    for (const month of months) {
      for (const row of rowsByMonth.get(month) ?? []) {
        payslips.push(buildPayslip(row, { orderedMonths: months, rowsByMonth, master }, all));
      }
    }

    return NextResponse.json({ months, payslips, warnings: all });
  } catch (err) {
    console.error("[payroll/parse] failed", err);
    return NextResponse.json(
      { error: "That workbook could not be read. Check it is the EDR summary and not a different file." },
      { status: 422 },
    );
  }
}

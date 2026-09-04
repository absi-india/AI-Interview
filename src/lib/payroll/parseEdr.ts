import "server-only";

import ExcelJS from "exceljs";
import type { EmployeeMaster, PayrollWarning, SalaryRow } from "./types";

/** Row 6 carries the real column headers; everything above it is titling. */
const HEADER_ROW = 6;
const BANK_SHEET = "Bank Details";

/**
 * Gross and Net Pay are formulas on these sheets, so the stored value is an
 * object carrying the cached result rather than a number.
 */
function num(value: ExcelJS.CellValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,\s₹]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object") {
    const o = value as { result?: unknown; richText?: { text: string }[] };
    if (typeof o.result === "number") return o.result;
    if (typeof o.result === "string") return num(o.result);
    if (o.richText) return num(o.richText.map((t) => t.text).join(""));
  }
  return 0;
}

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const o = value as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("").trim();
    if (typeof o.text === "string") return o.text.trim();
    if (o.result !== undefined) return String(o.result).trim();
  }
  return String(value).trim();
}

/** Rows that look like people but are not: totals and company overhead. */
function isNotAnEmployee(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("grand total") ||
    n.includes("abs infotech expense") ||
    n === "total" ||
    n.startsWith("claimed by")
  );
}

export interface ParsedWorkbook {
  months: string[];
  rowsByMonth: Map<string, SalaryRow[]>;
  master: EmployeeMaster[];
  warnings: PayrollWarning[];
}

export async function parseEdrWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const warnings: PayrollWarning[] = [];

  // Employee master — the header spells it "Acocunt Number"; read by position
  // so a corrected spelling later does not break the import.
  const master: EmployeeMaster[] = [];
  const bank = wb.getWorksheet(BANK_SHEET);
  if (bank) {
    for (let r = 2; r <= bank.rowCount; r++) {
      const row = bank.getRow(r);
      const name = text(row.getCell(2).value);
      if (!name) continue;
      master.push({
        employeeNo: text(row.getCell(1).value),
        name,
        designation: text(row.getCell(3).value),
        department: text(row.getCell(4).value),
        location: text(row.getCell(5).value),
        effectiveWorkDays: text(row.getCell(6).value),
        bankName: text(row.getCell(7).value),
        accountNumber: text(row.getCell(8).value),
        panCard: text(row.getCell(9).value),
      });
    }
  }

  const months: string[] = [];
  const rowsByMonth = new Map<string, SalaryRow[]>();

  for (const sheet of wb.worksheets) {
    if (sheet.name === BANK_SHEET) continue;
    const rows: SalaryRow[] = [];

    for (let r = HEADER_ROW + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const name = text(row.getCell(3).value);
      // The reimbursement table below Grand Total is office expense, not payroll.
      if (isNotAnEmployee(name)) break;
      if (!name) continue;

      const baseSalary = num(row.getCell(4).value);
      const incentives = num(row.getCell(5).value);
      const expense = num(row.getCell(6).value);
      const employeeNo = text(row.getCell(1).value);

      if (!employeeNo) {
        warnings.push({ month: sheet.name, name, employeeNo: "", issue: "No employee number on this row — left blank on the payslip" });
      }

      rows.push({
        month: sheet.name,
        employeeNo,
        name,
        baseSalary,
        incentives,
        expense,
        sheetGross: num(row.getCell(7).value),
        tds: num(row.getCell(8).value),
        insurance: num(row.getCell(9).value),
        lop: num(row.getCell(10).value),
        sheetNetPay: num(row.getCell(14).value),
      });
    }

    if (rows.length) {
      months.push(sheet.name);
      rowsByMonth.set(sheet.name, rows);
    }
  }

  return { months, rowsByMonth, master, warnings };
}

import "server-only";

import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Payslip } from "./types";

const FONT = "Times New Roman";
const MONEY = "#,##0.00";
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };

let cachedLogo: Buffer | null | undefined;
async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = await readFile(path.join(process.cwd(), "public", "absi-payslip-logo.png"));
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

/** Excel caps sheet names at 31 characters and forbids a handful of symbols. */
export function sheetNameFor(p: Payslip): string {
  const parts = p.month.split(/\s+/);
  const shortMonth = `${(parts[0] ?? "").slice(0, 3)}${(parts[1] ?? "").slice(-2)}`;
  const safeName = p.name.replace(/[:\/?*\[\]]/g, "");
  return `${safeName} - ${shortMonth}`.slice(0, 31);
}

function labelCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  cell.font = { name: FONT, size: 10, bold: true };
  cell.alignment = { vertical: "middle" };
}

function valueCell(cell: ExcelJS.Cell, value: string | number, money = false) {
  cell.value = value;
  cell.font = { name: FONT, size: 10 };
  cell.alignment = { vertical: "middle" };
  if (money) cell.numFmt = MONEY;
}

function boxRange(sheet: ExcelJS.Worksheet, top: number, bottom: number, left: number, right: number) {
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const cell = sheet.getRow(r).getCell(c);
      cell.border = {
        top: r === top ? THIN : undefined,
        bottom: r === bottom ? THIN : undefined,
        left: c === left ? THIN : undefined,
        right: c === right ? THIN : undefined,
      };
    }
  }
}

/** Vertical rule after column C, splitting the two halves of a section. */
function divideAfterC(sheet: ExcelJS.Worksheet, top: number, bottom: number) {
  for (let r = top; r <= bottom; r++) {
    const c = sheet.getRow(r).getCell(3);
    c.border = { ...c.border, right: THIN };
  }
}

export function writePayslipSheet(sheet: ExcelJS.Worksheet, p: Payslip, logo: number | null) {
  sheet.columns = [
    { width: 22 }, { width: 16 }, { width: 14 },
    { width: 20 }, { width: 16 }, { width: 14 },
  ];

  sheet.mergeCells("A1:F1");
  const title = sheet.getCell("A1");
  title.value = "ABS INFOTECH PVT LTD";
  title.font = { name: FONT, size: 16, bold: true };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells("A2:F2");
  const addr = sheet.getCell("A2");
  addr.value = "B-278, CHITRANJAN PARK NEW DELHI 110019";
  addr.font = { name: FONT, size: 10 };
  addr.alignment = { horizontal: "center" };

  sheet.mergeCells("A3:F3");
  const period = sheet.getCell("A3");
  period.value = `Payslip for the month of ${p.month}`;
  period.font = { name: FONT, size: 13, bold: true };
  period.alignment = { horizontal: "center" };

  if (logo !== null) {
    sheet.addImage(logo, {
      tl: { col: 0, row: 0, nativeColOff: 34925, nativeRowOff: 85725 } as ExcelJS.Anchor,
      ext: { width: 151, height: 55 },
      editAs: "oneCell",
    });
  }

  const leftRows: [string, string][] = [
    ["Name:", p.name],
    ["Designation:", p.designation],
    ["Department:", p.department],
    ["Location:", p.location],
    ["Effective Work Days:", p.effectiveWorkDays],
    ["LOP:", ""],
  ];
  const rightRows: [string, string][] = [
    ["Employee No.:", p.employeeNo],
    ["Bank Name:", p.bankName],
    ["Bank Account No.:", p.accountNumber],
    ["PAN No.:", p.panCard],
    ["", ""],
    ["", ""],
  ];

  for (let i = 0; i < 6; i++) {
    const r = 5 + i;
    labelCell(sheet.getRow(r).getCell(1), leftRows[i][0]);
    if (leftRows[i][0] === "LOP:") {
      valueCell(sheet.getRow(r).getCell(2), p.deductions.lop, true);
    } else {
      valueCell(sheet.getRow(r).getCell(2), leftRows[i][1]);
    }
    labelCell(sheet.getRow(r).getCell(4), rightRows[i][0]);
    valueCell(sheet.getRow(r).getCell(5), rightRows[i][1]);
  }
  boxRange(sheet, 5, 10, 1, 6);
  divideAfterC(sheet, 5, 10);

  sheet.mergeCells("A12:C12");
  const eh = sheet.getCell("A12");
  eh.value = "Earnings in INR";
  eh.font = { name: FONT, size: 11, bold: true };
  sheet.mergeCells("D12:F12");
  const dh = sheet.getCell("D12");
  dh.value = "Deductions in INR";
  dh.font = { name: FONT, size: 11, bold: true };

  ["Item", "Amount", "YTD", "Item", "Amount", "YTD"].forEach((h, i) => {
    labelCell(sheet.getRow(13).getCell(i + 1), h);
  });

  const earnings: [string, number, number][] = [
    ["BASIC", p.earnings.basic, p.ytdEarnings.basic],
    ["HRA", p.earnings.hra, p.ytdEarnings.hra],
    ["CONVEYANCE", p.earnings.conveyance, p.ytdEarnings.conveyance],
    ["SPECIAL ALLOWANCE", p.earnings.specialAllowance, p.ytdEarnings.specialAllowance],
  ];
  const deductions: [string, number, number][] = [
    ["INCOME TAX", p.deductions.incomeTax, p.ytdDeductions.incomeTax],
    ["Medical", p.deductions.medical, p.ytdDeductions.medical],
    ["LOP", p.deductions.lop, p.ytdDeductions.lop],
  ];

  for (let i = 0; i < 4; i++) {
    const r = 14 + i;
    valueCell(sheet.getRow(r).getCell(1), earnings[i][0]);
    valueCell(sheet.getRow(r).getCell(2), earnings[i][1], true);
    valueCell(sheet.getRow(r).getCell(3), earnings[i][2], true);
    if (i < deductions.length) {
      valueCell(sheet.getRow(r).getCell(4), deductions[i][0]);
      valueCell(sheet.getRow(r).getCell(5), deductions[i][1], true);
      valueCell(sheet.getRow(r).getCell(6), deductions[i][2], true);
    }
  }
  boxRange(sheet, 12, 17, 1, 6);
  divideAfterC(sheet, 12, 17);

  // Totals stay live formulas, carrying their computed value so nothing shows
  // blank without a spreadsheet application to recalculate them.
  const totalsRow = sheet.getRow(19);
  labelCell(totalsRow.getCell(1), "Total Earnings (Rs):");
  totalsRow.getCell(2).value = { formula: "SUM(B14:B17)", result: p.totalEarnings };
  totalsRow.getCell(3).value = {
    formula: "SUM(C14:C17)",
    result:
      p.ytdEarnings.basic + p.ytdEarnings.hra + p.ytdEarnings.conveyance + p.ytdEarnings.specialAllowance,
  };
  labelCell(totalsRow.getCell(4), "Total Deductions");
  totalsRow.getCell(5).value = { formula: "SUM(E14:E17)", result: p.totalDeductions };
  totalsRow.getCell(6).value = {
    formula: "SUM(F14:F17)",
    result: p.ytdDeductions.incomeTax + p.ytdDeductions.medical + p.ytdDeductions.lop,
  };
  for (const c of [2, 3, 5, 6]) {
    const cell = totalsRow.getCell(c);
    cell.font = { name: FONT, size: 10, bold: true };
    cell.numFmt = MONEY;
  }
  boxRange(sheet, 19, 19, 1, 6);
  divideAfterC(sheet, 19, 19);

  const netRow = sheet.getRow(21);
  labelCell(netRow.getCell(1), "Net Pay for the month : ");
  netRow.getCell(2).value = { formula: "B19-E19", result: p.netPay };
  netRow.getCell(2).font = { name: FONT, size: 10, bold: true };
  netRow.getCell(2).numFmt = MONEY;
  sheet.mergeCells("C21:F21");
  const words = sheet.getCell("C21");
  words.value = p.netPayInWords;
  words.font = { name: FONT, size: 10, bold: true };
  words.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
  boxRange(sheet, 21, 21, 1, 6);

  sheet.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    printArea: "A1:F21",
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
}

export async function buildPayslipWorkbook(payslips: Payslip[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ABS InfoTech Payroll";

  const logoBuffer = await loadLogo();
  const logoId = logoBuffer
    ? wb.addImage({ buffer: logoBuffer as unknown as ExcelJS.Buffer, extension: "png" })
    : null;

  const used = new Set<string>();
  for (const p of payslips) {
    const base = sheetNameFor(p);
    let name = base;
    let n = 2;
    // Two people sharing a name would otherwise collide on the sheet name.
    while (used.has(name)) name = `${base.slice(0, 27)} (${n++})`;
    used.add(name);
    writePayslipSheet(wb.addWorksheet(name), p, logoId);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

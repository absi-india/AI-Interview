import "server-only";

import { jsPDF } from "jspdf";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Payslip } from "./types";

/**
 * Draw a payslip as a PDF, matching the published slip.
 *
 * Drawn directly rather than converted from the workbook: converting would
 * need a spreadsheet application on the server, which is not available here.
 * The layout below mirrors the sheet so the two read as the same document.
 */

const LEFT = 14;
const RIGHT = 196;
const WIDTH = RIGHT - LEFT;
const MID = LEFT + WIDTH / 2;

let cachedLogo: string | null | undefined;
async function loadLogoDataUri(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "absi-payslip-logo.png"));
    cachedLogo = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

function money(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function drawSlip(doc: jsPDF, p: Payslip, logo: string | null) {
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("ABS INFOTECH PVT LTD", 105, 18, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.text("B-278, CHITRANJAN PARK NEW DELHI 110019", 105, 24, { align: "center" });

  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text(`Payslip for the month of ${p.month}`, 105, 32, { align: "center" });

  if (logo) {
    // Same proportions as the published slip: 1.58in by 0.57in.
    doc.addImage(logo, "PNG", LEFT, 10, 40, 14);
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.2);

  // Employee details, two columns inside one box.
  const detailsTop = 38;
  const lineHeight = 7;
  const detailRows: [string, string, string, string][] = [
    ["Name:", p.name, "Employee No.:", p.employeeNo],
    ["Designation:", p.designation, "Bank Name:", p.bankName],
    ["Department:", p.department, "Bank Account No.:", p.accountNumber],
    ["Location:", p.location, "PAN No.:", p.panCard],
    ["Effective Work Days:", p.effectiveWorkDays, "", ""],
    ["LOP:", money(p.deductions.lop), "", ""],
  ];
  const detailsHeight = detailRows.length * lineHeight;
  doc.rect(LEFT, detailsTop, WIDTH, detailsHeight);
  doc.line(MID, detailsTop, MID, detailsTop + detailsHeight);

  doc.setFontSize(9.5);
  detailRows.forEach(([l1, v1, l2, v2], i) => {
    const y = detailsTop + lineHeight * (i + 1) - 2.4;
    doc.setFont("times", "bold");
    doc.text(l1, LEFT + 2, y);
    doc.setFont("times", "normal");
    doc.text(String(v1 ?? ""), LEFT + 36, y);
    if (l2) {
      doc.setFont("times", "bold");
      doc.text(l2, MID + 2, y);
      doc.setFont("times", "normal");
      doc.text(String(v2 ?? ""), MID + 34, y);
    }
  });

  return detailsTop + detailsHeight;
}

function drawTable(doc: jsPDF, p: Payslip, startY: number): number {
  const top = startY + 8;
  const rowH = 7;
  const headH = 7;
  const bodyRows = 4;
  const height = headH * 2 + rowH * bodyRows;

  doc.rect(LEFT, top, WIDTH, height);
  doc.line(MID, top, MID, top + height);
  doc.line(LEFT, top + headH, RIGHT, top + headH);
  doc.line(LEFT, top + headH * 2, RIGHT, top + headH * 2);

  doc.setFontSize(10);
  doc.setFont("times", "bold");
  doc.text("Earnings in INR", LEFT + 2, top + headH - 2.2);
  doc.text("Deductions in INR", MID + 2, top + headH - 2.2);

  doc.setFontSize(9);
  const colAmount = MID - 26;
  const colYtd = MID - 4;
  const colAmount2 = RIGHT - 26;
  const colYtd2 = RIGHT - 4;
  const headY = top + headH * 2 - 2.2;
  doc.text("Item", LEFT + 2, headY);
  doc.text("Amount", colAmount, headY, { align: "right" });
  doc.text("YTD", colYtd, headY, { align: "right" });
  doc.text("Item", MID + 2, headY);
  doc.text("Amount", colAmount2, headY, { align: "right" });
  doc.text("YTD", colYtd2, headY, { align: "right" });

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

  doc.setFont("times", "normal");
  for (let i = 0; i < bodyRows; i++) {
    const y = top + headH * 2 + rowH * (i + 1) - 2.2;
    const [eLabel, eAmt, eYtd] = earnings[i];
    doc.text(eLabel, LEFT + 2, y);
    doc.text(money(eAmt), colAmount, y, { align: "right" });
    doc.text(money(eYtd), colYtd, y, { align: "right" });
    if (i < deductions.length) {
      const [dLabel, dAmt, dYtd] = deductions[i];
      doc.text(dLabel, MID + 2, y);
      doc.text(money(dAmt), colAmount2, y, { align: "right" });
      doc.text(money(dYtd), colYtd2, y, { align: "right" });
    }
  }

  return top + height;
}

function drawTotals(doc: jsPDF, p: Payslip, startY: number): number {
  const rowH = 8;
  const top = startY;
  doc.rect(LEFT, top, WIDTH, rowH);
  doc.line(MID, top, MID, top + rowH);

  const y = top + rowH - 2.6;
  const ytdEarn =
    p.ytdEarnings.basic + p.ytdEarnings.hra + p.ytdEarnings.conveyance + p.ytdEarnings.specialAllowance;
  const ytdDed = p.ytdDeductions.incomeTax + p.ytdDeductions.medical + p.ytdDeductions.lop;

  doc.setFont("times", "bold");
  doc.setFontSize(9);
  doc.text("Total Earnings (Rs):", LEFT + 2, y);
  doc.text(money(p.totalEarnings), MID - 26, y, { align: "right" });
  doc.text(money(ytdEarn), MID - 4, y, { align: "right" });
  doc.text("Total Deductions", MID + 2, y);
  doc.text(money(p.totalDeductions), RIGHT - 26, y, { align: "right" });
  doc.text(money(ytdDed), RIGHT - 4, y, { align: "right" });

  return top + rowH;
}

function drawNetPay(doc: jsPDF, p: Payslip, startY: number) {
  const rowH = 9;
  const top = startY + 6;
  doc.rect(LEFT, top, WIDTH, rowH);

  const y = top + rowH - 3;
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text("Net Pay for the month : ", LEFT + 2, y);
  doc.text(money(p.netPay), LEFT + 48, y);

  // The wording must stay on one line, so shrink it rather than let it wrap.
  const wordsX = LEFT + 74;
  const available = RIGHT - wordsX - 2;
  let size = 9;
  doc.setFontSize(size);
  while (size > 5.5 && doc.getTextWidth(p.netPayInWords) > available) {
    size -= 0.25;
    doc.setFontSize(size);
  }
  doc.text(p.netPayInWords, wordsX, y);
}

/** A single payslip PDF. */
export async function buildPayslipPdf(p: Payslip): Promise<Buffer> {
  const logo = await loadLogoDataUri();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const afterDetails = drawSlip(doc, p, logo);
  const afterTable = drawTable(doc, p, afterDetails);
  const afterTotals = drawTotals(doc, p, afterTable);
  drawNetPay(doc, p, afterTotals);
  return Buffer.from(doc.output("arraybuffer"));
}

/** Every selected payslip in one document, a page each. */
export async function buildPayslipPdfBundle(payslips: Payslip[]): Promise<Buffer> {
  const logo = await loadLogoDataUri();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  payslips.forEach((p, i) => {
    if (i > 0) doc.addPage();
    const afterDetails = drawSlip(doc, p, logo);
    const afterTable = drawTable(doc, p, afterDetails);
    const afterTotals = drawTotals(doc, p, afterTable);
    drawNetPay(doc, p, afterTotals);
  });
  return Buffer.from(doc.output("arraybuffer"));
}

/** e.g. Nitin_Sharma_July_2026.pdf */
export function pdfFileName(p: Payslip): string {
  const name = p.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Employee";
  const month = p.month.replace(/\s+/g, "_");
  return `${name}_${month}.pdf`;
}

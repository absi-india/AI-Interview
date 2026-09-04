import type { EmployeeMaster, Payslip, PayrollWarning, SalaryRow } from "./types";
import { amountInWords } from "./words";

/**
 * The earnings split is expressed as shares of Gross rather than fixed rupee
 * amounts, so it holds for every employee and month rather than only the one
 * the reference slip was produced from.
 */
const BASIC_SHARE = 0.4;
const HRA_SHARE = 0.2;
const CONVEYANCE_SHARE = 0.032;

/** Money is held to the paisa; floating point noise is not a mismatch. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Resolve the person behind a row.
 *
 * Employee numbers have been reassigned between people across months, so a
 * number is trusted only alongside the name it appears with. Where the two
 * disagree the name on that month row wins and the conflict is reported.
 */
export function resolveEmployee(
  row: SalaryRow,
  master: EmployeeMaster[],
): { master?: EmployeeMaster; warning?: string } {
  const byName = master.find((m) => normalizeName(m.name) === normalizeName(row.name));
  if (!row.employeeNo) return { master: byName };

  const byNo = master.find((m) => m.employeeNo.toUpperCase() === row.employeeNo.toUpperCase());
  if (byNo && byName && byNo !== byName) {
    return {
      master: byName,
      warning: `Employee number ${row.employeeNo} belongs to ${byNo.name} in Bank Details, but this row is ${row.name}. Used the name on the row.`,
    };
  }
  if (byNo && !byName) {
    return {
      master: byNo,
      warning: `${row.name} was not found in Bank Details; matched on employee number ${row.employeeNo} instead.`,
    };
  }
  if (!byNo && !byName) {
    return { warning: `${row.name} has no Bank Details entry, so designation and bank fields are blank.` };
  }
  return { master: byName ?? byNo };
}

function splitEarnings(gross: number) {
  const basic = round2(gross * BASIC_SHARE);
  const hra = round2(gross * HRA_SHARE);
  const conveyance = round2(gross * CONVEYANCE_SHARE);
  // The remainder, so the parts always add back to Gross exactly.
  const specialAllowance = round2(gross - basic - hra - conveyance);
  return { basic, hra, conveyance, specialAllowance };
}

export interface BuildOptions {
  /** Month sheets in fiscal order, used for the year to date columns. */
  orderedMonths: string[];
  rowsByMonth: Map<string, SalaryRow[]>;
  master: EmployeeMaster[];
}

/** Build one payslip, accumulating year to date figures from April onwards. */
export function buildPayslip(
  row: SalaryRow,
  opts: BuildOptions,
  warnings: PayrollWarning[],
): Payslip {
  const gross = round2(row.baseSalary + row.incentives + row.expense);
  if (row.sheetGross && Math.abs(gross - row.sheetGross) > 0.01) {
    warnings.push({
      month: row.month,
      name: row.name,
      employeeNo: row.employeeNo,
      issue: `Gross works out to ${gross.toFixed(2)} but the sheet says ${row.sheetGross.toFixed(2)}.`,
    });
  }

  const earnings = splitEarnings(gross);
  const deductions = {
    incomeTax: round2(row.tds),
    medical: round2(row.insurance),
    lop: round2(row.lop),
  };

  const totalEarnings = round2(
    earnings.basic + earnings.hra + earnings.conveyance + earnings.specialAllowance,
  );
  const totalDeductions = round2(deductions.incomeTax + deductions.medical + deductions.lop);
  const netPay = round2(totalEarnings - totalDeductions);

  const { master: person, warning } = resolveEmployee(row, opts.master);
  if (warning) {
    warnings.push({ month: row.month, name: row.name, employeeNo: row.employeeNo, issue: warning });
  }

  // Year to date: every month up to and including this one.
  const upTo = opts.orderedMonths.slice(0, opts.orderedMonths.indexOf(row.month) + 1);
  const ytdEarnings = { basic: 0, hra: 0, conveyance: 0, specialAllowance: 0 };
  const ytdDeductions = { incomeTax: 0, medical: 0, lop: 0 };
  for (const m of upTo) {
    const prior = (opts.rowsByMonth.get(m) ?? []).find(
      (r) => normalizeName(r.name) === normalizeName(row.name),
    );
    if (!prior) continue;
    const g = round2(prior.baseSalary + prior.incentives + prior.expense);
    const e = splitEarnings(g);
    ytdEarnings.basic = round2(ytdEarnings.basic + e.basic);
    ytdEarnings.hra = round2(ytdEarnings.hra + e.hra);
    ytdEarnings.conveyance = round2(ytdEarnings.conveyance + e.conveyance);
    ytdEarnings.specialAllowance = round2(ytdEarnings.specialAllowance + e.specialAllowance);
    ytdDeductions.incomeTax = round2(ytdDeductions.incomeTax + prior.tds);
    ytdDeductions.medical = round2(ytdDeductions.medical + prior.insurance);
    ytdDeductions.lop = round2(ytdDeductions.lop + prior.lop);
  }

  // Reported, never silently corrected: the sheet stays the authority.
  const mismatch =
    row.sheetNetPay && Math.abs(netPay - row.sheetNetPay) > 0.01
      ? { computed: netPay, fromSheet: round2(row.sheetNetPay) }
      : undefined;
  if (mismatch) {
    warnings.push({
      month: row.month,
      name: row.name,
      employeeNo: row.employeeNo,
      issue: `Net Pay works out to ${mismatch.computed.toFixed(2)} but the sheet says ${mismatch.fromSheet.toFixed(2)}.`,
    });
  }

  return {
    month: row.month,
    employeeNo: row.employeeNo,
    name: row.name,
    designation: person?.designation ?? "",
    department: person?.department ?? "",
    location: person?.location ?? "",
    effectiveWorkDays: person?.effectiveWorkDays ?? "",
    bankName: person?.bankName ?? "",
    accountNumber: person?.accountNumber ?? "",
    panCard: person?.panCard ?? "",
    gross,
    earnings,
    deductions,
    ytdEarnings,
    ytdDeductions,
    totalEarnings,
    totalDeductions,
    netPay,
    netPayInWords: amountInWords(netPay),
    netPayMismatch: mismatch,
  };
}

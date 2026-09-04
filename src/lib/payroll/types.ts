/**
 * Payroll types.
 *
 * Everything here is derived from the uploaded EDR workbook for a single run.
 * Nothing is stored: salary, PAN and bank details live only for the length of
 * the request that produced the payslips.
 */

export interface EmployeeMaster {
  employeeNo: string;
  name: string;
  designation: string;
  department: string;
  location: string;
  effectiveWorkDays: string;
  bankName: string;
  accountNumber: string;
  panCard: string;
}

/** One employee's row on one month sheet, as read from the workbook. */
export interface SalaryRow {
  month: string;
  employeeNo: string;
  name: string;
  baseSalary: number;
  incentives: number;
  expense: number;
  /** The sheet's own Gross, used to check our arithmetic against theirs. */
  sheetGross: number;
  tds: number;
  insurance: number;
  lop: number;
  /** The sheet's own Net Pay — the number that must ultimately agree. */
  sheetNetPay: number;
}

export interface Earnings {
  basic: number;
  hra: number;
  conveyance: number;
  specialAllowance: number;
}

export interface Deductions {
  incomeTax: number;
  medical: number;
  lop: number;
}

/** A payslip ready to render, with the year-to-date figures alongside. */
export interface Payslip {
  month: string;
  employeeNo: string;
  name: string;
  designation: string;
  department: string;
  location: string;
  effectiveWorkDays: string;
  bankName: string;
  accountNumber: string;
  panCard: string;
  gross: number;
  earnings: Earnings;
  deductions: Deductions;
  ytdEarnings: Earnings;
  ytdDeductions: Deductions;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  netPayInWords: string;
  /** Set when our Net Pay disagrees with the sheet's, rather than overwriting it. */
  netPayMismatch?: { computed: number; fromSheet: number };
}

/** Anything the operator needs to see rather than have silently swallowed. */
export interface PayrollWarning {
  month: string;
  name: string;
  employeeNo: string;
  issue: string;
}

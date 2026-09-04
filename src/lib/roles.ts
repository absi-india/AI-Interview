/**
 * Who a person is in the system.
 *
 * ACCOUNTS exists so the payroll team can reach payslips without being made an
 * administrator, which would also hand them every candidate and the ability to
 * manage other users.
 */
export const ROLES = ["ADMIN", "RECRUITER", "ACCOUNTS"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  RECRUITER: "Recruiter",
  ACCOUNTS: "Accounts",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Payslips carry salary, PAN and bank details. */
export function canSeePayroll(role: string | undefined): boolean {
  return role === "ADMIN" || role === "ACCOUNTS";
}

/**
 * Candidates, interviews and resumes. The accounts team has no part in hiring,
 * so this is not merely hidden from them: candidate records are none of their
 * business.
 */
export function canSeeRecruiting(role: string | undefined): boolean {
  // Only the accounts team is kept out of hiring. Anything else counts as
  // recruiting, including a role this list does not know about, so an account
  // created before these roles existed still has somewhere to land instead of
  // being bounced between two guards and locked out.
  return role !== "ACCOUNTS";
}

/** Where a person should land, given what they are allowed to see. */
export function homePathFor(role: string | undefined): string {
  return canSeeRecruiting(role) ? "/dashboard" : "/payroll";
}

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { canSeeRecruiting } from "@/lib/roles";

/**
 * Guards every page beneath this segment, including the client ones that have
 * no session check of their own. Candidate and interview records are not the
 * accounts team's to see.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeRecruiting(session.user.role)) redirect("/payroll");
  return <>{children}</>;
}

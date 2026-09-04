import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/roles";

export default async function Home() {
  try {
    const session = await auth();
    // Accounts staff start at payslips; everyone else at the dashboard.
    if (session) redirect(homePathFor(session.user.role));
  } catch {
    // AUTH_SECRET not configured or DB unavailable
  }
  redirect("/login");
}

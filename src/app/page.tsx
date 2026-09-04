import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/roles";

export default async function Home() {
  // redirect() reports where to go by throwing, so it must be called outside
  // the try: a catch here swallows that signal and the person is sent back to
  // the login page as though they had never signed in. Work out the
  // destination first, then leave.
  let destination = "/login";

  try {
    const session = await auth();
    // Accounts staff start at payslips; everyone else at the dashboard.
    if (session) destination = homePathFor(session.user.role);
  } catch {
    // No auth secret, or the database is unreachable: send them to sign in.
  }

  redirect(destination);
}

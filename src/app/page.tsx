import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  try {
    const session = await auth();
    if (session) redirect("/dashboard");
  } catch {
    // AUTH_SECRET not configured or DB unavailable
  }
  redirect("/login");
}

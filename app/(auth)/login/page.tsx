import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

type LoginPageProps = { searchParams: Promise<{ confirmation?: string | string[] }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const confirmation = Array.isArray(params.confirmation) ? params.confirmation[0] : params.confirmation;
  const notice = confirmation === "failed" ? "That confirmation link is invalid or has expired. Request a new email or try signing in." : undefined;
  return <AuthForm mode="login" notice={notice} />;
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string[]>>;
};

const emailSchema = z.string().trim().email("Enter a valid email address.").max(254);
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.");

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100, "Name is too long."),
  email: emailSchema,
  password: passwordSchema,
});

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });

export async function signUp(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const result = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      data: { name: result.data.name },
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return { status: "error", message: humanizeAuthError(error.message) };
  }

  if (!data.session) {
    return {
      status: "success",
      message: "Account created. Check your inbox to confirm your email, then sign in.",
    };
  }

  redirect("/dashboard");
}

export async function signIn(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const result = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    return { status: "error", message: "Email or password is incorrect." };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured || "http://localhost:3000";
}

function humanizeAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account may already exist for this email. Try signing in instead.";
  }
  if (normalized.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  return "We could not create the account. Please try again.";
}

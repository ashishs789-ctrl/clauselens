"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  signIn,
  signUp,
  type AuthActionState,
} from "@/app/(auth)/actions";

type AuthFormProps = { mode: "login" | "signup"; notice?: string };

export function AuthForm({ mode, notice }: AuthFormProps) {
  const action = mode === "signup" ? signUp : signIn;
  const initialAuthState: AuthActionState = { status: "idle", message: "" };
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(action, initialAuthState);
  const isSignup = mode === "signup";

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-7 shadow-2xl shadow-slate-300/40 backdrop-blur sm:p-9">
      <Link href="/" className="text-xl font-semibold tracking-tight text-slate-950">
        Clause<span className="text-[#5b4ee8]">Lens</span>
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-950">
        {isSignup ? "Create your workspace" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {isSignup ? "Start reviewing private PDFs with grounded AI." : "Sign in to access your private documents."}
      </p>

      {notice ? <div role="alert" className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800 ring-1 ring-amber-100">{notice}</div> : null}

      <form action={formAction} className="mt-8 space-y-5" noValidate>
        {isSignup ? <Field label="Full name" name="name" type="text" autoComplete="name" error={state.fieldErrors?.name?.[0]} /> : null}
        <Field label="Email address" name="email" type="email" autoComplete="email" error={state.fieldErrors?.email?.[0]} />
        <Field label="Password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} error={state.fieldErrors?.password?.[0]} hint={isSignup ? "Use 8–72 characters." : undefined} />

        {state.status !== "idle" ? (
          <div role={state.status === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm leading-5 ${state.status === "error" ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"}`}>
            {state.message}
          </div>
        ) : null}

        <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5b4ee8] px-5 py-3.5 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-[#4d41d6] disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-600">
        {isSignup ? "Already have an account?" : "New to ClauseLens?"}{" "}
        <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-[#5b4ee8] hover:underline">
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  error?: string;
  hint?: string;
};

function Field({ label, name, type, autoComplete, error, hint }: FieldProps) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-medium text-slate-800">{label}</label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#5b4ee8] focus:ring-4 focus:ring-indigo-100" />
      {error ? <p id={`${name}-error`} className="mt-1.5 text-xs text-red-600">{error}</p> : null}
      {!error && hint ? <p id={`${name}-hint`} className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

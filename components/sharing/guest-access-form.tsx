"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileLock2, LoaderCircle } from "lucide-react";

export function GuestAccessForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/share/${encodeURIComponent(token)}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Could not open this document.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not open this document.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e9e7ff_0,transparent_38%),#f5f6f9] px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-white bg-white/90 p-8 text-center shadow-2xl shadow-slate-300/40 backdrop-blur">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-[#5b4ee8]"><FileLock2 className="size-6" aria-hidden /></span>
        <p className="mt-6 text-xl font-semibold tracking-tight text-slate-950">Clause<span className="text-[#5b4ee8]">Lens</span></p>
        <h1 className="mt-5 text-2xl font-semibold text-slate-950">You’ve been invited to review a PDF</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter your name so the document owner can identify your comments. No account is required.</p>
        <form onSubmit={(event) => void submit(event)} className="mt-7 text-left">
          <label htmlFor="guest-name" className="mb-2 block text-sm font-medium text-slate-800">Your name</label>
          <input id="guest-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} autoComplete="name" required placeholder="e.g. Maya Shah" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#5b4ee8] focus:ring-4 focus:ring-indigo-100" />
          {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
          <button type="submit" disabled={pending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5b4ee8] px-5 py-3.5 font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-[#4d41d6] disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}{pending ? "Opening securely…" : "Open shared PDF"}</button>
        </form>
      </div>
    </main>
  );
}

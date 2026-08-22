import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { DocumentCard } from "@/components/dashboard/document-card";
import { EmptyDashboard } from "@/components/dashboard/empty-dashboard";
import { PdfUpload } from "@/components/documents/pdf-upload";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type DashboardPageProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = rawQuery?.trim().slice(0, 100) ?? "";

  const [{ data: profile }, documentsResult] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    getDocuments(supabase, query),
  ]);

  const displayName = profile?.name || user.user_metadata.name || user.email?.split("@")[0] || "there";
  const documents = documentsResult.data ?? [];

  return (
    <main className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-slate-950">Clause<span className="text-[#5b4ee8]">Lens</span></Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-medium text-slate-800">{displayName}</p><p className="text-xs text-slate-500">{user.email}</p></div>
            <form action={signOut}><button type="submit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign out</button></form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="text-sm font-semibold text-[#5b4ee8]">Your workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Good to see you, {firstName(displayName)}.</h1><p className="mt-2 text-sm text-slate-600">Review summaries, ask questions, and collaborate on your PDFs.</p></div>
          <PdfUpload />
        </div>

        <form action="/dashboard" method="get" className="relative mt-9 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="document-search" className="sr-only">Search PDFs by filename</label>
          <input id="document-search" name="q" defaultValue={query} placeholder="Search PDFs by filename…" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-28 text-sm outline-none focus:border-[#5b4ee8] focus:ring-4 focus:ring-indigo-100" />
          <button type="submit" className="absolute right-1.5 top-1.5 rounded-lg bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">Search</button>
        </form>

        {documentsResult.error ? (
          <div role="alert" className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">We could not load your documents. Please refresh and try again.</div>
        ) : documents.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{documents.map((document) => <DocumentCard key={document.id} document={document} />)}</div>
        ) : <div className="mt-8"><EmptyDashboard searching={Boolean(query)} /></div>}
      </section>
    </main>
  );
}

async function getDocuments(supabase: Awaited<ReturnType<typeof createClient>>, query: string) {
  let request = supabase
    .from("documents")
    .select("id, original_filename, created_at, summary, processing_status")
    .order("created_at", { ascending: false })
    .limit(100);
  if (query) request = request.ilike("original_filename", `%${escapeLike(query)}%`);
  return request;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

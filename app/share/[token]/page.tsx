import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, FileText, LockKeyhole, ShieldX } from "lucide-react";
import { PdfViewer } from "@/components/documents/pdf-viewer";
import { WorkspaceSidebar } from "@/components/documents/workspace-sidebar";
import { GuestAccessForm } from "@/components/sharing/guest-access-form";
import { resolveGuestSession, resolveShareLink } from "@/lib/sharing/access";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Shared PDF",
  description: "A private PDF shared through ClauseLens.",
  robots: { index: false, follow: false },
  openGraph: { title: "Shared PDF · ClauseLens", description: "A private PDF shared through ClauseLens.", images: [] },
  twitter: { title: "Shared PDF · ClauseLens", description: "A private PDF shared through ClauseLens.", images: [] },
};
export const dynamic = "force-dynamic";

type SharedPageProps = { params: Promise<{ token: string }> };

export default async function SharedDocumentPage({ params }: SharedPageProps) {
  const { token } = await params;
  const shareLink = await resolveShareLink(token);
  if (!shareLink) return <UnavailableLink />;

  const access = await resolveGuestSession(shareLink.document_id);
  if (!access || access.shareLink.id !== shareLink.id) return <GuestAccessForm token={token} />;

  const admin = createAdminClient();
  const { data: document } = await admin
    .from("documents")
    .select("id, original_filename, size_bytes, page_count, summary, processing_status, created_at")
    .eq("id", shareLink.document_id)
    .maybeSingle();
  if (!document) return <UnavailableLink />;

  const fileUrl = `/api/guest/file?documentId=${encodeURIComponent(document.id)}`;
  return (
    <main className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="min-w-0"><Link href="/" className="text-lg font-semibold tracking-tight text-slate-950">Clause<span className="text-[#5b4ee8]">Lens</span></Link><p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole className="size-3" aria-hidden />Secure guest review</p></div>
          <div className="max-w-[45%] text-right"><p className="truncate text-sm font-semibold text-slate-800">{access.guest.display_name}</p><p className="text-xs text-slate-500">Invited reviewer</p></div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div className="max-w-5xl"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-indigo-50 text-[#5b4ee8]"><FileText className="size-4" aria-hidden /></span><div className="min-w-0"><h1 className="truncate font-semibold text-slate-950">{document.original_filename}</h1><p className="text-xs font-medium text-[#5b4ee8]">AI summary</p></div></div><p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">{document.summary || "The document summary is still being prepared."}</p></div>
            <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 md:max-w-64 md:justify-end"><div className="flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden /><dt className="sr-only">Uploaded</dt><dd>{formatDate(document.created_at)}</dd></div><div className="flex items-center gap-1.5"><FileText className="size-3.5" aria-hidden /><dt className="sr-only">Pages</dt><dd>{document.page_count ? `${document.page_count} pages` : "Processing"}</dd></div></dl>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:h-[calc(100vh-15rem)] lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_380px]">
          <PdfViewer documentId={document.id} filename={document.original_filename} pageCount={document.page_count} fileUrl={fileUrl} />
          <WorkspaceSidebar documentId={document.id} />
        </div>
      </div>
    </main>
  );
}

function UnavailableLink() {
  return <main className="grid min-h-screen place-items-center bg-[#f6f7f9] px-5"><div className="max-w-md text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600"><ShieldX className="size-6" aria-hidden /></span><h1 className="mt-5 text-2xl font-semibold text-slate-950">This share link is unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">It may have expired, been revoked by the owner, or been copied incorrectly.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Go to ClauseLens</Link></div></main>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

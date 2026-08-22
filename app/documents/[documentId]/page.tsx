import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleAlert, Clock3, FileText, LoaderCircle, LockKeyhole } from "lucide-react";
import { PdfViewer } from "@/components/documents/pdf-viewer";
import { ProcessingRefresh } from "@/components/documents/processing-refresh";
import { RetryProcessing } from "@/components/documents/retry-processing";
import { WorkspaceSidebar } from "@/components/documents/workspace-sidebar";
import { ShareDialog } from "@/components/sharing/share-dialog";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Document workspace",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type DocumentPageProps = { params: Promise<{ documentId: string }> };

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { documentId } = await params;
  if (!isUuid(documentId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: document } = await supabase
    .from("documents")
    .select("id, original_filename, size_bytes, page_count, summary, processing_status, processing_error, created_at")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) notFound();

  const processing = ["uploaded", "extracting", "summarizing"].includes(document.processing_status);
  return (
    <main className="min-h-screen bg-[#f6f7f9]">
      {processing ? <ProcessingRefresh /> : null}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Back to dashboard"><ArrowLeft className="size-4" aria-hidden /></Link>
            <div className="min-w-0"><h1 className="truncate font-semibold text-slate-950">{document.original_filename}</h1><p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><LockKeyhole className="size-3" aria-hidden />Private document</p></div>
          </div>
          <ShareDialog documentId={document.id} />
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div className="max-w-5xl"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-indigo-50 text-[#5b4ee8]"><FileText className="size-4" aria-hidden /></span><h2 className="font-semibold text-slate-950">AI summary</h2><StatusBadge status={document.processing_status} /></div>
              <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">{document.summary || statusCopy(document.processing_status)}</p>
            </div>
            <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 md:max-w-64 md:justify-end">
              <div className="flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden /><dt className="sr-only">Uploaded</dt><dd>{formatDate(document.created_at)}</dd></div>
              <div className="flex items-center gap-1.5"><FileText className="size-3.5" aria-hidden /><dt className="sr-only">Pages</dt><dd>{document.page_count ? `${document.page_count} pages` : "Page count pending"}</dd></div>
              <div className="flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden /><dt className="sr-only">Size</dt><dd>{formatBytes(document.size_bytes)}</dd></div>
            </dl>
          </div>
        </section>

        {document.processing_status === "failed" ? (
          <section className="mt-5 flex flex-col justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden /><div><h2 className="font-semibold text-red-900">PDF processing needs attention</h2><p className="mt-1 text-sm leading-6 text-red-700">{document.processing_error || "The AI pipeline did not finish successfully."}</p></div></div><RetryProcessing documentId={document.id} /></section>
        ) : null}

        <div className="mt-5 grid gap-5 lg:h-[calc(100vh-19rem)] lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_380px]">
          <PdfViewer documentId={document.id} filename={document.original_filename} pageCount={document.page_count} />
          <WorkspaceSidebar documentId={document.id} />
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const processing = ["uploaded", "extracting", "summarizing"].includes(status);
  return <span className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status === "ready" ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{processing ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : null}{statusLabel(status)}</span>;
}

function statusLabel(status: string) {
  return ({ uploaded: "Queued", extracting: "Extracting", summarizing: "Summarizing", ready: "Ready", failed: "Failed" } as Record<string, string>)[status] || "Processing";
}

function statusCopy(status: string) {
  if (status === "failed") return "A summary is unavailable until processing succeeds.";
  if (status === "summarizing") return "The document text is ready. ClauseLens is creating a concise summary now.";
  return "ClauseLens is securely extracting and organizing this PDF. The summary will appear automatically.";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

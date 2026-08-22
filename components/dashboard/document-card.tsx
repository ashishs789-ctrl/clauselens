import Link from "next/link";
import { FileText, LoaderCircle, TriangleAlert } from "lucide-react";

type DocumentCardProps = {
  document: {
    id: string;
    original_filename: string;
    created_at: string;
    summary: string | null;
    processing_status: "uploaded" | "extracting" | "summarizing" | "ready" | "failed";
  };
};

const statusLabels = {
  uploaded: "Queued",
  extracting: "Extracting text",
  summarizing: "Writing summary",
  ready: "Ready",
  failed: "Processing failed",
};

export function DocumentCard({ document }: DocumentCardProps) {
  const processing = !["ready", "failed"].includes(document.processing_status);
  return (
    <Link href={`/documents/${document.id}`} className="group flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-200/70">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-[#5b4ee8]"><FileText className="size-5" aria-hidden /></span>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${document.processing_status === "failed" ? "bg-red-50 text-red-700" : document.processing_status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {processing ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : document.processing_status === "failed" ? <TriangleAlert className="size-3" aria-hidden /> : null}
          {statusLabels[document.processing_status]}
        </span>
      </div>
      <h2 className="mt-5 line-clamp-2 font-semibold leading-6 text-slate-950 group-hover:text-[#5144d8]">{document.original_filename}</h2>
      <p className="mt-1 text-xs text-slate-500">Uploaded {formatDate(document.created_at)}</p>
      <p className="mt-5 line-clamp-4 text-sm leading-6 text-slate-600">
        {document.summary || (document.processing_status === "failed" ? "We could not process this PDF. Open it to review the error and retry." : "Your AI summary will appear here when processing is complete.")}
      </p>
      <span className="mt-auto pt-5 text-sm font-semibold text-[#5b4ee8]">Open workspace →</span>
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

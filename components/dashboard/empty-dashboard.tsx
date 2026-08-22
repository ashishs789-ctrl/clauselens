import Link from "next/link";
import { FileUp, SearchX } from "lucide-react";

export function EmptyDashboard({ searching }: { searching: boolean }) {
  return (
    <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-[#5b4ee8]">
          {searching ? <SearchX className="size-6" aria-hidden /> : <FileUp className="size-6" aria-hidden />}
        </span>
        <h2 className="mt-5 text-xl font-semibold text-slate-950">{searching ? "No matching PDFs" : "Upload your first PDF"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {searching ? "Try another filename or clear your search." : "Your documents stay private until you create a guest link."}
        </p>
        {searching ? <Link href="/dashboard" className="mt-5 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear search</Link> : <p className="mt-5 text-xs font-medium uppercase tracking-wider text-slate-400">Use Upload PDF above to begin</p>}
      </div>
    </div>
  );
}

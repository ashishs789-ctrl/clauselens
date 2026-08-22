import Link from "next/link";
import { FileSearch, MessageSquareText, ShieldCheck } from "lucide-react";

const capabilities = [
  { icon: FileSearch, label: "Concise summaries with page-aware retrieval" },
  { icon: MessageSquareText, label: "Grounded document chat and shared comments" },
  { icon: ShieldCheck, label: "Private files and revocable guest access" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ebe9ff_0,transparent_38%),linear-gradient(135deg,#f8f9fb,#f1f3f8)] px-6 py-8 sm:px-10 lg:px-16">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/" className="text-xl font-semibold tracking-tight text-slate-950">
          Clause<span className="text-[#5b4ee8]">Lens</span>
        </Link>
        <div className="flex items-center gap-3 text-sm font-medium">
          <Link href="/login" className="rounded-full px-4 py-2 text-slate-700 hover:bg-white/70">Sign in</Link>
          <Link href="/signup" className="rounded-full bg-slate-950 px-5 py-2.5 text-white shadow-sm hover:bg-slate-800">Create account</Link>
        </div>
      </nav>

      <section className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-7xl items-center gap-14 py-16 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#5b4ee8]">PDF intelligence workspace</p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
            Find the answer inside every document.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
            Upload private PDFs, get useful summaries, ask evidence-backed questions, and invite others to review in one focused workspace.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-[#5b4ee8] px-6 py-3.5 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-[#4d41d6]">Start with a PDF</Link>
            <Link href="/login" className="rounded-xl border border-slate-300 bg-white/80 px-6 py-3.5 font-semibold text-slate-800 hover:bg-white">Open dashboard</Link>
          </div>
          <ul className="mt-12 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-[#5b4ee8]" aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-indigo-200/60 to-cyan-100/60 blur-2xl" />
          <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 p-4 shadow-2xl shadow-slate-300/50 backdrop-blur">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div><p className="font-semibold text-slate-900">Employment_Agreement.pdf</p><p className="mt-1 text-xs text-slate-500">18 pages · Ready</p></div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Private</span>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-bold uppercase tracking-wider text-[#5b4ee8]">AI summary</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">This agreement defines the employee’s role, compensation, confidentiality duties, and termination terms. Key post-employment restrictions continue for twelve months.</p>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-sm font-medium">What happens after termination?</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">Confidentiality survives termination, while the non-solicitation restriction applies for 12 months.</p>
                <p className="mt-3 text-xs font-medium text-indigo-300">Sources: pages 11–12</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

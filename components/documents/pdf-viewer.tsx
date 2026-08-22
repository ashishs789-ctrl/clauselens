"use client";

import { useState } from "react";
import { Download, Maximize2, Minus, Plus, RotateCw } from "lucide-react";

type PdfViewerProps = {
  documentId: string;
  filename: string;
  pageCount: number | null;
  fileUrl?: string;
};

export function PdfViewer({ documentId, filename, pageCount, fileUrl: suppliedFileUrl }: PdfViewerProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [reloadKey, setReloadKey] = useState(0);
  const fileUrl = suppliedFileUrl || `/api/documents/${documentId}/file`;
  const viewerUrl = `${fileUrl}#page=${page}&zoom=${zoom}`;

  function updatePage(value: number) {
    setPage(Math.max(1, pageCount ? Math.min(value, pageCount) : value));
  }

  return (
    <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-800 shadow-sm lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-2.5 text-white">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Zoom out"><Minus className="size-4" aria-hidden /></button>
          <span className="min-w-12 text-center text-xs font-semibold text-slate-300">{zoom}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Zoom in"><Plus className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => setZoom(100)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Reset zoom"><Maximize2 className="size-4" aria-hidden /></button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300">
          <label htmlFor="pdf-page" className="sr-only">PDF page</label>
          <input id="pdf-page" type="number" min={1} max={pageCount ?? undefined} value={page} onChange={(event) => updatePage(Number(event.target.value) || 1)} className="w-14 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-center text-white outline-none focus:border-indigo-400" />
          <span>of {pageCount ?? "?"}</span>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Reload PDF"><RotateCw className="size-4" aria-hidden /></button>
          <a href={`${fileUrl}${fileUrl.includes("?") ? "&" : "?"}download=1`} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label={`Download ${filename}`}><Download className="size-4" aria-hidden /></a>
        </div>
      </div>
      <iframe key={reloadKey} src={viewerUrl} title={`PDF viewer for ${filename}`} className="min-h-[65vh] w-full flex-1 bg-slate-700" />
    </section>
  );
}

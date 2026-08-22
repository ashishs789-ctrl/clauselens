"use client";

import { useState } from "react";
import { Check, Copy, Link2, LoaderCircle, Share2, Trash2, X } from "lucide-react";

type ShareLink = { id: string; created_at: string; expires_at: string | null; revoked_at: string | null };

export function ShareDialog({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [createdUrl, setCreatedUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function loadLinks() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/share-links`);
      const payload = await response.json() as { links?: ShareLink[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Could not load sharing settings.");
      setLinks(payload.links || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load sharing settings.");
    } finally {
      setPending(false);
    }
  }

  function openDialog() {
    setOpen(true);
    void loadLinks();
  }

  async function createLink() {
    setPending(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch(`/api/documents/${documentId}/share-links`, { method: "POST" });
      const payload = await response.json() as { link?: ShareLink & { url: string }; error?: { message?: string } };
      if (!response.ok || !payload.link) throw new Error(payload.error?.message || "Could not create a share link.");
      setCreatedUrl(payload.link.url);
      setLinks((current) => [payload.link as ShareLink, ...current]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create a share link.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  async function revokeLink(linkId: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/share-links/${linkId}`, { method: "DELETE" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Could not revoke this link.");
      setLinks((current) => current.map((link) => link.id === linkId ? { ...link, revoked_at: new Date().toISOString() } : link));
      setCreatedUrl("");
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke this link.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Share2 className="size-4" aria-hidden /><span className="hidden sm:inline">Share</span></button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-5 py-10 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><h2 id="share-title" className="text-xl font-semibold text-slate-950">Share this PDF</h2><p className="mt-1 text-sm leading-6 text-slate-600">Anyone with an active link can view, comment, and use document chat without an account.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close sharing dialog"><X className="size-4" aria-hidden /></button></div>

            {createdUrl ? <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><label htmlFor="share-url" className="text-xs font-bold uppercase tracking-wider text-[#5b4ee8]">New link — copy it now</label><div className="mt-2 flex gap-2"><input id="share-url" readOnly value={createdUrl} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700" /><button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#5b4ee8] px-3 py-2 text-sm font-semibold text-white">{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copied" : "Copy"}</button></div><p className="mt-2 text-xs text-indigo-700">For security, the complete link cannot be retrieved again after this dialog closes.</p></div> : null}

            {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button type="button" onClick={() => void createLink()} disabled={pending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5b4ee8] px-4 py-3 font-semibold text-white hover:bg-[#4d41d6] disabled:cursor-wait disabled:opacity-60">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}{pending ? "Working…" : "Generate new share link"}</button>

            <div className="mt-6 border-t border-slate-200 pt-5"><h3 className="text-sm font-semibold text-slate-900">Link history</h3>{pending && !links.length ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : links.length ? <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">{links.map((link) => { const active = !link.revoked_at && (!link.expires_at || new Date(link.expires_at) > new Date()); return <li key={link.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"><div><p className="text-sm font-medium text-slate-800">Created {formatDate(link.created_at)}</p><p className={`mt-0.5 text-xs ${active ? "text-emerald-600" : "text-slate-400"}`}>{active ? `Active until ${formatDate(link.expires_at!)}` : link.revoked_at ? "Revoked" : "Expired"}</p></div>{active ? <button type="button" disabled={pending} onClick={() => void revokeLink(link.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Revoke share link"><Trash2 className="size-4" aria-hidden /></button> : null}</li>; })}</ul> : <p className="mt-3 text-sm text-slate-500">No share links created yet.</p>}</div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

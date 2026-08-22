"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageSquare, Send, Sparkles } from "lucide-react";
import { ChatPanel } from "@/components/documents/chat-panel";

type Panel = "comments" | "chat";
type Comment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { actorKey: string; name: string; kind: "owner" | "guest" };
};

export function WorkspaceSidebar({ documentId }: { documentId: string }) {
  const [panel, setPanel] = useState<Panel>("comments");
  return (
    <aside className="flex min-h-96 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
      <div className="grid grid-cols-2 border-b border-slate-200 p-1.5">
        <Tab active={panel === "comments"} onClick={() => setPanel("comments")} icon={MessageSquare}>Comments</Tab>
        <Tab active={panel === "chat"} onClick={() => setPanel("chat")} icon={Sparkles}>Ask AI</Tab>
      </div>
      {panel === "comments" ? <CommentsPanel documentId={documentId} /> : <ChatPanel documentId={documentId} />}
    </aside>
  );
}

function CommentsPanel({ documentId }: { documentId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [currentActor, setCurrentActor] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const fetchComments = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const response = await fetch(`/api/documents/${documentId}/comments`, { cache: "no-store" });
        const payload = await response.json() as { comments?: Comment[]; currentActor?: string; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || "Could not load comments.");
        if (active) {
          setComments(payload.comments || []);
          setCurrentActor(payload.currentActor || "");
          setError("");
        }
      } catch (fetchError) {
        if (active) setError(fetchError instanceof Error ? fetchError.message : "Could not load comments.");
      } finally {
        if (active && showLoading) setLoading(false);
      }
    };

    const initialTimer = window.setTimeout(() => void fetchComments(true), 0);
    const pollTimer = window.setInterval(() => void fetchComments(false), 10_000);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [documentId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = body.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: content }),
      });
      const payload = await response.json() as { comment?: Comment; error?: { message?: string } };
      if (!response.ok || !payload.comment) throw new Error(payload.error?.message || "Could not save this comment.");
      setComments((current) => [...current, payload.comment!]);
      setBody("");
      window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 0);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save this comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        {loading ? <div className="grid h-full min-h-52 place-items-center"><div className="text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin text-[#5b4ee8]" aria-hidden />Loading comments…</div></div> : comments.length ? (
          <ol className="space-y-4">{comments.map((comment) => {
            const mine = comment.author.actorKey === currentActor;
            return <li key={comment.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><article className={`max-w-[88%] rounded-2xl px-4 py-3 ${mine ? "rounded-br-md bg-[#5b4ee8] text-white" : "rounded-bl-md bg-slate-100 text-slate-800"}`}><div className="flex items-center gap-2"><p className={`truncate text-xs font-bold ${mine ? "text-indigo-100" : "text-slate-600"}`}>{mine ? "You" : comment.author.name}{comment.author.kind === "owner" && !mine ? " · Owner" : ""}</p><time dateTime={comment.createdAt} className={`shrink-0 text-[10px] ${mine ? "text-indigo-200" : "text-slate-400"}`}>{formatTime(comment.createdAt)}</time></div><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p></article></li>;
          })}</ol>
        ) : <div className="grid h-full min-h-52 place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-[#5b4ee8]"><MessageSquare className="size-5" aria-hidden /></span><h2 className="mt-4 font-semibold text-slate-950">Start the discussion</h2><p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">Comments are visible to the owner and every reviewer with active access.</p></div></div>}
      </div>
      <form onSubmit={(event) => void submit(event)} className="border-t border-slate-200 bg-slate-50 p-4">
        {error ? <p role="alert" className="mb-2 text-xs leading-5 text-red-600">{error}</p> : null}
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-[#5b4ee8] focus-within:ring-4 focus-within:ring-indigo-100">
          <label htmlFor={`comment-${documentId}`} className="sr-only">Add a comment</label>
          <textarea id={`comment-${documentId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={5_000} rows={2} placeholder="Add a comment…" className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-5 outline-none" />
          <button type="submit" disabled={!body.trim() || submitting} className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#5b4ee8] text-white hover:bg-[#4d41d6] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Post comment">{submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}</button>
        </div>
        <p className="mt-1.5 text-right text-[10px] text-slate-400">{body.length.toLocaleString()} / 5,000</p>
      </form>
    </>
  );
}

function Tab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof MessageSquare; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}><Icon className="size-4" aria-hidden />{children}</button>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

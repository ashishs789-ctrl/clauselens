"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Send, Sparkles } from "lucide-react";

type Citation = { pageStart: number; pageEnd: number };
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
};
type StreamEvent =
  | { type: "user" | "done"; message: ChatMessage }
  | { type: "delta"; text: string }
  | { type: "error"; message: string };

export function ChatPanel({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const tempIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/chat`, { cache: "no-store" });
        const payload = await response.json() as { messages?: ChatMessage[]; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || "Could not load chat history.");
        if (active) setMessages(payload.messages || []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load chat history.");
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [documentId]);

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || streaming) return;

    tempIdRef.current += 1;
    const userTempId = `temp-user-${tempIdRef.current}`;
    const assistantTempId = `temp-assistant-${tempIdRef.current}`;
    setMessages((current) => [...current,
      { id: userTempId, role: "user", content, citations: [], createdAt: "" },
      { id: assistantTempId, role: "assistant", content: "", citations: [], createdAt: "" },
    ]);
    setQuestion("");
    setError("");
    setStreaming(true);
    scrollSoon();

    try {
      const response = await fetch(`/api/documents/${documentId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: content }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json() as { error?: { message?: string } };
        throw new Error(payload.error?.message || "Could not answer this question.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handleStreamEvent(JSON.parse(line) as StreamEvent, userTempId, assistantTempId);
        }
        scrollSoon();
        if (done) break;
      }
      if (buffer.trim()) handleStreamEvent(JSON.parse(buffer) as StreamEvent, userTempId, assistantTempId);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Could not answer this question.");
      setMessages((current) => current.filter((message) => message.id !== assistantTempId || message.content));
    } finally {
      setStreaming(false);
      scrollSoon();
    }
  }

  function handleStreamEvent(event: StreamEvent, userTempId: string, assistantTempId: string) {
    if (event.type === "user") {
      setMessages((current) => current.map((message) => message.id === userTempId ? event.message : message));
    } else if (event.type === "delta") {
      setMessages((current) => current.map((message) => message.id === assistantTempId ? { ...message, content: message.content + event.text } : message));
    } else if (event.type === "done") {
      setMessages((current) => current.map((message) => message.id === assistantTempId ? event.message : message));
    } else if (event.type === "error") {
      setError(event.message);
    }
  }

  function scrollSoon() {
    window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 0);
  }

  return (
    <>
      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        {loading ? <div className="grid h-full min-h-52 place-items-center"><div className="text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin text-[#5b4ee8]" aria-hidden />Loading conversation…</div></div> : messages.length ? (
          <ol className="space-y-4">{messages.map((message) => <li key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><article className={`max-w-[92%] rounded-2xl px-4 py-3 ${message.role === "user" ? "rounded-br-md bg-slate-950 text-white" : "rounded-bl-md border border-indigo-100 bg-indigo-50 text-slate-800"}`}><p className={`text-[10px] font-bold uppercase tracking-wider ${message.role === "user" ? "text-slate-400" : "text-[#5b4ee8]"}`}>{message.role === "user" ? "You" : "ClauseLens AI"}</p>{message.content ? <div className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6"><SafeMarkdown content={message.content} /></div> : <p className="mt-2 flex items-center gap-2 text-sm text-indigo-500"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />Searching the PDF…</p>}{message.citations.length ? <div className="mt-3 flex flex-wrap gap-1.5">{message.citations.map((citation) => <span key={`${citation.pageStart}-${citation.pageEnd}`} className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-100">{citation.pageStart === citation.pageEnd ? `Page ${citation.pageStart}` : `Pages ${citation.pageStart}–${citation.pageEnd}`}</span>)}</div> : null}</article></li>)}</ol>
        ) : <div className="grid h-full min-h-52 place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-indigo-50 text-[#5b4ee8]"><Sparkles className="size-5" aria-hidden /></span><h2 className="mt-4 font-semibold text-slate-950">Ask about this PDF</h2><p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">Answers use relevant document passages and include page references when available.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{["What are the key obligations?", "What dates matter?"].map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-200 hover:text-[#5b4ee8]">{suggestion}</button>)}</div></div></div>}
      </div>
      <form onSubmit={(event) => void ask(event)} className="border-t border-slate-200 bg-slate-50 p-4">
        {error ? <p role="alert" className="mb-2 text-xs leading-5 text-red-600">{error}</p> : null}
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-[#5b4ee8] focus-within:ring-4 focus-within:ring-indigo-100">
          <label htmlFor={`chat-${documentId}`} className="sr-only">Ask a question about this PDF</label>
          <textarea id={`chat-${documentId}`} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2_000} rows={2} placeholder="Ask a question about this PDF…" disabled={streaming} className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-5 outline-none disabled:opacity-60" />
          <button type="submit" disabled={!question.trim() || streaming} className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#5b4ee8] text-white hover:bg-[#4d41d6] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Ask question">{streaming ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}</button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400">Answers are grounded in retrieved PDF text. Verify important details.</p>
      </form>
    </>
  );
}

function SafeMarkdown({ content }: { content: string }) {
  const parts = content.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);

  return parts.map((part, index): ReactNode => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-white/70 px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

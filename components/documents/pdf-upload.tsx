"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, LoaderCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type UploadStage = "idle" | "uploading" | "extracting" | "complete" | "error";

export function PdfUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [stage, setStage] = useState<UploadStage>("idle");
  const [filename, setFilename] = useState("");
  const [message, setMessage] = useState("");
  const busy = stage === "uploading" || stage === "extracting";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFilename(file.name);
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      return fail("Choose a PDF file with a .pdf extension.");
    }

    try {
      setStage("uploading");
      setMessage("Creating a secure private upload…");
      const intentResponse = await fetch("/api/documents/upload-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const intent = await readJson(intentResponse);
      if (!intentResponse.ok) throw new Error(intent.error?.message || "Could not prepare the upload.");
      if (!intent.documentId || !intent.path || !intent.token) throw new Error("The secure upload response was incomplete.");

      setMessage("Uploading PDF to private storage…");
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("pdfs").uploadToSignedUrl(intent.path, intent.token, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError) throw new Error("The secure upload failed. Please try again.");

      setStage("extracting");
      setMessage("Extracting text and creating the AI summary…");
      const processResponse = await fetch(`/api/documents/${intent.documentId}/process`, { method: "POST" });
      const processed = await readJson(processResponse);
      if (!processResponse.ok) throw new Error(processed.error?.message || "PDF processing failed.");

      setStage("complete");
      setMessage("PDF is ready to review.");
      router.refresh();
      window.setTimeout(() => reset(), 3500);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Upload failed. Please try again.");
      router.refresh();
    }
  }

  function fail(value: string) {
    setStage("error");
    setMessage(value);
  }

  function reset() {
    setStage("idle");
    setFilename("");
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} disabled={busy} aria-label="Choose a PDF to upload" />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5b4ee8] px-5 py-3 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-[#4d41d6] disabled:cursor-wait disabled:opacity-70">
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
        {busy ? "Processing…" : "Upload PDF"}
      </button>

      {stage !== "idle" ? (
        <div role={stage === "error" ? "alert" : "status"} aria-live="polite" className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-400/30">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${stage === "error" ? "bg-red-50 text-red-600" : stage === "complete" ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-[#5b4ee8]"}`}>
              {stage === "complete" ? <CheckCircle2 className="size-5" aria-hidden /> : busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{filename || "PDF upload"}</p><p className={`mt-1 text-sm leading-5 ${stage === "error" ? "text-red-600" : "text-slate-600"}`}>{message}</p></div>
            {!busy ? <button type="button" onClick={reset} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss upload message"><X className="size-4" aria-hidden /></button> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

type ApiPayload = {
  documentId?: string;
  path?: string;
  token?: string;
  error?: { message?: string };
};

async function readJson(response: Response): Promise<ApiPayload> {
  try {
    return await response.json() as ApiPayload;
  } catch {
    return {};
  }
}

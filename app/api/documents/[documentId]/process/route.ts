import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { embedDocuments } from "@/lib/ai/gemini";
import { summarizeDocument } from "@/lib/ai/summary";
import { getServerEnv } from "@/lib/env";
import { chunkPages } from "@/lib/pdf/chunk";
import { hasPdfSignature, normalizePageText } from "@/lib/pdf/validate";
import { isSameOriginMutation } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ documentId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginMutation(request)) return errorResponse("Invalid request origin.", 403);
  const { documentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return errorResponse("Invalid document identifier.", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Authentication required.", 401);

  const { data: document } = await supabase
    .from("documents")
    .select("id, storage_path, size_bytes, processing_status")
    .eq("id", documentId)
    .maybeSingle();
  if (!document) return errorResponse("Document not found.", 404);
  if (document.processing_status === "ready") return NextResponse.json({ documentId, status: "ready" });
  if (["extracting", "summarizing"].includes(document.processing_status)) {
    return errorResponse("This document is already being processed.", 409);
  }

  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("documents")
    .update({ processing_status: "extracting", processing_error: null })
    .eq("id", documentId)
    .in("processing_status", ["uploaded", "failed"])
    .select("id")
    .maybeSingle();
  if (!claimed) return errorResponse("This document is already being processed.", 409);

  try {
    const env = getServerEnv();
    const { data: storedFile, error: downloadError } = await admin.storage.from("pdfs").download(document.storage_path);
    if (downloadError || !storedFile) throw new Error("Private PDF download failed.");

    const bytes = new Uint8Array(await storedFile.arrayBuffer());
    if (bytes.byteLength > env.MAX_PDF_SIZE_MB * 1024 * 1024) {
      throw new InvalidPdfError(`PDFs must be ${env.MAX_PDF_SIZE_MB} MB or smaller.`);
    }
    if (!hasPdfSignature(bytes)) throw new InvalidPdfError("The uploaded file is not a valid PDF.");

    const extracted = await extractText(bytes, { mergePages: false });
    if (extracted.totalPages > env.MAX_PDF_PAGES) {
      throw new InvalidPdfError(`PDFs may contain at most ${env.MAX_PDF_PAGES} pages.`);
    }

    const pages = extracted.text.map(normalizePageText);
    const extractedCharacterCount = pages.reduce((total, page) => total + page.length, 0);
    if (extractedCharacterCount < 80) {
      throw new ProcessingError("Very little selectable text was found. Image-only PDFs are not yet supported.");
    }

    const chunks = chunkPages(pages);
    if (!chunks.length) throw new ProcessingError("No readable text could be extracted from this PDF.");

    await admin.from("document_chunks").delete().eq("document_id", documentId);
    const embeddings = await embedDocuments(chunks.map((chunk) => chunk.content));
    for (let offset = 0; offset < chunks.length; offset += 50) {
      const batch = chunks.slice(offset, offset + 50).map((chunk, index) => ({
        document_id: documentId,
        chunk_index: chunk.chunkIndex,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: embeddings[offset + index],
      }));
      const { error: chunkError } = await admin.from("document_chunks").insert(batch);
      if (chunkError) throw new Error("Document chunk storage failed.");
    }

    await admin.from("documents").update({ processing_status: "summarizing" }).eq("id", documentId);
    const summary = await summarizeDocument(chunks);
    const { error: readyError } = await admin.from("documents").update({
      page_count: extracted.totalPages,
      summary,
      processing_status: "ready",
      processing_error: null,
    }).eq("id", documentId);
    if (readyError) throw new Error("Document completion update failed.");

    return NextResponse.json({ documentId, status: "ready", summary, pageCount: extracted.totalPages });
  } catch (error) {
    if (error instanceof InvalidPdfError) {
      await Promise.all([
        admin.storage.from("pdfs").remove([document.storage_path]),
        admin.from("documents").delete().eq("id", documentId),
      ]);
      return errorResponse(error.message, 422);
    }

    const safeMessage = error instanceof ProcessingError
      ? error.message
      : "Processing failed. Your PDF is safe; please retry in a moment.";
    await admin.from("documents").update({
      processing_status: "failed",
      processing_error: safeMessage,
    }).eq("id", documentId);
    console.error("PDF processing failed", { documentId, error: error instanceof Error ? error.name : "UnknownError" });
    return errorResponse(safeMessage, 500);
  }
}

class InvalidPdfError extends Error {}
class ProcessingError extends Error {}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

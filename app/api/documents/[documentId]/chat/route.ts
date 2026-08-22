import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGroundedPrompt, CHAT_SYSTEM_PROMPT, citationList, retrievalQuery } from "@/lib/ai/chat";
import { embedQuery, generateTextStream } from "@/lib/ai/gemini";
import { resolveDocumentAccess, type DocumentAccess } from "@/lib/sharing/document-access";
import { isSameOriginMutation } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

const questionSchema = z.object({
  question: z.string().trim().min(2, "Enter a question.").max(2_000, "Question must be 2,000 characters or fewer."),
});

type RouteContext = { params: Promise<{ documentId: string }> };
type MessageRow = { id: string; role: "user" | "assistant"; content: string; citations: unknown; created_at: string };
type RetrievedChunk = { content: string; page_start: number; page_end: number; similarity: number };

export async function GET(_request: Request, { params }: RouteContext) {
  const { documentId } = await params;
  const access = await resolveDocumentAccess(documentId);
  if (!access) return errorResponse("Document access required.", 403);

  const admin = createAdminClient();
  const session = await getOrCreateSession(access);
  if (!session) return errorResponse("Could not open a chat session.", 500);

  const { data, error } = await admin
    .from("chat_messages")
    .select("id, role, content, citations, created_at")
    .eq("chat_session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return errorResponse("Could not load chat history.", 500);
  return NextResponse.json({ messages: (data || []).map(publicMessage) });
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginMutation(request)) return errorResponse("Invalid request origin.", 403);
  const { documentId } = await params;
  const access = await resolveDocumentAccess(documentId);
  if (!access) return errorResponse("Document access required.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }
  const parsed = questionSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Invalid question.", 400);

  const admin = createAdminClient();
  const { data: document } = await admin.from("documents").select("processing_status").eq("id", documentId).maybeSingle();
  if (!document || document.processing_status !== "ready") {
    return errorResponse("Document chat is available after PDF processing finishes.", 409);
  }

  const session = await getOrCreateSession(access);
  if (!session) return errorResponse("Could not open a chat session.", 500);
  if (await isRateLimited(session.id)) {
    return errorResponse("You’ve reached the chat limit. Please wait a few minutes and try again.", 429);
  }

  const { data: recentRows } = await admin
    .from("chat_messages")
    .select("id, role, content, citations, created_at")
    .eq("chat_session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((recentRows || []) as MessageRow[]).reverse().map((message) => ({ role: message.role, content: message.content }));

  let chunks: RetrievedChunk[];
  try {
    const queryVector = await embedQuery(retrievalQuery(parsed.data.question, history));
    const { data: matches, error: retrievalError } = await admin.rpc("match_document_chunks", {
      query_embedding: queryVector,
      match_document_id: documentId,
      match_count: 8,
    });
    if (retrievalError || !matches?.length) return errorResponse("No searchable PDF text is available for this question.", 422);
    chunks = (matches as RetrievedChunk[]).filter((match) => match.content && Number.isFinite(match.similarity)).slice(0, 8);
  } catch {
    return errorResponse("Document retrieval failed. Please try again.", 502);
  }

  const citations = citationList(chunks);
  const { data: userMessage, error: userMessageError } = await admin.from("chat_messages").insert({
    chat_session_id: session.id,
    role: "user",
    content: parsed.data.question,
    citations: [],
  }).select("id, role, content, citations, created_at").single();
  if (userMessageError || !userMessage) return errorResponse("Could not save your question.", 500);

  const prompt = buildGroundedPrompt(parsed.data.question, history, chunks);
  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "user", message: publicMessage(userMessage as MessageRow) });
      let answer = "";
      try {
        const stream = await generateTextStream(prompt, CHAT_SYSTEM_PROMPT);
        for await (const chunk of stream) {
          const delta = chunk.text || "";
          if (!delta) continue;
          answer += delta;
          send({ type: "delta", text: delta });
        }
        answer = answer.trim();
        if (!answer) throw new Error("Empty model response");

        const { data: assistantMessage, error: assistantError } = await admin.from("chat_messages").insert({
          chat_session_id: session.id,
          role: "assistant",
          content: answer,
          citations,
        }).select("id, role, content, citations, created_at").single();
        if (assistantError || !assistantMessage) throw new Error("Assistant message persistence failed");
        await admin.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", session.id);
        send({ type: "done", message: publicMessage(assistantMessage as MessageRow) });
      } catch (streamError) {
        console.error("Chat generation failed", { documentId, error: streamError instanceof Error ? streamError.name : "UnknownError" });
        send({ type: "error", message: "The AI response was interrupted. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function getOrCreateSession(access: DocumentAccess) {
  const admin = createAdminClient();
  const actorColumn = access.kind === "owner" ? "owner_user_id" : "guest_session_id";
  const actorId = access.kind === "owner" ? access.userId : access.guestSessionId;
  const { data: existing } = await admin.from("chat_sessions").select("id").eq("document_id", access.documentId).eq(actorColumn, actorId).maybeSingle();
  if (existing) return existing;

  const { data: created } = await admin.from("chat_sessions").insert({
    document_id: access.documentId,
    owner_user_id: access.kind === "owner" ? access.userId : null,
    guest_session_id: access.kind === "guest" ? access.guestSessionId : null,
  }).select("id").maybeSingle();
  if (created) return created;

  const { data: raced } = await admin.from("chat_sessions").select("id").eq("document_id", access.documentId).eq(actorColumn, actorId).maybeSingle();
  return raced;
}

async function isRateLimited(chatSessionId: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin.from("chat_messages").select("id", { count: "exact", head: true }).eq("chat_session_id", chatSessionId).eq("role", "user").gte("created_at", since);
  return (count || 0) >= 20;
}

function publicMessage(message: MessageRow) {
  return { id: message.id, role: message.role, content: message.content, citations: Array.isArray(message.citations) ? message.citations : [], createdAt: message.created_at };
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

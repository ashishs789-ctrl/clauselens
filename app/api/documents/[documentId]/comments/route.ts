import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveDocumentAccess } from "@/lib/sharing/document-access";
import { isSameOriginMutation } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";

const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(5_000, "Comment must be 5,000 characters or fewer."),
});

type RouteContext = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { documentId } = await params;
  const access = await resolveDocumentAccess(documentId);
  if (!access) return errorResponse("Document access required.", 403);

  const admin = createAdminClient();
  const { data: comments, error } = await admin
    .from("comments")
    .select("id, body, author_user_id, author_guest_session_id, created_at, updated_at")
    .eq("document_id", documentId)
    .is("parent_id", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return errorResponse("Could not load comments.", 500);

  const hydrated = await hydrateAuthors(comments || []);
  return NextResponse.json({ comments: hydrated, currentActor: actorKey(access) });
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
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Invalid comment.", 400);

  const admin = createAdminClient();
  if (await isRateLimited(access)) {
    return errorResponse("You’re commenting too quickly. Please wait a minute and try again.", 429);
  }

  const { data: comment, error } = await admin.from("comments").insert({
    document_id: documentId,
    author_user_id: access.kind === "owner" ? access.userId : null,
    author_guest_session_id: access.kind === "guest" ? access.guestSessionId : null,
    body: parsed.data.body,
    parent_id: null,
  }).select("id, body, author_user_id, author_guest_session_id, created_at, updated_at").single();
  if (error || !comment) return errorResponse("Could not save this comment.", 500);

  const [hydrated] = await hydrateAuthors([comment]);
  return NextResponse.json({ comment: hydrated }, { status: 201 });
}

type CommentRow = {
  id: string;
  body: string;
  author_user_id: string | null;
  author_guest_session_id: string | null;
  created_at: string;
  updated_at: string;
};

async function hydrateAuthors(comments: CommentRow[]) {
  const userIds = [...new Set(comments.flatMap((comment) => comment.author_user_id ? [comment.author_user_id] : []))];
  const guestIds = [...new Set(comments.flatMap((comment) => comment.author_guest_session_id ? [comment.author_guest_session_id] : []))];
  const admin = createAdminClient();
  const [profilesResult, guestsResult] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, name").in("id", userIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    guestIds.length ? admin.from("guest_sessions").select("id, display_name").in("id", guestIds) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
  ]);
  const users = new Map((profilesResult.data || []).map((profile) => [profile.id, profile.name]));
  const guests = new Map((guestsResult.data || []).map((guest) => [guest.id, guest.display_name]));

  return comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: {
      actorKey: comment.author_user_id ? `user:${comment.author_user_id}` : `guest:${comment.author_guest_session_id}`,
      name: comment.author_user_id ? users.get(comment.author_user_id) || "Document owner" : guests.get(comment.author_guest_session_id || "") || "Guest reviewer",
      kind: comment.author_user_id ? "owner" : "guest",
    },
  }));
}

async function isRateLimited(access: NonNullable<Awaited<ReturnType<typeof resolveDocumentAccess>>>) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60_000).toISOString();
  let query = admin.from("comments").select("id", { count: "exact", head: true }).eq("document_id", access.documentId).gte("created_at", since);
  query = access.kind === "owner" ? query.eq("author_user_id", access.userId) : query.eq("author_guest_session_id", access.guestSessionId);
  const { count } = await query;
  return (count || 0) >= 10;
}

function actorKey(access: NonNullable<Awaited<ReturnType<typeof resolveDocumentAccess>>>) {
  return access.kind === "owner" ? `user:${access.userId}` : `guest:${access.guestSessionId}`;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

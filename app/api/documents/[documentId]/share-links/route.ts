import { NextResponse } from "next/server";
import { createOpaqueToken, hashToken } from "@/lib/security/tokens";
import { isSameOriginMutation } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await requireOwner((await params).documentId);
  if ("response" in access) return access.response;

  const { data, error } = await access.supabase
    .from("share_links")
    .select("id, created_at, expires_at, revoked_at")
    .eq("document_id", access.documentId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return errorResponse("Could not load sharing history.", 500);
  return NextResponse.json({ links: data });
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginMutation(request)) return errorResponse("Invalid request origin.", 403);
  const access = await requireOwner((await params).documentId);
  if ("response" in access) return access.response;

  const rawToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await access.supabase.from("share_links").insert({
    document_id: access.documentId,
    token_hash: hashToken(rawToken),
    created_by: access.userId,
    expires_at: expiresAt,
  }).select("id, created_at, expires_at").single();
  if (error) return errorResponse("Could not create a share link.", 500);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return NextResponse.json({ link: { ...data, url: `${appUrl}/share/${rawToken}` } }, { status: 201 });
}

async function requireOwner(documentId: string) {
  if (!isUuid(documentId)) return { response: errorResponse("Invalid document identifier.", 400) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: errorResponse("Authentication required.", 401) };
  const { data: document } = await supabase.from("documents").select("id").eq("id", documentId).maybeSingle();
  if (!document) return { response: errorResponse("Document not found.", 404) };
  return { supabase, documentId, userId: user.id };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

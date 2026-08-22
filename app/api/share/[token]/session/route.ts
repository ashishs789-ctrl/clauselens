import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GUEST_COOKIE, resolveShareLink } from "@/lib/sharing/access";
import { createOpaqueToken, hashToken } from "@/lib/security/tokens";
import { isSameOriginMutation } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";

const guestSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(100, "Name is too long."),
});

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginMutation(request)) return errorResponse("Invalid request origin.", 403);
  const { token } = await params;
  const shareLink = await resolveShareLink(token);
  if (!shareLink) return errorResponse("This share link is invalid, expired, or revoked.", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }
  const parsed = guestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Enter your name.", 400);

  const rawSessionToken = createOpaqueToken();
  const sevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const shareExpiry = shareLink.expires_at ? new Date(shareLink.expires_at).getTime() : sevenDays;
  const expiresAt = new Date(Math.min(sevenDays, shareExpiry));
  const admin = createAdminClient();
  const { error } = await admin.from("guest_sessions").insert({
    share_link_id: shareLink.id,
    display_name: parsed.data.displayName,
    session_token_hash: hashToken(rawSessionToken),
    expires_at: expiresAt.toISOString(),
  });
  if (error) return errorResponse("Could not start the guest session.", 500);

  (await cookies()).set(GUEST_COOKIE, rawSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
  return NextResponse.json({ authenticated: true });
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

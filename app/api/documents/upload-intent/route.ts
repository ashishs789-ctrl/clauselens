import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { isSameOriginMutation } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uploadIntentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return errorResponse("Invalid request origin.", 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse("Authentication required.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const parsed = uploadIntentSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Choose a valid PDF file.", 400);

  const env = getServerEnv();
  const maxBytes = env.MAX_PDF_SIZE_MB * 1024 * 1024;
  if (parsed.data.sizeBytes > maxBytes) {
    return errorResponse(`PDFs must be ${env.MAX_PDF_SIZE_MB} MB or smaller.`, 413);
  }
  if (!parsed.data.filename.toLowerCase().endsWith(".pdf")) {
    return errorResponse("The file must have a .pdf extension.", 415);
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${documentId}.pdf`;
  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    owner_id: user.id,
    original_filename: sanitizeFilename(parsed.data.filename),
    storage_path: storagePath,
    mime_type: "application/pdf",
    size_bytes: parsed.data.sizeBytes,
    processing_status: "uploaded",
  });

  if (insertError) return errorResponse("Could not prepare this upload. Please try again.", 500);

  const admin = createAdminClient();
  const { data: signedUpload, error: signError } = await admin.storage.from("pdfs").createSignedUploadUrl(storagePath);
  if (signError || !signedUpload?.token) {
    await supabase.from("documents").delete().eq("id", documentId);
    return errorResponse("Could not prepare secure storage. Please try again.", 500);
  }

  return NextResponse.json({
    documentId,
    path: storagePath,
    token: signedUpload.token,
    maxSizeBytes: maxBytes,
  });
}

function sanitizeFilename(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim();
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}

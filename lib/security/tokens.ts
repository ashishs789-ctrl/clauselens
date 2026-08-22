import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPlausibleToken(token: string) {
  return /^[A-Za-z0-9_-]{40,100}$/.test(token);
}

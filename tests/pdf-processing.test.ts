import { describe, expect, it } from "vitest";
import { chunkPages } from "@/lib/pdf/chunk";
import { hasPdfSignature, normalizePageText } from "@/lib/pdf/validate";

describe("PDF binary validation", () => {
  it("accepts a normal PDF header", () => {
    expect(hasPdfSignature(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
  });

  it("accepts a header within the permitted leading-byte window", () => {
    expect(hasPdfSignature(new TextEncoder().encode(`${"x".repeat(500)}%PDF-1.4`))).toBe(true);
  });

  it("rejects renamed non-PDF content and headers beyond 1024 bytes", () => {
    expect(hasPdfSignature(new TextEncoder().encode("plain text"))).toBe(false);
    expect(hasPdfSignature(new TextEncoder().encode(`${"x".repeat(1025)}%PDF-1.4`))).toBe(false);
  });
});

describe("page-aware PDF processing", () => {
  it("normalizes unsafe nulls and excessive whitespace", () => {
    expect(normalizePageText(" A\u0000   sentence.\n\n\nNext. ")).toBe("A sentence.\n\nNext.");
  });

  it("preserves page ranges in compact chunks", () => {
    const chunks = chunkPages(["First page.", "Second page."]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ chunkIndex: 0, pageStart: 1, pageEnd: 2 });
    expect(chunks[0].content).toContain("[Page 1]");
    expect(chunks[0].content).toContain("[Page 2]");
  });

  it("splits oversized pages into bounded overlapping chunks", () => {
    const chunks = chunkPages(["Legal clause. ".repeat(900)]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.pageStart === 1 && chunk.pageEnd === 1)).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);
  });
});

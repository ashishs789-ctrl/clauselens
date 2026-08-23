export type DocumentChunk = {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  tokenCount: number;
};

const TARGET_CHARS = 4_800;
const OVERLAP_CHARS = 600;

export function chunkPages(pages: string[]): DocumentChunk[] {
  const chunks: Omit<DocumentChunk, "chunkIndex" | "tokenCount">[] = [];
  let content = "";
  let pageStart = 1;
  let pageEnd = 1;

  const flush = () => {
    const trimmed = content.trim();
    if (trimmed) chunks.push({ content: trimmed, pageStart, pageEnd });
    content = trimmed.slice(-OVERLAP_CHARS);
    pageStart = pageEnd;
  };

  pages.forEach((pageText, pageOffset) => {
    const pageNumber = pageOffset + 1;
    const segments = splitOversizedText(pageText, TARGET_CHARS);
    for (const segment of segments) {
      const labelled = `[Page ${pageNumber}]\n${segment}`;
      if (content && content.length + labelled.length > TARGET_CHARS) flush();
      if (!content) pageStart = pageNumber;
      content = content ? `${content}\n\n${labelled}` : labelled;
      pageEnd = pageNumber;
    }
  });

  if (content.trim()) chunks.push({ content: content.trim(), pageStart, pageEnd });

  return chunks.map((chunk, chunkIndex) => ({
    ...chunk,
    chunkIndex,
    tokenCount: estimateTokens(chunk.content),
  }));
}

function splitOversizedText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value ? [value] : [];
  const segments: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    let end = Math.min(cursor + maxChars, value.length);
    if (end < value.length) {
      const breakAt = Math.max(value.lastIndexOf("\n", end), value.lastIndexOf(". ", end));
      if (breakAt > cursor + maxChars * 0.6) end = breakAt + 1;
    }
    segments.push(value.slice(cursor, end).trim());
    if (end >= value.length) break;
    cursor = Math.max(end - OVERLAP_CHARS, cursor + 1);
  }
  return segments.filter(Boolean);
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

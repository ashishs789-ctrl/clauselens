const PDF_HEADER = new TextEncoder().encode("%PDF-");

export function hasPdfSignature(bytes: Uint8Array) {
  const searchLimit = Math.min(bytes.length - PDF_HEADER.length + 1, 1024);
  for (let offset = 0; offset < searchLimit; offset += 1) {
    let matches = true;
    for (let index = 0; index < PDF_HEADER.length; index += 1) {
      if (bytes[offset + index] !== PDF_HEADER[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function normalizePageText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

import { PDFDocument } from "pdf-lib";

/**
 * Parse a 1-based page range expression (e.g., "1-3, 5") into 0-based page indices.
 */
export function parsePageRanges(rangeSpec: string, totalPages: number): number[] {
  const trimmed = rangeSpec.trim();
  if (!trimmed) throw new Error("Enter a page range such as 1-3, 5.");
  const indices: number[] = [];
  const seen = new Set<number>();

  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid page range "${part}".`);

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
      throw new Error(`Page numbers must be between 1 and ${totalPages}.`);
    }

    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let p = lo; p <= hi; p++) {
      const idx = p - 1;
      if (!seen.has(idx)) {
        seen.add(idx);
        indices.push(idx);
      }
    }
  }

  if (indices.length === 0) throw new Error("Select at least one page.");
  return indices;
}

/**
 * Extract pages matching a 1-based range specification into a new PDF.
 */
export async function splitPdf(bytes: Uint8Array, rangeSpec: string): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const indices = parsePageRanges(rangeSpec, src.getPageCount());
  return copySelectedPages(src, indices);
}

/**
 * Create a new PDF containing pages in the specified 0-based index order.
 */
export async function reorderOrDeletePages(bytes: Uint8Array, zeroBasedIndices: number[]): Promise<Uint8Array> {
  if (zeroBasedIndices.length === 0) throw new Error("Keep at least one page.");
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  for (const idx of zeroBasedIndices) {
    if (idx < 0 || idx >= total) throw new Error(`Page index ${idx + 1} is out of range.`);
  }
  return copySelectedPages(src, zeroBasedIndices);
}

async function copySelectedPages(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return new Uint8Array(await out.save());
}

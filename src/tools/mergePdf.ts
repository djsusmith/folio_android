import { PDFDocument } from "pdf-lib";

/**
 * Merge multiple PDF byte buffers into a single PDF document in order.
 */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("Select at least one PDF file to merge.");
  const merged = await PDFDocument.create();
  for (const bytes of files) {
    const src = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    for (const page of copied) merged.addPage(page);
  }
  return new Uint8Array(await merged.save());
}

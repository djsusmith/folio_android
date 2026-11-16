import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfs } from "./mergePdf";
import { parsePageRanges, splitPdf, reorderOrDeletePages } from "./splitPdf";
import { imagesToPdf } from "./imagesToPdf";

async function makeBlankPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([200 + i * 10, 300]);
  }
  return new Uint8Array(await doc.save());
}

// Minimal valid 1x1 PNG (RGBA)
const TINY_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
]);

describe("core PDF tools", () => {
  it("mergePdfs combines multiple PDFs in order", async () => {
    const a = await makeBlankPdf(2);
    const b = await makeBlankPdf(3);
    const mergedBytes = await mergePdfs([a, b]);
    const merged = await PDFDocument.load(mergedBytes);
    expect(merged.getPageCount()).toBe(5);
  });

  it("parsePageRanges parses ranges and single pages into 0-based indices", () => {
    expect(parsePageRanges("1-3, 5", 6)).toEqual([0, 1, 2, 4]);
    expect(parsePageRanges("4-2", 5)).toEqual([1, 2, 3]);
    expect(() => parsePageRanges("0", 5)).toThrow();
    expect(() => parsePageRanges("6", 5)).toThrow();
  });

  it("splitPdf extracts requested pages and reorderOrDeletePages reorders them", async () => {
    const src = await makeBlankPdf(4);
    const splitBytes = await splitPdf(src, "2, 4");
    const splitDoc = await PDFDocument.load(splitBytes);
    expect(splitDoc.getPageCount()).toBe(2);
    expect(splitDoc.getPage(0).getWidth()).toBe(210);
    expect(splitDoc.getPage(1).getWidth()).toBe(230);

    const reorderedBytes = await reorderOrDeletePages(src, [3, 0]);
    const reorderedDoc = await PDFDocument.load(reorderedBytes);
    expect(reorderedDoc.getPageCount()).toBe(2);
    expect(reorderedDoc.getPage(0).getWidth()).toBe(230);
    expect(reorderedDoc.getPage(1).getWidth()).toBe(200);
  });

  it("imagesToPdf creates a PDF with one page per image", async () => {
    const out = await imagesToPdf([
      { bytes: TINY_PNG, mimeType: "image/png" },
      { bytes: TINY_PNG, mimeType: "image/png" },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
  });
});

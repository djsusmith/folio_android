import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { compressPdf, COMPRESSION_PRESETS } from "./compressPdf";
import { pdfToImages, pdfToImagesZip } from "./pdfToImages";
import { docxToPdf } from "./docxToPdf";

async function makeSamplePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 400]);
  return new Uint8Array(await doc.save());
}

// Minimal 1x1 PNG
const TINY_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
]);

describe("conversion & compression tools", () => {
  it("COMPRESSION_PRESETS defines low, medium, and high presets", () => {
    expect(COMPRESSION_PRESETS.low.quality).toBeGreaterThan(COMPRESSION_PRESETS.high.quality);
    expect(COMPRESSION_PRESETS.medium.scale).toBeGreaterThan(0);
  });

  it("compressPdf produces a valid PDF with matching page count", async () => {
    const src = await makeSamplePdf(2);
    const renderPage = vi.fn().mockResolvedValue({
      bytes: TINY_PNG,
      mimeType: "image/png" as const,
      width: 300,
      height: 400,
    });
    const out = await compressPdf(src, { preset: "medium", renderPage });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(renderPage).toHaveBeenCalledTimes(2);
  });

  it("pdfToImages and pdfToImagesZip export each page", async () => {
    const src = await makeSamplePdf(2);
    const renderPage = vi.fn().mockResolvedValue({
      bytes: TINY_PNG,
      mimeType: "image/png" as const,
      width: 300,
      height: 400,
    });
    const images = await pdfToImages(src, { format: "png", renderPage });
    expect(images).toHaveLength(2);
    expect(images[0].filename).toBe("page-001.png");
    expect(images[1].filename).toBe("page-002.png");

    const zipBytes = await pdfToImagesZip(images);
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files)).toEqual(["page-001.png", "page-002.png"]);
  });

  it("docxToPdf converts extracted text into a valid PDF", async () => {
    const out = await docxToPdf(new Uint8Array([1, 2, 3]), {
      extractText: async () => "Hello Folio Android\n\nSecond paragraph.",
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

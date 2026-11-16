import { PDFDocument } from "pdf-lib";

export interface RenderedPage {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

export type PageRenderer = (
  pdfBytes: Uint8Array,
  pageNumber: number,
  options: { scale: number; mimeType: "image/png" | "image/jpeg"; quality: number },
) => Promise<RenderedPage>;

/**
 * Render all pages of a PDF using the provided renderer or the browser's PDF.js canvas renderer.
 */
export async function renderAllPdfPages(
  pdfBytes: Uint8Array,
  options: {
    scale: number;
    mimeType: "image/png" | "image/jpeg";
    quality: number;
    onProgress?: (done: number, total: number) => void;
    renderPage?: PageRenderer;
  },
): Promise<RenderedPage[]> {
  if (options.renderPage) {
    const doc = await PDFDocument.load(pdfBytes);
    const total = doc.getPageCount();
    const results: RenderedPage[] = [];
    for (let i = 1; i <= total; i++) {
      results.push(await options.renderPage(pdfBytes, i, options));
      options.onProgress?.(i, total);
    }
    return results;
  }

  const { loadPdf } = await import("../pdf");
  const controller = new AbortController();
  const pdf = await loadPdf(pdfBytes, controller.signal);
  try {
    const total = pdf.numPages;
    const results: RenderedPage[] = [];
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: options.scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context is unavailable.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error("Failed to encode rendered page."))),
          options.mimeType,
          options.quality,
        );
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      results.push({
        bytes,
        mimeType: options.mimeType,
        width: viewport.width / options.scale,
        height: viewport.height / options.scale,
      });
      options.onProgress?.(i, total);
    }
    return results;
  } finally {
    await pdf.destroy();
  }
}

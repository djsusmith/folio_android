import JSZip from "jszip";
import { renderAllPdfPages, type PageRenderer } from "./renderPdfPages";

export interface ExportedPageImage {
  pageNumber: number;
  filename: string;
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg";
}

export interface PdfToImagesOptions {
  format: "png" | "jpeg";
  quality?: number;
  scale?: number;
  onProgress?: (done: number, total: number) => void;
  renderPage?: PageRenderer;
}

/**
 * Render every page of a PDF into PNG or JPEG image buffers.
 */
export async function pdfToImages(bytes: Uint8Array, options: PdfToImagesOptions): Promise<ExportedPageImage[]> {
  const mimeType = options.format === "png" ? "image/png" : "image/jpeg";
  const ext = options.format === "png" ? "png" : "jpg";
  const rendered = await renderAllPdfPages(bytes, {
    scale: options.scale ?? 2.0,
    mimeType,
    quality: options.quality ?? 0.92,
    onProgress: options.onProgress,
    renderPage: options.renderPage,
  });

  return rendered.map((page, index) => {
    const pageNumber = index + 1;
    const padded = String(pageNumber).padStart(3, "0");
    return {
      pageNumber,
      filename: `page-${padded}.${ext}`,
      bytes: page.bytes,
      mimeType: page.mimeType,
    };
  });
}

/**
 * Bundle exported page images into a single ZIP archive.
 */
export async function pdfToImagesZip(images: ExportedPageImage[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const img of images) {
    zip.file(img.filename, img.bytes);
  }
  return zip.generateAsync({ type: "uint8array" });
}

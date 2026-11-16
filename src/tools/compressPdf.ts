import { PDFDocument } from "pdf-lib";
import { renderAllPdfPages, type PageRenderer } from "./renderPdfPages";

export type CompressionPreset = "low" | "medium" | "high";

export const COMPRESSION_PRESETS: Record<
  CompressionPreset,
  { label: string; scale: number; quality: number; description: string }
> = {
  low: { label: "Light (Best Quality)", scale: 1.5, quality: 0.82, description: "Sharp text, modest size reduction" },
  medium: { label: "Balanced", scale: 1.25, quality: 0.65, description: "Good quality and smaller file size" },
  high: { label: "Maximum (Smallest)", scale: 1.0, quality: 0.45, description: "Smallest file for fast sharing" },
};

export interface CompressOptions {
  preset: CompressionPreset;
  onProgress?: (done: number, total: number) => void;
  renderPage?: PageRenderer;
}

/**
 * Compress a PDF by re-encoding pages at the chosen preset scale and JPEG quality.
 */
export async function compressPdf(bytes: Uint8Array, options: CompressOptions): Promise<Uint8Array> {
  const cfg = COMPRESSION_PRESETS[options.preset];
  const pages = await renderAllPdfPages(bytes, {
    scale: cfg.scale,
    mimeType: "image/jpeg",
    quality: cfg.quality,
    onProgress: options.onProgress,
    renderPage: options.renderPage,
  });

  const out = await PDFDocument.create();
  for (const rendered of pages) {
    const img =
      rendered.mimeType === "image/png" ? await out.embedPng(rendered.bytes) : await out.embedJpg(rendered.bytes);
    const page = out.addPage([rendered.width, rendered.height]);
    page.drawImage(img, { x: 0, y: 0, width: rendered.width, height: rendered.height });
  }
  return new Uint8Array(await out.save({ useObjectStreams: true }));
}

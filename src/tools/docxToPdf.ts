import mammoth from "mammoth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { imagesToPdf, type ImageInput } from "./imagesToPdf";

export interface DocxToPdfOptions {
  extractText?: (bytes: Uint8Array) => Promise<string>;
}

const A4_WIDTH_PX = 1240;
const A4_HEIGHT_PX = 1754;
const MARGIN_PX = 96;
const LINE_HEIGHT_PX = 38;
const FONT_SIZE_PX = 26;

/**
 * Convert a .docx document into a multi-page PDF offline.
 * Uses Canvas 2D in browser/Android so English, Bangla, and Arabic scripts render properly.
 */
export async function docxToPdf(docxBytes: Uint8Array, options: DocxToPdfOptions = {}): Promise<Uint8Array> {
  const rawText = options.extractText
    ? await options.extractText(docxBytes)
    : (await mammoth.extractRawText({ arrayBuffer: docxBytes.slice().buffer })).value;

  const text = rawText.trim() || "(Empty document)";

  if (typeof document !== "undefined") {
    return renderTextViaCanvasPdf(text);
  }
  return renderTextViaPdfLibFallback(text);
}

async function renderTextViaCanvasPdf(text: string): Promise<Uint8Array> {
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) return renderTextViaPdfLibFallback(text);

  measureCtx.font = `${FONT_SIZE_PX}px "Noto Sans", "Noto Sans Bengali", "Noto Sans Arabic", sans-serif`;
  const maxWidth = A4_WIDTH_PX - MARGIN_PX * 2;
  const wrappedLines = wrapParagraphs(text, line => measureCtx.measureText(line).width <= maxWidth);

  const linesPerPage = Math.max(1, Math.floor((A4_HEIGHT_PX - MARGIN_PX * 2) / LINE_HEIGHT_PX));
  const pages: ImageInput[] = [];

  for (let offset = 0; offset < wrappedLines.length; offset += linesPerPage) {
    const slice = wrappedLines.slice(offset, offset + linesPerPage);
    const canvas = document.createElement("canvas");
    canvas.width = A4_WIDTH_PX;
    canvas.height = A4_HEIGHT_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#18181b";
    ctx.font = `${FONT_SIZE_PX}px "Noto Sans", "Noto Sans Bengali", "Noto Sans Arabic", sans-serif`;
    ctx.textBaseline = "top";

    slice.forEach((line, idx) => {
      ctx.fillText(line, MARGIN_PX, MARGIN_PX + idx * LINE_HEIGHT_PX);
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Failed to render DOCX page."))), "image/png");
    });
    pages.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: "image/png" });
  }

  return imagesToPdf(pages);
}

async function renderTextViaPdfLibFallback(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const margin = 50;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const lineHeight = 16;
  const maxWidth = pageWidth - margin * 2;

  const safeText = text.replace(/[^\x20-\x7E\n]/g, "?");
  const lines = wrapParagraphs(safeText, line => font.widthOfTextAtSize(line, fontSize) <= maxWidth);
  const linesPerPage = Math.max(1, Math.floor((pageHeight - margin * 2) / lineHeight));

  for (let offset = 0; offset < lines.length; offset += linesPerPage) {
    const page = doc.addPage([pageWidth, pageHeight]);
    const slice = lines.slice(offset, offset + linesPerPage);
    slice.forEach((line, idx) => {
      page.drawText(line, {
        x: margin,
        y: pageHeight - margin - (idx + 1) * lineHeight,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.12),
      });
    });
  }

  return new Uint8Array(await doc.save());
}

function wrapParagraphs(text: string, fits: (candidate: string) => boolean): string[] {
  const result: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      result.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate) || !current) {
        current = candidate;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result.length > 0 ? result : [""];
}

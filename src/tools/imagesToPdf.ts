import { PDFDocument } from "pdf-lib";

export interface ImageInput {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Convert an array of PNG or JPEG images into a multi-page PDF document.
 */
export async function imagesToPdf(images: ImageInput[]): Promise<Uint8Array> {
  if (images.length === 0) throw new Error("Select at least one image.");
  const doc = await PDFDocument.create();

  for (const img of images) {
    const type = img.mimeType.toLowerCase();
    const embedded =
      type.includes("png") ? await doc.embedPng(img.bytes)
      : type.includes("jpeg") || type.includes("jpg") ? await doc.embedJpg(img.bytes)
      : null;

    if (!embedded) {
      throw new Error(`Unsupported image format "${img.mimeType}". Use PNG or JPEG.`);
    }

    const width = Math.max(embedded.width, 1);
    const height = Math.max(embedded.height, 1);
    const page = doc.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  return new Uint8Array(await doc.save());
}

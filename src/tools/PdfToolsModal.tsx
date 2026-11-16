import { useState } from "react";
import { Modal } from "../Dialogs";
import { Icon } from "../icons";
import { mergePdfs } from "./mergePdf";
import { splitPdf } from "./splitPdf";
import { imagesToPdf, type ImageInput } from "./imagesToPdf";
import { compressPdf, COMPRESSION_PRESETS, type CompressionPreset } from "./compressPdf";
import { pdfToImages, pdfToImagesZip } from "./pdfToImages";
import { docxToPdf } from "./docxToPdf";

export type PdfToolId = "merge" | "split" | "compress" | "img2pdf" | "pdf2img" | "docx2pdf" | "sign";

interface SelectedFile {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}

interface PdfToolsModalProps {
  initialTool?: PdfToolId;
  activeDoc?: { name: string; getBytes: () => Promise<Uint8Array> } | null;
  onOpenPdfBytes: (name: string, bytes: Uint8Array) => void;
  onExportFile: (name: string, bytes: Uint8Array, mimeType: string) => Promise<void>;
  onStartSigning?: () => void;
  onClose: () => void;
}

const TOOL_LIST: { id: PdfToolId; label: string; desc: string }[] = [
  { id: "merge", label: "Merge PDF", desc: "Combine multiple PDFs into one" },
  { id: "split", label: "Split / Extract", desc: "Extract specific pages or ranges" },
  { id: "compress", label: "Compress PDF", desc: "Reduce file size offline" },
  { id: "img2pdf", label: "Images → PDF", desc: "Convert PNG/JPEG photos to PDF" },
  { id: "pdf2img", label: "PDF → Images", desc: "Export pages as PNG or JPEG ZIP" },
  { id: "docx2pdf", label: "DOCX → PDF", desc: "Convert Word documents offline" },
  { id: "sign", label: "Sign PDF", desc: "Draw, capture, or place signature" },
];

async function readInputFiles(fileList: FileList | null): Promise<SelectedFile[]> {
  if (!fileList) return [];
  const items: SelectedFile[] = [];
  for (const file of Array.from(fileList)) {
    items.push({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"),
    });
  }
  return items;
}

export function PdfToolsModal({
  initialTool = "merge",
  activeDoc,
  onOpenPdfBytes,
  onExportFile,
  onStartSigning,
  onClose,
}: PdfToolsModalProps) {
  const [tool, setTool] = useState<PdfToolId>(initialTool);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [useActive, setUseActive] = useState(!!activeDoc);
  const [rangeSpec, setRangeSpec] = useState("1");
  const [preset, setPreset] = useState<CompressionPreset>("medium");
  const [imageFormat, setImageFormat] = useState<"png" | "jpeg">("png");
  const [openResult, setOpenResult] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectTool = (next: PdfToolId) => {
    setTool(next);
    setFiles([]);
    setError(null);
    setProgress(null);
  };

  const resolveSinglePdf = async (): Promise<{ name: string; bytes: Uint8Array }> => {
    if (useActive && activeDoc) {
      return { name: activeDoc.name, bytes: await activeDoc.getBytes() };
    }
    if (files[0]) {
      return { name: files[0].name, bytes: files[0].bytes };
    }
    throw new Error("Select a PDF file first.");
  };

  const deliverPdf = async (outName: string, outBytes: Uint8Array) => {
    if (openResult) {
      onOpenPdfBytes(outName, outBytes);
      onClose();
    } else {
      await onExportFile(outName, outBytes, "application/pdf");
    }
  };

  const runTool = async () => {
    setBusy(true);
    setError(null);
    setProgress("Processing offline…");
    try {
      if (tool === "merge") {
        if (files.length < 2) throw new Error("Select at least 2 PDF files to merge.");
        const out = await mergePdfs(files.map(f => f.bytes));
        await deliverPdf("merged.pdf", out);
      } else if (tool === "split") {
        const src = await resolveSinglePdf();
        const out = await splitPdf(src.bytes, rangeSpec);
        const base = src.name.replace(/\.pdf$/i, "");
        await deliverPdf(`${base}-extracted.pdf`, out);
      } else if (tool === "compress") {
        const src = await resolveSinglePdf();
        const out = await compressPdf(src.bytes, {
          preset,
          onProgress: (done, total) => setProgress(`Compressing page ${done} of ${total}…`),
        });
        const base = src.name.replace(/\.pdf$/i, "");
        await deliverPdf(`${base}-compressed.pdf`, out);
      } else if (tool === "img2pdf") {
        if (files.length === 0) throw new Error("Select one or more PNG/JPEG images.");
        const inputs: ImageInput[] = files.map(f => ({ bytes: f.bytes, mimeType: f.mimeType }));
        const out = await imagesToPdf(inputs);
        await deliverPdf("images.pdf", out);
      } else if (tool === "pdf2img") {
        const src = await resolveSinglePdf();
        const imgs = await pdfToImages(src.bytes, {
          format: imageFormat,
          onProgress: (done, total) => setProgress(`Rendering page ${done} of ${total}…`),
        });
        const zipBytes = await pdfToImagesZip(imgs);
        const base = src.name.replace(/\.pdf$/i, "");
        await onExportFile(`${base}-pages.zip`, zipBytes, "application/zip");
      } else if (tool === "docx2pdf") {
        if (!files[0]) throw new Error("Select a .docx file to convert.");
        const out = await docxToPdf(files[0].bytes);
        const base = files[0].name.replace(/\.docx$/i, "");
        await deliverPdf(`${base}.pdf`, out);
      } else if (tool === "sign") {
        if (activeDoc && onStartSigning) {
          onClose();
          onStartSigning();
          return;
        }
        if (!files[0]) throw new Error("Select a PDF file to open and sign.");
        onOpenPdfBytes(files[0].name, files[0].bytes);
        onClose();
        onStartSigning?.();
      }
      setProgress("Done.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const accept =
    tool === "img2pdf" ? "image/png,image/jpeg,.png,.jpg,.jpeg"
    : tool === "docx2pdf" ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : ".pdf,application/pdf";

  const allowMultiple = tool === "merge" || tool === "img2pdf";
  const supportsActiveDoc = tool === "split" || tool === "compress" || tool === "pdf2img" || tool === "sign";

  return (
    <Modal title="PDF Tools (100% Offline)" onClose={() => { if (!busy) onClose(); }}>
      <div className="tools-hub">
        <div className="tools-grid" role="tablist" aria-label="PDF tools">
          {TOOL_LIST.map(item => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tool === item.id}
              className={`tool-card${tool === item.id ? " active" : ""}`}
              onClick={() => selectTool(item.id)}
              disabled={busy}
            >
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="tool-panel">
          {supportsActiveDoc && activeDoc && (
            <label className="tool-checkbox">
              <input
                type="checkbox"
                checked={useActive}
                onChange={e => setUseActive(e.target.checked)}
                disabled={busy}
              />
              <span>Use current document ({activeDoc.name})</span>
            </label>
          )}

          {!(supportsActiveDoc && activeDoc && useActive) && (
            <div className="tool-picker">
              <label className="btn ghost">
                <Icon name="upload" size={15} />
                <span>{allowMultiple ? "Choose files" : "Choose file"}</span>
                <input
                  type="file"
                  accept={accept}
                  multiple={allowMultiple}
                  hidden
                  disabled={busy}
                  onChange={async e => {
                    const picked = await readInputFiles(e.target.files);
                    setFiles(prev => (allowMultiple ? [...prev, ...picked] : picked));
                    e.target.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="tool-file-list">
                  {files.map((f, idx) => (
                    <li key={`${f.name}-${idx}`}>
                      <span>{f.name}</span>
                      <button
                        className="pill-btn"
                        aria-label={`Remove ${f.name}`}
                        disabled={busy}
                        onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tool === "split" && (
            <label className="tool-field">
              <span>Pages to extract (e.g. 1-3, 5)</span>
              <input
                type="text"
                value={rangeSpec}
                onChange={e => setRangeSpec(e.target.value)}
                placeholder="1-3, 5"
                disabled={busy}
              />
            </label>
          )}

          {tool === "compress" && (
            <label className="tool-field">
              <span>Compression level</span>
              <select
                value={preset}
                onChange={e => setPreset(e.target.value as CompressionPreset)}
                disabled={busy}
              >
                {(Object.keys(COMPRESSION_PRESETS) as CompressionPreset[]).map(key => (
                  <option key={key} value={key}>
                    {COMPRESSION_PRESETS[key].label} — {COMPRESSION_PRESETS[key].description}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tool === "pdf2img" && (
            <label className="tool-field">
              <span>Image format</span>
              <select
                value={imageFormat}
                onChange={e => setImageFormat(e.target.value as "png" | "jpeg")}
                disabled={busy}
              >
                <option value="png">PNG (Lossless)</option>
                <option value="jpeg">JPEG (Smaller)</option>
              </select>
            </label>
          )}

          {tool !== "pdf2img" && tool !== "sign" && (
            <label className="tool-checkbox">
              <input
                type="checkbox"
                checked={openResult}
                onChange={e => setOpenResult(e.target.checked)}
                disabled={busy}
              />
              <span>Open result in Folio editor</span>
            </label>
          )}

          {progress && <p className="tool-progress" role="status">{progress}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="form-actions">
            <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn primary" onClick={() => void runTool()} disabled={busy}>
              {busy ? "Working…" : tool === "sign" ? "Open & Sign" : "Run tool"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

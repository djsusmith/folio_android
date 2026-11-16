# Folio Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Folio as a signed offline-first Android APK with PDF editing, touch-friendly signatures, Smallpdf-style PDF tools, English/Bangla/Arabic OCR, and optional on-device AI.

**Architecture:** Wrap Folio's React 19 + TypeScript + Vite app in Capacitor (`@capacitor/android`) inside `.worktrees/android-app`, add pure TypeScript client-side PDF tools in `src/tools/`, pre-bundle `eng`/`ben`/`ara` Tesseract traineddata in `public/ocr/`, adapt UI/AI gating for mobile touch, and build a signed release APK via Gradle/Android SDK.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Capacitor 7 (`@capacitor/android`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/app`), `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `mammoth`, `jszip`.

**Spec:** `docs/superpowers/specs/2026-11-16-folio-android-design.md`

## Global Constraints

- Desktop Electron builds on `main` must remain unaffected (`VITE_TARGET=android` or runtime `Capacitor.isNativePlatform()` gates).
- Offline OCR for `eng`, `ben`, and `ara` must work without network access.
- All Smallpdf-style tools (`Merge`, `Split`, `Compress`, `Images → PDF`, `PDF → Images`, `DOCX → PDF`, `Organize`, `Sign`) must run 100% client-side.
- Multi-page canvas operations must process pages sequentially and release canvas dimensions (`width = 0; height = 0`) to respect Android WebView memory limits.
- Output APK must be signed (`assembleRelease` with release keystore).
- Never commit secrets, tokens, or keystores to git.

## Review Focus

- **Empty or corrupt PDF / non-PDF input to tools:** `mergePdf`, `splitPdf`, `compressPdf`, and `pdfToImages` throw a clear user-facing `Error` instead of hanging or crashing.
- **Invalid or out-of-bounds page ranges in `splitPdf`:** Ranges like `"0"`, `"99-100"` on a 3-page PDF, or `"3-1"` throw a descriptive validation error before allocating output pages.
- **Zero or unsupported image files in `imagesToPdf`:** Empty array or non-PNG/JPEG/WebP input fails fast with a clear message.
- **Multi-language OCR selection (`eng+ben`, `eng+ara`):** `installedScanLanguages()` and `startOcrWorker()` treat `eng`, `ben`, and `ara` as built-in offline packs without triggering network fetches.
- **Android `content://` URI & WebView export:** `saveOrShareFile()` writes to Capacitor `Documents`/`Cache` and invokes `Share.share` on native platforms, falling back to browser `<a download>` on web.

---

### Task 1: Multilingual Offline OCR (`eng`, `ben`, `ara`)

**Files:**
- Modify: `package.json` (`devDependencies` for `@tesseract.js-data/ben`, `@tesseract.js-data/ara`)
- Modify: `scripts/copy-ocr-assets.mjs`
- Modify: `src/scanLanguage.ts`
- Modify: `src/scanLanguagePacks.ts`
- Modify: `src/ocrWorker.ts`
- Test: `src/scanLanguagePacks.test.ts`

**Interfaces:**
- Produces: `BUILTIN_SCAN_LANGUAGES: ReadonlySet<ScanLanguage>` (`"eng"`, `"ben"`, `"ara"`), `installedScanLanguages(): Promise<Set<ScanLanguage>>`

- [ ] **Step 1: Write the failing test in `src/scanLanguagePacks.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_SCAN_LANGUAGES, installedScanLanguages } from "./scanLanguagePacks";

vi.mock("idb-keyval", () => ({
  keys: vi.fn(async () => []),
  set: vi.fn(async () => undefined),
}));

describe("scanLanguagePacks offline built-ins", () => {
  it("includes eng, ben, and ara as built-in offline languages", async () => {
    expect(BUILTIN_SCAN_LANGUAGES.has("eng")).toBe(true);
    expect(BUILTIN_SCAN_LANGUAGES.has("ben")).toBe(true);
    expect(BUILTIN_SCAN_LANGUAGES.has("ara")).toBe(true);
    const installed = await installedScanLanguages();
    expect(installed.has("eng")).toBe(true);
    expect(installed.has("ben")).toBe(true);
    expect(installed.has("ara")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/scanLanguagePacks.test.ts`
Expected: FAIL (`BUILTIN_SCAN_LANGUAGES` not exported / `ben` and `ara` missing).

- [ ] **Step 3: Install `@tesseract.js-data/ben` and `@tesseract.js-data/ara` and update `scripts/copy-ocr-assets.mjs`, `src/scanLanguagePacks.ts`, `src/ocrWorker.ts`**

- Install packages: `npm install -D @tesseract.js-data/ben @tesseract.js-data/ara`
- In `scripts/copy-ocr-assets.mjs`: copy `eng.traineddata.gz`, `ben.traineddata.gz`, and `ara.traineddata.gz` into `public/ocr/` (keep cleanup for all other `.traineddata.gz`).
- In `src/scanLanguagePacks.ts`: export `BUILTIN_SCAN_LANGUAGES = new Set<ScanLanguage>(["eng", "ben", "ara"])`, use it in `installedScanLanguages()` and early-return in `installScanLanguage()`.
- In `src/ocrWorker.ts`: check `!BUILTIN_SCAN_LANGUAGES.has(code)` instead of `code !== "eng"`.

- [ ] **Step 4: Run test and asset copy to verify**

Run: `npm run assets && npx vitest run src/scanLanguagePacks.test.ts`
Expected: PASS and `public/ocr/{eng,ben,ara}.traineddata.gz` exist.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/copy-ocr-assets.mjs src/scanLanguagePacks.ts src/ocrWorker.ts src/scanLanguagePacks.test.ts
git commit -m "feat(ocr): bundle offline English, Bangla, and Arabic packs"
```

---

### Task 2: Smallpdf-Style Core PDF Tools (`mergePdf`, `splitPdf`, `imagesToPdf`)

**Files:**
- Create: `src/tools/mergePdf.ts`
- Create: `src/tools/splitPdf.ts`
- Create: `src/tools/imagesToPdf.ts`
- Test: `src/tools/coreTools.test.ts`

**Interfaces:**
- Produces:
  - `mergePdfs(inputs: Uint8Array[]): Promise<Uint8Array>`
  - `parsePageRanges(spec: string, totalPages: number): number[]` (1-based sorted/ordered indices)
  - `splitPdf(input: Uint8Array, pageRangeSpec: string): Promise<Uint8Array>`
  - `imagesToPdf(images: { bytes: Uint8Array; mimeType: string }[], options?: { pageSize?: "fit" | "a4" | "letter" }): Promise<Uint8Array>`

- [ ] **Step 1: Write failing tests in `src/tools/coreTools.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfs } from "./mergePdf";
import { parsePageRanges, splitPdf } from "./splitPdf";
import { imagesToPdf } from "./imagesToPdf";

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  return doc.save();
}

describe("core PDF tools", () => {
  it("merges multiple PDFs preserving total page count", async () => {
    const merged = await mergePdfs([await makePdf(2), await makePdf(3)]);
    const out = await PDFDocument.load(merged);
    expect(out.getPageCount()).toBe(5);
  });

  it("rejects empty merge input", async () => {
    await expect(mergePdfs([])).rejects.toThrow(/at least one/i);
  });

  it("parses page ranges and rejects out-of-bounds ranges", () => {
    expect(parsePageRanges("1-2, 4", 5)).toEqual([1, 2, 4]);
    expect(() => parsePageRanges("0", 5)).toThrow();
    expect(() => parsePageRanges("4-2", 5)).toThrow();
    expect(() => parsePageRanges("6", 5)).toThrow();
  });

  it("splits selected pages into a new PDF", async () => {
    const outBytes = await splitPdf(await makePdf(4), "2, 4");
    const out = await PDFDocument.load(outBytes);
    expect(out.getPageCount()).toBe(2);
  });

  it("rejects empty or unsupported images in imagesToPdf", async () => {
    await expect(imagesToPdf([])).rejects.toThrow(/at least one/i);
    await expect(imagesToPdf([{ bytes: new Uint8Array([1, 2]), mimeType: "image/gif" }])).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/coreTools.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `mergePdf.ts`, `splitPdf.ts`, and `imagesToPdf.ts`**

- `mergePdfs`: validate `inputs.length >= 1`, load each with `PDFDocument.load`, copy all pages into a new `PDFDocument`, return `save()`.
- `parsePageRanges`: parse comma-separated `N` or `A-B` tokens, validate `1 <= A <= B <= totalPages`, throw clear `Error` on invalid input.
- `splitPdf`: load `input`, resolve 0-based indices via `parsePageRanges`, copy into new `PDFDocument`, return `save()`.
- `imagesToPdf`: validate `images.length >= 1` and `image/png` / `image/jpeg` (for `image/webp`, convert via offscreen canvas in browser or throw descriptive error in Node), embed and draw onto `fit` / `a4` / `letter` pages.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/tools/coreTools.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/mergePdf.ts src/tools/splitPdf.ts src/tools/imagesToPdf.ts src/tools/coreTools.test.ts
git commit -m "feat(tools): add merge, split, and images-to-pdf core utilities"
```

---

### Task 3: Smallpdf-Style Render & Conversion Tools (`compressPdf`, `pdfToImages`, `docxToPdf`)

**Files:**
- Create: `src/tools/compressPdf.ts`
- Create: `src/tools/pdfToImages.ts`
- Create: `src/tools/docxToPdf.ts`
- Test: `src/tools/convertTools.test.ts`

**Interfaces:**
- Produces:
  - `COMPRESSION_PRESETS: Record<"low" | "medium" | "high", { scale: number; quality: number }>`
  - `compressPdf(input: Uint8Array, preset: "low" | "medium" | "high", onProgress?: (p: number) => void): Promise<Uint8Array>`
  - `pdfToImages(input: Uint8Array, format: "png" | "jpeg", scale?: number, onProgress?: (p: number) => void): Promise<{ filename: string; blob: Blob }[]>`
  - `docxToPdf(docxBytes: Uint8Array, onProgress?: (p: number) => void): Promise<Uint8Array>`

- [ ] **Step 1: Write failing tests in `src/tools/convertTools.test.ts`**

Test `COMPRESSION_PRESETS` values, empty/corrupt input guards for `compressPdf`, `pdfToImages`, and `docxToPdf`, and mock `mammoth.convertToHtml` + canvas pagination to verify `docxToPdf` rejects empty input and produces valid PDF bytes when HTML is rendered.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/convertTools.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `compressPdf.ts`, `pdfToImages.ts`, `docxToPdf.ts`**

- `compressPdf.ts`: render each page sequentially via `pdfjs-dist` at `preset.scale`, export JPEG at `preset.quality`, embed into `pdf-lib` page with original PDF page dimensions, release canvas (`width = 0; height = 0`) after each page.
- `pdfToImages.ts`: render each page sequentially via `pdfjs-dist` to PNG/JPEG `Blob`, release canvas between pages.
- `docxToPdf.ts`: convert `.docx` with `mammoth.convertToHtml({ arrayBuffer })`, paginate HTML into an offscreen container (`595x842` pt aspect) using `foreignObject` SVG or canvas text/layout rendering so Android system Bangla/Arabic fonts shape properly, and assemble pages into `pdf-lib`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/tools/convertTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/compressPdf.ts src/tools/pdfToImages.ts src/tools/docxToPdf.ts src/tools/convertTools.test.ts
git commit -m "feat(tools): add compress, pdf-to-images, and docx-to-pdf utilities"
```

---

### Task 4: Smallpdf Tools Hub UI & Signature Integration

**Files:**
- Create: `src/tools/PdfToolsModal.tsx`
- Modify: `src/App.tsx` (add "Tools" button in toolbar & Welcome screen, wire `PdfToolsModal`, open resulting PDFs directly in a Folio tab or save/share)
- Modify: `src/Welcome.tsx` (add quick-launch "PDF Tools" card/button)
- Modify: `src/SignatureDialog.tsx` (ensure touch pointer events work cleanly on Android)

**Interfaces:**
- Consumes: `mergePdfs`, `splitPdf`, `imagesToPdf`, `compressPdf`, `pdfToImages`, `docxToPdf`, `saveOrShareFile`
- Produces: `PdfToolsModal` component

- [ ] **Step 1: Create `src/tools/PdfToolsModal.tsx`**

Implement a clean grid of the 8 tools (**Merge PDF**, **Split / Extract**, **Compress PDF**, **Images → PDF**, **PDF → Images**, **DOCX → PDF**, **Organize Pages**, **Sign PDF**) with file pickers, progress bar, and "Open in Folio" + "Save / Share" actions.

- [ ] **Step 2: Wire `PdfToolsModal` into `src/App.tsx` and `src/Welcome.tsx`, and verify touch events in `src/SignatureDialog.tsx`**

- [ ] **Step 3: Run typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/PdfToolsModal.tsx src/App.tsx src/Welcome.tsx src/SignatureDialog.tsx
git commit -m "feat(ui): add Smallpdf-style PDF Tools Hub and touch signature polish"
```

---

### Task 5: Mobile Responsive UI, Optional On-Device AI Gate & Native File Bridge

**Files:**
- Create: `src/mobile.ts`
- Modify: `index.html` (`viewport-fit=cover`, `user-scalable=no` or `maximum-scale=1.0`)
- Modify: `src/styles.css` (responsive `@media (max-width: 768px)` toolbar, drawer sidebar, 44px touch targets, safe-area insets)
- Modify: `src/App.tsx` & `src/SettingsDialog.tsx` (hide desktop/cloud AI when `!window.folioDesktop`; add optional **On-Device AI (Experimental)** toggle in Settings)
- Test: `src/mobile.test.ts`

**Interfaces:**
- Produces: `isAndroidNative(): boolean`, `saveOrShareFile(bytes: Uint8Array, filename: string, mimeType: string): Promise<void>`, `registerAndroidFileIntent(onFile: (bytes: Uint8Array, name: string) => void): () => void`

- [ ] **Step 1: Install Capacitor packages**

Run: `npm install @capacitor/core @capacitor/filesystem @capacitor/share @capacitor/app && npm install -D @capacitor/cli @capacitor/android`

- [ ] **Step 2: Write failing test in `src/mobile.test.ts` for `saveOrShareFile` web fallback**

- [ ] **Step 3: Implement `src/mobile.ts`, responsive `src/styles.css`, and AI gating in `src/App.tsx` / `src/SettingsDialog.tsx`**

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/mobile.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html src/mobile.ts src/mobile.test.ts src/styles.css src/App.tsx src/SettingsDialog.tsx
git commit -m "feat(mobile): add Capacitor file bridge, responsive UI, and AI gating"
```

---

### Task 6: Capacitor Android Project, Signed Release APK & Device Verification

**Files:**
- Create: `capacitor.config.ts`
- Create: `android/` (generated via `npx cap add android`, with `AndroidManifest.xml` PDF/DOCX `ACTION_VIEW` intents, `FileProvider`, and `signingConfigs.release` in `android/app/build.gradle`)
- Create: `.gitignore` entry for `*.keystore` / `*.jks` / `keystore.properties`

**Interfaces:**
- Produces: Signed release APK at `android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 1: Create `capacitor.config.ts` and initialize `android/`**

Run: `npx cap add android && npx cap sync android`

- [ ] **Step 2: Configure `AndroidManifest.xml` (`ACTION_VIEW` for `application/pdf` & `.docx`) and generate release keystore outside repo (`~/folio-release.jks`) + configure `signingConfigs.release` in `android/app/build.gradle`**

- [ ] **Step 3: Build signed release APK (`./gradlew assembleRelease` locally or on EC2 if JDK/RAM requires)**

Run: `./gradlew assembleRelease` (or via EC2 `~/Antigravity.pem` if local JDK is unavailable)
Expected: `BUILD SUCCESSFUL`, signed `app-release.apk` verified with `apksigner verify`.

- [ ] **Step 4: Install & verify on device via `adb` / `rish` / `android-device-hub`**

Run: `adb install -r app-release.apk` (or `rish -c "pm install -r ..."`), launch `app.folio.reader`, verify PDF open/edit/sign, Tools Hub, and `eng`/`ben`/`ara` OCR.

- [ ] **Step 5: Commit `capacitor.config.ts` and `android/` (excluding keystore/secrets)**

```bash
git add .gitignore capacitor.config.ts android/
git commit -m "feat(android): add Capacitor Android project and release signing config"
```

# Folio Android Design

**Date:** 2026-11-16
**Branch:** `feat/android-app` (worktree `.worktrees/android-app`)
**Status:** Ready for Approval

## 1. Intent & Why

Bring Folio to Android as an offline-first PDF reader, editor, signer, converter, and multilingual OCR app—combining Folio's existing PDF editing, annotation, and signature engine with a **Smallpdf-style Tools Hub** and out-of-the-box offline OCR for **English (`eng`), Bangla (`ben`), and Arabic (`ara`)**. Desktop/cloud AI providers are removed; an optional, on-demand on-device AI mode may be enabled in Settings.

## 2. Goals, Non-Goals, Anti-Goals

### Goals
- **Native Android APK (`app.folio.reader`)** built with Capacitor wrapping Folio's React 19 + TypeScript + Vite app.
- **Full PDF Editing, Annotations & Signatures (existing Folio engine + touch support):**
  - Edit existing text (`ContentEditor.tsx`) and replace embedded images (`pdfImageEdit.ts`).
  - **Sign PDF** (`SignatureDialog.tsx`, `src/signatures.ts`): touch-friendly drawn/typed/image signatures, saved signatures, and placement/resizing on pages (surfaced in both the toolbar and Tools Hub).
  - Highlight, note, freehand draw & shapes, and organize pages (reorder, rotate, delete, export selected pages).
- **Smallpdf-style Tools Hub (100% client-side, offline):**
  1. **Merge PDFs** — pick 2+ PDFs, reorder files, merge into one PDF.
  2. **Split / Extract Pages** — extract page ranges or individual pages into a new PDF.
  3. **Compress PDF** — downsample/re-encode pages with selectable quality presets (High / Medium / Low) for guaranteed size reduction.
  4. **Images → PDF** — convert JPG/PNG/WebP images into a multi-page PDF with page size & margin options.
  5. **PDF → Images** — export pages as PNG/JPEG (single image or `.zip` archive via `jszip`).
  6. **DOCX → PDF** — convert `.docx` files via `mammoth` + paginated HTML/canvas rendering (preserving Bangla, Arabic/RTL, and English system font shaping).
  7. **Rotate / Organize** — quick entry into Folio's page organizer.
  8. **Sign PDF** — quick entry into Folio's signature workflow.
- **Multilingual Offline OCR (English, Bangla, Arabic):**
  - Pre-bundle `eng.traineddata.gz`, `ben.traineddata.gz`, and `ara.traineddata.gz` in `public/ocr/` so English, Bangla, and Arabic OCR work immediately offline without downloading packs.
  - Allow multi-language OCR combinations (e.g., `eng+ben`, `eng+ara`) in Scan Language settings.
- **Mobile-First Android Integration:**
  - Touch-friendly responsive toolbar, collapsible sidebar/drawer, and safe-area inset handling.
  - Native file saving/sharing via `@capacitor/filesystem` + `@capacitor/share`, plus Android `ACTION_VIEW` / `ACTION_SEND` intent handling for `.pdf` and `.docx` files (`content://` URIs copied into app cache for reliable editing, exported via Save Copy / Share sheet).
- **Optional On-Device AI:**
  - Hide desktop/cloud AI providers (OpenRouter, Anthropic CLI, custom remote endpoints).
  - Provide an optional **On-Device AI (Experimental)** toggle in Settings that lazy-loads a local WebGPU/WASM model (`@huggingface/transformers`) on-demand when enabled by the user (disabled by default, zero APK bloat).

### Non-Goals
- Cloud AI APIs or Folio accounts.
- Server-side LibreOffice/Ghostscript conversion.
- Breaking or altering existing Windows/macOS/Linux Electron release workflows.

### Anti-Goals
- Requiring an internet connection for English/Bangla/Arabic OCR, signing, or any Smallpdf tool.
- Bundling multi-hundred-MB LLM weights inside the base APK.

## 3. Builder Calls (Resolved Design Decisions)
1. **Desktop/Web Compatibility:** OCR bundling for `ben`/`ara` and Capacitor-specific hooks are gated cleanly (`VITE_TARGET=android` or runtime `Capacitor.isNativePlatform()` checks) so desktop Electron builds on `main` remain unaffected.
2. **Android File Handling (`content://` URIs):** Incoming `content://` URIs from Gmail/WhatsApp/file managers are read into app cache via a lightweight Capacitor `ContentResolver` bridge, and edited/converted outputs are saved to `Documents` or exported via the Android Share sheet ("Save copy / Share").
3. **Compress PDF:** Uses sequential `pdfjs-dist` page rasterization + JPEG compression at user-selected quality presets (`high` / `medium` / `low`) rebuilt with `pdf-lib` (releasing canvases between pages to stay within WebView RAM).
4. **DOCX → PDF:** Uses `mammoth` HTML output rendered via offscreen DOM/canvas pagination so Bangla and Arabic/RTL scripts shape accurately with Android system fonts.
5. **On-Device AI:** Desktop/cloud AI UI is hidden on Android; an optional **On-Device AI (Experimental)** setting lazy-loads a local browser model only if explicitly enabled and downloaded by the user.
6. **APK Build:** Produces an installable `assembleDebug` APK using `~/android-sdk` (or EC2 via `~/Antigravity.pem` if local JDK/Gradle resources are constrained).

## 4. Architecture & Component Plan

### 4.1 Capacitor & Android Shell
- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/filesystem`, `@capacitor/share`, and `@capacitor/app`.
- Configure `capacitor.config.ts` (`appId: "app.folio.reader"`, `appName: "Folio"`, `webDir: "dist"`).
- Generate `android/` project with `npx cap add android`, configure `AndroidManifest.xml` for `application/pdf` and `.docx` `ACTION_VIEW` intents, `FileProvider`, and a small Java/Kotlin `ContentResolver` helper if needed for `content://` streams.
- Add `src/mobile.ts` for native save/share and incoming file intent handling.

### 4.2 Smallpdf-Style Tools Hub (`src/tools/`)
- `src/tools/mergePdf.ts`
- `src/tools/splitPdf.ts`
- `src/tools/compressPdf.ts`
- `src/tools/imagesToPdf.ts`
- `src/tools/pdfToImages.ts`
- `src/tools/docxToPdf.ts`
- `src/tools/PdfToolsModal.tsx` (grid of tools: Merge, Split, Compress, Images → PDF, PDF → Images, DOCX → PDF, Organize, Sign PDF).

### 4.3 Multilingual Offline OCR (`eng`, `ben`, `ara`)
- Add `@tesseract.js-data/ben` and `@tesseract.js-data/ara` to `devDependencies`.
- Update `scripts/copy-ocr-assets.mjs`, `src/scanLanguagePacks.ts`, and `src/ocrWorker.ts` so `eng`, `ben`, and `ara` are bundled in `public/ocr/` and recognized as built-in offline packs.

### 4.4 Mobile UI, Signatures & Optional On-Device AI
- Responsive CSS in `src/styles.css` (`@media (max-width: 768px)`), touch-friendly signature pad in `SignatureDialog.tsx`, and safe-area padding.
- Conditional AI panel: hidden unless On-Device AI is enabled in Settings.

## 5. Verification Plan
- Unit tests (`vitest`) for `mergePdf`, `splitPdf`, `compressPdf`, `imagesToPdf`, `pdfToImages`, `docxToPdf`, and `scanLanguagePacks` (`eng`, `ben`, `ara`).
- `npx tsc --noEmit` and `npm run build` pass cleanly.
- `npx cap sync android` and Gradle `assembleDebug` succeed, producing an installable APK.

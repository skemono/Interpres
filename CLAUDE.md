# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Interpres

Interpres is a desktop application (Tauri v2 + React/TypeScript) that translates `.docx` (Word) files while preserving all formatting. It supports two translation backends: **OpenRouter** (cloud, free-tier models) and **Ollama** (local).

## Running

```bash
npm install
npm run tauri dev
```

To build for production:
```bash
npm run tauri build
```

No test suite or linter is configured.

## Architecture

### Frontend (React/TypeScript — `src/`)

- **`App.tsx`** — Entry point. Owns all state: file loading, translation orchestration, provider config. Swaps the left panel between `FlowDiagram` (during translation) and `TranslationFlow` (idle). Dark/light theme toggle.
- **`components/FlowDiagram.tsx`** — Left panel **during translation**. Virtualized node-based flow (`@tanstack/react-virtual`) with source card, animated connector, and result card per segment. Custom smooth auto-scroll with easing; pauses on manual scroll.
- **`components/TranslationFlow.tsx`** — Left panel **when idle**. Virtualized segment list showing status (pending/done/skipped), original text, translated text, and location badges (header/footer/footnote/endnote).
- **`components/ControlPanel.tsx`** — Right panel. File picker, language selectors, provider tabs (OpenRouter/Ollama), model selector, API key input, smart detection toggle, progress bar, translate/cancel button, theme toggle.
- **`lib/docx-processor.ts`** — `DocxProcessor` class. Loads `.docx` via JSZip, extracts `w:t` text runs from all document parts (body, headers, footers, footnotes, endnotes) with paragraph IDs using DOMParser. `getRunFormatting()` returns run-level formatting for format-aware merging. Applies translations via string-based XML replacement (never XMLSerializer — preserves OOXML byte-for-byte).
- **`lib/format-merger.ts`** — Format-aware paragraph merging. `buildTranslationUnits()` groups runs by paragraph and merges their text, adding `<fN>` tags around differently-formatted runs so the LLM preserves formatting. `distributeTranslation()` parses tags from translations back into per-run strings.
- **`lib/batch-translator.ts`** — LLM API calls. Smart batching that respects paragraph boundaries (never splits a sentence across batches). Numbered-line prompts with paragraph grouping context. Retry logic with exponential backoff.
- **`lib/types.ts`** — Core types: `TextRun` (with `paragraphId`, `location`), `SegmentState` (with `location`), `TranslationConfig`, `ProgressCallback`, `Provider`.
- **`lib/languages.ts`** — 45 languages + `LANG_TO_FRANC` ISO 639-3 mapping for language detection.

### Backend (Rust — `src-tauri/`)

Minimal Rust backend. Uses Tauri plugins for dialog (file open/save), filesystem (read/write), and HTTP (API calls with CORS bypass).

### Data flow

1. GUI collects file path, languages, provider, model
2. `DocxProcessor.extractAllRuns()` → `TextRun[]` with paragraph IDs from all document parts (body, headers, footers, footnotes, endnotes)
3. Smart detection optionally skips segments already in target language (via `franc-min`)
4. `buildTranslationUnits()` merges same-paragraph runs into format-tagged translation units
5. `translateTexts()` → smart-batched API calls → unit-level translations
6. `distributeTranslation()` parses format tags and maps translated text back to individual runs
7. Progress callbacks update `SegmentState[]` (pending → translating → done) and swap the left panel to `FlowDiagram`
8. `DocxProcessor.applyTranslation()` records changes, `toBytes()` produces final `.docx`
9. Save dialog writes the translated file

### Key details

- OpenRouter models are hardcoded in `OPENROUTER_MODELS` in `batch-translator.ts`
- Ollama models are fetched at runtime via `/api/tags` endpoint (auto-fetched when switching to Ollama)
- Format-aware merging: `buildTranslationUnits()` groups paragraph runs by formatting, tags non-base formats as `<fN>`, so the LLM preserves bold/italic/etc. boundaries
- String-based XML replacement in `applyModsToXml()` preserves all OOXML structure
- Both `FlowDiagram` and `TranslationFlow` use `@tanstack/react-virtual` for windowed rendering
- `FlowDiagram` uses custom `requestAnimationFrame`-based smooth scrolling with cubic easing
- Dark/light theme toggle in ControlPanel, app-level CSS class switching

# Interpres

Translate Word documents while preserving all formatting.

## Features

- Translates `.docx` files — paragraphs, tables, headers, footers, footnotes, endnotes
- Preserves fonts, colors, bold, italic, size, and all other formatting
- Two providers: **OpenRouter** (cloud, free) or **Ollama** (local, private)
- Smart paragraph-aware batching for accurate translations
- Real-time translation flow panel with per-segment progress
- 45+ languages

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri)
- [OpenRouter API key](https://openrouter.ai) (free) or [Ollama](https://ollama.com) running locally

## Setup

```bash
npm install
```

## Usage

```bash
npm run tauri dev
```

1. Open a `.docx` file
2. Pick source and target languages
3. Choose a provider:
   - **OpenRouter** — enter your API key from [openrouter.ai](https://openrouter.ai)
   - **Ollama** — run locally, no API key needed. Models are loaded automatically
4. Hit Translate
5. Watch the translation flow panel update in real-time
6. Save the translated file when prompted

## Build

```bash
npm run tauri build
```

Produces a native installer in `src-tauri/target/release/bundle/`.

## License

MIT

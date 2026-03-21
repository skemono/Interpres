# Interpres

Translate Word documents while preserving all formatting.

## Features

- Translates `.docx` files — paragraphs, tables, headers, footers, shapes, text boxes
- Preserves fonts, colors, bold, italic, size, and all other formatting
- Two providers: **OpenRouter** (cloud, free) or **Ollama** (local, private)
- Batch translation for speed
- 45+ languages

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
python translator.py
```

1. Browse for a `.docx` file
2. Pick source and target languages
3. Choose a provider:
   - **OpenRouter** — enter your API key from [openrouter.ai](https://openrouter.ai)
   - **Ollama** — run locally, no API key needed. Start Ollama first, then click Refresh
4. Hit Translate

Output is saved as `filename_translated.docx` next to the original.

## Requirements

- Python 3.10+
- [OpenRouter API key](https://openrouter.ai) (free) or [Ollama](https://ollama.com) running locally

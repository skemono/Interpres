"""Batch translation via OpenRouter or Ollama API."""

import re
import time
import requests

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OLLAMA_URL = "http://localhost:11434/api/chat"

OPENROUTER_MODELS = [
    "arcee-ai/trinity-large-preview:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-2-9b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "huggingface/zephyr-7b-beta:free",
]

DEFAULT_BATCH_SIZE = 30


def _build_prompt(texts: list[str], source_lang: str, target_lang: str) -> str:
    """Build a numbered-line prompt for batch translation."""
    numbered = "\n".join(f"{i+1}. {text}" for i, text in enumerate(texts))
    return (
        f"You are a professional translator. Translate each numbered line from "
        f"{source_lang} to {target_lang}.\n\n"
        f"Rules:\n"
        f"- Keep the exact same numbering format (1. 2. 3. ...)\n"
        f"- Translate ONLY the text after each number\n"
        f"- Do NOT add explanations, notes, or commentary\n"
        f"- Preserve any special characters, numbers, or symbols that are part of the text\n"
        f"- If a line is already in the target language or untranslatable, keep it as-is\n\n"
        f"Translate these lines:\n\n{numbered}"
    )


def _parse_response(response_text: str, expected_count: int) -> list[str | None]:
    """Parse numbered response back into a list of translations.

    Returns a list of strings (or None for lines that couldn't be parsed).
    """
    translations: list[str | None] = [None] * expected_count

    # Match patterns like "1. translated text" or "1) translated text"
    pattern = re.compile(r"^\s*(\d+)[.)]\s*(.+)$", re.MULTILINE)

    matches = pattern.findall(response_text)
    for num_str, text in matches:
        idx = int(num_str) - 1
        if 0 <= idx < expected_count:
            translations[idx] = text.strip()

    # If numbering parse failed completely, try splitting by lines
    if all(t is None for t in translations):
        lines = response_text.strip().splitlines()
        for i, line in enumerate(lines):
            if i < expected_count:
                # Strip leading number+dot if present
                cleaned = re.sub(r"^\s*\d+[.)]\s*", "", line)
                if cleaned.strip():
                    translations[i] = cleaned.strip()

    return translations


def _call_openrouter(
    api_key: str,
    model: str,
    prompt: str,
    max_retries: int = 3,
    timeout: int = 60,
) -> str:
    """Send a request to OpenRouter API and return the response text."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://docx-translator.local",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
    }

    last_error = None
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                OPENROUTER_URL,
                headers=headers,
                json=payload,
                timeout=timeout,
            )

            if resp.status_code == 429:
                wait = min(2 ** attempt * 5, 60)
                time.sleep(wait)
                continue

            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

        except (requests.RequestException, KeyError, IndexError) as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)

    raise RuntimeError(f"OpenRouter API failed after {max_retries} retries: {last_error}")


def _call_ollama(
    model: str,
    prompt: str,
    host: str = OLLAMA_URL,
    max_retries: int = 2,
    timeout: int = 120,
) -> str:
    """Send a request to local Ollama and return the response text."""
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "stream": False,
        "options": {
            "temperature": 0.3,
        },
    }

    last_error = None
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                host,
                json=payload,
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"]

        except requests.RequestException as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(2)

    raise RuntimeError(f"Ollama API failed: {last_error}. Is Ollama running?")


def get_ollama_models(host: str = OLLAMA_URL) -> list[str]:
    """Fetch available models from local Ollama instance."""
    try:
        resp = requests.get(host.replace("/api/chat", "/api/tags"), timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return [m["name"] for m in data.get("models", [])]
    except requests.RequestException:
        return []


def translate_texts(
    texts: list[str],
    source_lang: str,
    target_lang: str,
    provider: str = "openrouter",
    api_key: str | None = None,
    model: str | None = None,
    ollama_host: str = OLLAMA_URL,
    batch_size: int = DEFAULT_BATCH_SIZE,
    progress_callback=None,
) -> list[str]:
    """Translate a list of texts in batches.

    Args:
        texts: list of strings to translate
        source_lang: source language name (e.g. "English")
        target_lang: target language name (e.g. "Spanish")
        provider: "openrouter" or "ollama"
        api_key: OpenRouter API key (only for openrouter provider)
        model: model ID/name
        ollama_host: Ollama API URL (only for ollama provider)
        batch_size: number of texts per API call
        progress_callback: optional function(completed, total) for progress updates

    Returns:
        list of translated strings, same order as input
    """
    if provider == "openrouter":
        if not model:
            model = OPENROUTER_MODELS[0]
        call_fn = lambda prompt: _call_openrouter(api_key, model, prompt)
    elif provider == "ollama":
        if not model:
            raise RuntimeError("No Ollama model specified. Make sure Ollama is running.")
        call_fn = lambda prompt: _call_ollama(model, prompt, host=ollama_host)
    else:
        raise ValueError(f"Unknown provider: {provider}")

    all_translations: list[str] = []
    total = len(texts)

    for batch_start in range(0, total, batch_size):
        batch_end = min(batch_start + batch_size, total)
        batch = texts[batch_start:batch_end]

        prompt = _build_prompt(batch, source_lang, target_lang)
        response_text = call_fn(prompt)
        translations = _parse_response(response_text, len(batch))

        # Fill in any None translations with original text as fallback
        for i, trans in enumerate(translations):
            if trans is None:
                translations[i] = batch[i]

        all_translations.extend(t for t in translations if t is not None)

        if progress_callback:
            progress_callback(min(batch_end, total), total)

    return all_translations


def get_available_models() -> list[str]:
    """Return list of free OpenRouter model IDs."""
    return list(OPENROUTER_MODELS)

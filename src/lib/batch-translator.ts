import { fetch } from "@tauri-apps/plugin-http";
import { LANG_TO_FRANC } from "./languages";
import type { ProgressCallback } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_BATCH_SIZE = 30;

export const OPENROUTER_MODELS = [
  "arcee-ai/trinity-large-preview:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-2-9b-it:free",
  "mistralai/mistral-7b-instruct:free",
  "huggingface/zephyr-7b-beta:free",
];

// --- Language detection ---

const MIN_DETECT_LENGTH = 8;
const HAS_ALPHA = /[\p{Letter}]/u;

export function detectAlreadyTranslated(
  texts: string[],
  targetLang: string
): boolean[] {
  return texts.map((text) => {
    const stripped = text.trim();
    if (!HAS_ALPHA.test(stripped)) return true;
    if (stripped.length < MIN_DETECT_LENGTH) return false;
    return false;
  });
}

export async function detectAlreadyTranslatedAsync(
  texts: string[],
  targetLang: string
): Promise<boolean[]> {
  const targetCode = LANG_TO_FRANC[targetLang];
  if (!targetCode) return texts.map(() => false);

  let francAll: ((text: string) => [string, number][]) | null = null;
  try {
    const mod = await import("franc-min");
    francAll = mod.francAll;
  } catch {
    return detectAlreadyTranslated(texts, targetLang);
  }

  return texts.map((text) => {
    const stripped = text.trim();
    if (!HAS_ALPHA.test(stripped)) return true;
    if (stripped.length < MIN_DETECT_LENGTH) return false;

    try {
      const results = francAll!(stripped);
      if (
        results.length > 0 &&
        results[0][0] === targetCode &&
        results[0][1] >= 0.8
      ) {
        return true;
      }
    } catch {
      // Detection failed — translate to be safe
    }
    return false;
  });
}

// --- Smart batching ---

/**
 * Build batch boundaries that never split a paragraph across batches.
 * When a fixed-size boundary falls mid-paragraph, the batch is shortened
 * to the previous paragraph boundary. If one paragraph exceeds batchSize,
 * it extends the batch to include the whole paragraph.
 */
function buildSmartBatches(
  total: number,
  paragraphIds: string[] | undefined,
  batchSize: number
): { start: number; end: number }[] {
  if (!paragraphIds || total === 0) {
    const batches: { start: number; end: number }[] = [];
    for (let i = 0; i < total; i += batchSize) {
      batches.push({ start: i, end: Math.min(i + batchSize, total) });
    }
    return batches;
  }

  const batches: { start: number; end: number }[] = [];
  let batchStart = 0;

  while (batchStart < total) {
    if (batchStart + batchSize >= total) {
      batches.push({ start: batchStart, end: total });
      break;
    }

    let batchEnd = batchStart + batchSize;

    // Try to end at the last paragraph boundary before batchEnd
    let lastBoundary = batchEnd;
    while (
      lastBoundary > batchStart &&
      paragraphIds[lastBoundary] === paragraphIds[lastBoundary - 1]
    ) {
      lastBoundary--;
    }

    if (lastBoundary > batchStart) {
      batchEnd = lastBoundary;
    } else {
      // Entire range is one paragraph — extend to include all of it
      while (
        batchEnd < total &&
        paragraphIds[batchEnd] === paragraphIds[batchEnd - 1]
      ) {
        batchEnd++;
      }
    }

    batches.push({ start: batchStart, end: batchEnd });
    batchStart = batchEnd;
  }

  return batches;
}

// --- Prompt building & response parsing ---

function buildPrompt(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  paragraphIds?: string[]
): string {
  // Build numbered lines with paragraph grouping context
  const lines: string[] = [];
  let currentParaId = "";

  for (let i = 0; i < texts.length; i++) {
    const pid = paragraphIds?.[i] ?? "";
    if (pid && pid === currentParaId) {
      // Continuation of same paragraph — no separator
    } else {
      // New paragraph — add blank line separator (except before the first line)
      if (i > 0 && pid) lines.push("");
      currentParaId = pid;
    }
    lines.push(`${i + 1}. ${texts[i]}`);
  }

  const numbered = lines.join("\n");

  // Detect format tags in the batch
  const hasFormatTags = texts.some((t) => /<f\d+>/.test(t));

  let rules =
    `- Keep the exact same numbering format (1. 2. 3. ...)\n` +
    `- Translate ONLY the text after each number\n` +
    `- Do NOT add explanations, notes, or commentary\n` +
    `- Preserve any special characters, numbers, or symbols that are part of the text\n` +
    `- If a line is already in the target language or untranslatable, keep it as-is\n` +
    `- Keep punctuation marks and very short fragments (1-2 characters) unchanged\n` +
    `- Consecutive lines (grouped together without blank lines) are fragments of the same sentence — ensure their translations are coherent and flow naturally when combined\n`;

  if (hasFormatTags) {
    rules +=
      `- IMPORTANT: Some lines contain formatting markers like <f1>text</f1>. ` +
      `These mark specially formatted text (bold, italic, etc). You MUST keep ` +
      `these markers in your translation, wrapping the equivalent translated ` +
      `word(s). Do not change, add, or remove any markers. ` +
      `Example: "I am <f1>happy</f1> today" translates to "Estoy <f1>feliz</f1> hoy"\n`;
  }

  return (
    `You are a professional translator. Translate each numbered line from ` +
    `${sourceLang} to ${targetLang}.\n\n` +
    `Rules:\n${rules}\n` +
    `Translate these lines:\n\n${numbered}`
  );
}

function parseResponse(
  responseText: string,
  expectedCount: number
): (string | null)[] {
  const translations: (string | null)[] = [];
  for (let i = 0; i < expectedCount; i++) translations.push(null);
  const lines = responseText.trim().split("\n");
  const numberPattern = /^\s*(\d+)[.)]\s*(.*)/;

  const entries: [number, number, string][] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(numberPattern);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= 1 && num <= expectedCount) {
        entries.push([i, num, m[2]]);
      }
    }
  }

  if (entries.length > 0) {
    for (let eIdx = 0; eIdx < entries.length; eIdx++) {
      const [lineIdx, num, firstText] = entries[eIdx];
      const idx = num - 1;

      const nextLineIdx =
        eIdx + 1 < entries.length ? entries[eIdx + 1][0] : lines.length;

      const parts = [firstText];
      for (let ci = lineIdx + 1; ci < nextLineIdx; ci++) {
        parts.push(lines[ci]);
      }

      const fullText = parts.join("\n").trim();
      if (fullText) {
        translations[idx] = fullText;
      }
    }
  }

  // Fallback: if numbering parse failed, try line-by-line
  if (!translations.some((t) => t !== null)) {
    for (let i = 0; i < lines.length && i < expectedCount; i++) {
      const cleaned = lines[i].replace(/^\s*\d+[.)]\s*/, "").trim();
      if (cleaned) {
        translations[i] = cleaned;
      }
    }
  }

  return translations;
}

// --- Timeout helper ---

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// --- API calls ---

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  maxRetries = 3,
  timeout = 60000
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        OPENROUTER_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://interpres.local",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 4096,
          }),
        },
        timeout
      );

      if (resp.status === 429) {
        const wait = Math.min(2 ** attempt * 5000, 60000);
        await sleep(wait);
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const data = await resp.json();
      return data.choices[0].message.content;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries - 1) {
        await sleep(2 ** attempt * 1000);
      }
    }
  }

  throw new Error(
    `OpenRouter API failed after ${maxRetries} retries: ${lastError}`
  );
}

async function callOllama(
  model: string,
  prompt: string,
  host: string,
  maxRetries = 2,
  timeout = 120000
): Promise<string> {
  const url = `${host.replace(/\/+$/, "")}/api/chat`;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            options: { temperature: 0.3 },
          }),
        },
        timeout
      );

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const data = await resp.json();
      return data.message.content;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries - 1) {
        await sleep(2000);
      }
    }
  }

  throw new Error(`Ollama API failed: ${lastError}. Is Ollama running?`);
}

// --- Public API ---

export async function getOllamaModels(
  host = "http://localhost:11434"
): Promise<string[]> {
  const url = `${host.replace(/\/+$/, "")}/api/tags`;
  const resp = await fetchWithTimeout(
    url,
    { method: "GET", headers: { Origin: "http://localhost" } },
    5000
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.models || []).map((m: { name: string }) => m.name);
}

export async function translateTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string,
  provider: "openrouter" | "ollama",
  apiKey: string,
  model: string,
  ollamaHost = "http://localhost:11434",
  batchSize = DEFAULT_BATCH_SIZE,
  progressCallback?: ProgressCallback,
  shouldCancel?: () => boolean,
  paragraphIds?: string[]
): Promise<string[]> {
  const callFn =
    provider === "openrouter"
      ? (prompt: string) => callOpenRouter(apiKey, model, prompt)
      : (prompt: string) => callOllama(model, prompt, ollamaHost);

  const allTranslations: string[] = new Array(texts.length).fill("");
  const total = texts.length;

  const batches = buildSmartBatches(total, paragraphIds, batchSize);

  for (const { start: batchStart, end: batchEnd } of batches) {
    if (shouldCancel?.()) break;

    const batch = texts.slice(batchStart, batchEnd);
    const batchParaIds = paragraphIds?.slice(batchStart, batchEnd);

    await progressCallback?.(batchStart, batchEnd, total, null);

    if (shouldCancel?.()) break;

    const prompt = buildPrompt(batch, sourceLang, targetLang, batchParaIds);
    const responseText = await callFn(prompt);
    const translations = parseResponse(responseText, batch.length);

    // Fill nulls with original text as fallback
    let fallbackCount = 0;
    for (let i = 0; i < translations.length; i++) {
      if (translations[i] === null) {
        translations[i] = batch[i];
        fallbackCount++;
      }
    }

    if (fallbackCount > 0) {
      console.warn(
        `${fallbackCount}/${batch.length} segments in batch at index ${batchStart} ` +
          `could not be parsed, using original text as fallback`
      );
    }

    for (let i = 0; i < translations.length; i++) {
      allTranslations[batchStart + i] = translations[i] as string;
    }

    await progressCallback?.(batchStart, batchEnd, total, translations as string[]);
  }

  return allTranslations;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

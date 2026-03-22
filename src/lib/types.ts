export interface TextRun {
  /** Which XML part this text lives in, e.g. "word/document.xml" */
  partName: string;
  /** Index of this w:t element within the part (for relocating it later) */
  elementIndex: number;
  /** The original text content */
  originalText: string;
  /** Human-readable location: "body", "header", "footer", "footnote", etc. */
  location: string;
  /** Identifies which paragraph this run belongs to, e.g. "word/document.xml:p42" */
  paragraphId: string;
}

export type TranslationStatus = "pending" | "translating" | "done" | "skipped";

export interface SegmentState {
  originalText: string;
  translatedText?: string;
  status: TranslationStatus;
  location: string;
}

export type Provider = "openrouter" | "ollama";

export interface TranslationConfig {
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  apiKey: string;
  model: string;
  ollamaHost: string;
  batchSize: number;
  smartDetect: boolean;
}

export type ProgressCallback = (
  batchStart: number,
  batchEnd: number,
  total: number,
  translations: string[] | null
) => void | Promise<void>;

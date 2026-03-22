import { useState, useRef, useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import FlowDiagram from "./components/FlowDiagram";
import TranslationFlow from "./components/TranslationFlow";
import ControlPanel from "./components/ControlPanel";
import { DocxProcessor } from "./lib/docx-processor";
import {
  translateTexts,
  getOllamaModels,
  detectAlreadyTranslatedAsync,
  OPENROUTER_MODELS,
} from "./lib/batch-translator";
import {
  buildTranslationUnits,
  distributeTranslation,
} from "./lib/format-merger";
import type { Provider, TextRun, SegmentState } from "./lib/types";

export default function App() {
  // File state
  const [fileName, setFileName] = useState("");
  const [filePath, setFilePath] = useState("");

  // Translation flow state
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Language state
  const [sourceLang, setSourceLang] = useState("English");
  const [targetLang, setTargetLang] = useState("Spanish");

  // Provider state
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(OPENROUTER_MODELS[0]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaHost, setOllamaHost] = useState("http://localhost:11434");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Translation state
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, skipped: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [smartDetect, setSmartDetect] = useState(true);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Refs
  const processorRef = useRef<DocxProcessor | null>(null);
  const runsRef = useRef<TextRun[]>([]);
  const cancelRef = useRef(false);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // --- File handling ---

  const handleOpenFile = useCallback(async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Word Documents", extensions: ["docx"] }],
      });

      if (!path || typeof path !== "string") return;

      const bytes = await readFile(path);

      const processor = new DocxProcessor();
      await processor.load(bytes);

      const runs = processor.extractAllRuns();

      processorRef.current = processor;
      runsRef.current = runs;
      setFilePath(path);
      setFileName(path);
      setSegments(
        runs.map((r) => ({
          originalText: r.originalText,
          status: "pending" as const,
          location: r.location,
        }))
      );
      setActiveIndex(-1);
      setStatusMessage(`Loaded ${runs.length} text segments`);
      setProgress({ current: 0, total: 0, skipped: 0 });
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  }, []);

  // --- Provider handling ---

  const handleProviderChange = useCallback(
    async (p: Provider) => {
      setProvider(p);
      if (p === "openrouter") {
        setModel(OPENROUTER_MODELS[0]);
      } else {
        // Auto-fetch Ollama models when switching to Ollama
        setModel("");
        setIsRefreshing(true);
        try {
          const models = await getOllamaModels(ollamaHost);
          setOllamaModels(models);
          if (models.length > 0) {
            setModel(models[0]);
            setStatusMessage(`Found ${models.length} Ollama models`);
          } else {
            setStatusMessage("No Ollama models found. Is Ollama running?");
          }
        } catch (err) {
          setStatusMessage(`Ollama error: ${err}`);
        }
        setIsRefreshing(false);
      }
    },
    [ollamaHost]
  );

  const handleRefreshOllama = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const models = await getOllamaModels(ollamaHost);
      setOllamaModels(models);
      if (models.length > 0) {
        setModel(models[0]);
        setStatusMessage(`Found ${models.length} Ollama models`);
      } else {
        setModel("");
        setStatusMessage("No Ollama models found. Is Ollama running?");
      }
    } catch (err) {
      setStatusMessage(`Ollama error: ${err}`);
    }
    setIsRefreshing(false);
  }, [ollamaHost]);

  // --- Translation ---

  const handleTranslate = useCallback(async () => {
    const processor = processorRef.current;
    const runs = runsRef.current;

    if (!processor) {
      setStatusMessage("Error: No document loaded");
      return;
    }

    if (runs.length === 0) {
      setStatusMessage("Error: No translatable text found in the document");
      return;
    }

    if (provider === "openrouter" && !apiKey.trim()) {
      setStatusMessage("Error: Enter your OpenRouter API key");
      return;
    }

    if (!model || model.startsWith("No models")) {
      setStatusMessage("Error: Select a model");
      return;
    }

    cancelRef.current = false;
    setIsTranslating(true);
    setStatusMessage("Starting translation...");

    // Reset all segments to pending
    setSegments(
      runs.map((r) => ({
        originalText: r.originalText,
        status: "pending" as const,
        location: r.location,
      }))
    );
    setActiveIndex(-1);

    try {
      const allTexts = runs.map((r) => r.originalText);
      let skipMask: boolean[] = new Array(allTexts.length).fill(false);

      // Smart detection phase
      if (smartDetect) {
        setStatusMessage("Detecting already translated segments...");
        skipMask = await detectAlreadyTranslatedAsync(allTexts, targetLang);
        const skippedCount = skipMask.filter(Boolean).length;
        setProgress({ current: skippedCount, total: allTexts.length, skipped: skippedCount });

        // Mark skipped segments
        setSegments((prev) =>
          prev.map((seg, i) =>
            skipMask[i] ? { ...seg, status: "skipped" as const } : seg
          )
        );
      } else {
        setProgress({ current: 0, total: allTexts.length, skipped: 0 });
      }

      // Filter to only segments needing translation
      const indicesToTranslate = allTexts
        .map((_, i) => i)
        .filter((i) => !skipMask[i]);

      if (indicesToTranslate.length === 0) {
        setStatusMessage("Done! All segments were already in the target language.");
        setIsTranslating(false);
        return;
      }

      // Build format-aware translation units (merge paragraph runs with format tags)
      const units = buildTranslationUnits(
        runs,
        indicesToTranslate,
        (run) => processor.getRunFormatting(run)
      );
      const unitTexts = units.map((u) => u.mergedText);
      const unitParagraphIds = units.map((u) => u.paragraphId);

      const skippedCount = skipMask.filter(Boolean).length;
      setStatusMessage(
        `Translating ${indicesToTranslate.length} segments (${units.length} groups)...`
      );

      // Translation with flow panel updates
      await translateTexts(
        unitTexts,
        sourceLang,
        targetLang,
        provider,
        apiKey,
        model,
        ollamaHost,
        30,
        async (batchStart, batchEnd, total, batchTranslations) => {
          if (cancelRef.current) return;

          if (!batchTranslations) {
            // Batch starting — mark all runs in these units as "translating"
            setSegments((prev) => {
              const next = [...prev];
              for (let u = batchStart; u < batchEnd; u++) {
                for (const origIdx of units[u].originalRunIndices) {
                  next[origIdx] = { ...next[origIdx], status: "translating" };
                }
              }
              return next;
            });
            setActiveIndex(units[batchStart].originalRunIndices[0]);
          } else {
            // Batch complete — distribute translations and apply to runs
            const allDistributed: { origIdx: number; text: string }[] = [];
            for (let i = 0; i < batchTranslations.length; i++) {
              const unit = units[batchStart + i];
              const distributed = distributeTranslation(unit, batchTranslations[i]);
              for (let j = 0; j < distributed.length; j++) {
                const origIdx = unit.originalRunIndices[j];
                processor.applyTranslation(runs[origIdx], distributed[j]);
                allDistributed.push({ origIdx, text: distributed[j] });
              }
            }

            setSegments((prev) => {
              const next = [...prev];
              for (const { origIdx, text } of allDistributed) {
                next[origIdx] = {
                  ...next[origIdx],
                  status: "done",
                  translatedText: text || "(merged)",
                };
              }
              return next;
            });

            // Count completed runs across all units processed so far
            let completedRuns = 0;
            for (let u = 0; u < batchEnd; u++) {
              completedRuns += units[u].originalRunIndices.length;
            }
            const completedCount = completedRuns + skippedCount;

            setProgress((prev) => ({
              ...prev,
              current: Math.min(completedCount, prev.total),
            }));

            setStatusMessage(
              `Translated ${completedCount} / ${allTexts.length} segments`
            );
          }
        },
        () => cancelRef.current,
        unitParagraphIds
      );

      if (cancelRef.current) {
        setStatusMessage("Translation cancelled");
        setIsTranslating(false);
        setActiveIndex(-1);
        return;
      }

      setActiveIndex(-1);

      // Save dialog — default to same directory as source file
      const finalBytes = await processor.toBytes();
      const defaultPath = filePath.replace(/\.docx$/i, "_translated.docx");

      const savePath = await save({
        defaultPath,
        filters: [{ name: "Word Documents", extensions: ["docx"] }],
      });

      if (savePath) {
        await writeFile(savePath, finalBytes);
        setStatusMessage(`Done! Saved to ${savePath.split(/[/\\]/).pop()}`);
      } else {
        setStatusMessage("Done! Translation complete (not saved)");
      }

      setProgress((prev) => ({ ...prev, current: prev.total }));
    } catch (err) {
      if (!cancelRef.current) {
        setStatusMessage(`Error: ${err}`);
      }
    }

    setIsTranslating(false);
    setActiveIndex(-1);
  }, [provider, apiKey, model, sourceLang, targetLang, smartDetect, filePath, ollamaHost]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setStatusMessage("Cancelling...");
  }, []);

   return (
     <div className={`app ${theme}`}>
       {isTranslating ? (
         <FlowDiagram segments={segments} activeIndex={activeIndex} />
       ) : (
         <TranslationFlow
           segments={segments}
           activeIndex={activeIndex}
           isTranslating={isTranslating}
           fileName={fileName}
         />
       )}
       <ControlPanel
         fileName={fileName}
         onOpenFile={handleOpenFile}
         sourceLang={sourceLang}
         onSourceLangChange={setSourceLang}
         targetLang={targetLang}
         onTargetLangChange={setTargetLang}
         provider={provider}
         onProviderChange={handleProviderChange}
         apiKey={apiKey}
         onApiKeyChange={setApiKey}
         model={model}
         onModelChange={setModel}
         ollamaModels={ollamaModels}
         ollamaHost={ollamaHost}
         onOllamaHostChange={setOllamaHost}
         onRefreshOllama={handleRefreshOllama}
         isRefreshing={isRefreshing}
         smartDetect={smartDetect}
         onSmartDetectChange={setSmartDetect}
         isTranslating={isTranslating}
         progress={progress}
         onTranslate={handleTranslate}
         onCancel={handleCancel}
         statusMessage={statusMessage}
         theme={theme}
         onThemeToggle={toggleTheme}
       />
     </div>
   );
}

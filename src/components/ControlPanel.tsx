import { useState } from "react";
import type { Provider } from "../lib/types";
import { LANGUAGES } from "../lib/languages";
import { OPENROUTER_MODELS } from "../lib/batch-translator";

interface Props {
  fileName: string;
  onOpenFile: () => void;
  sourceLang: string;
  onSourceLangChange: (lang: string) => void;
  targetLang: string;
  onTargetLangChange: (lang: string) => void;
  provider: Provider;
  onProviderChange: (p: Provider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  ollamaModels: string[];
  ollamaHost: string;
  onOllamaHostChange: (host: string) => void;
  onRefreshOllama: () => void;
  isRefreshing: boolean;
  smartDetect: boolean;
  onSmartDetectChange: (v: boolean) => void;
  isTranslating: boolean;
  progress: { current: number; total: number; skipped: number };
  onTranslate: () => void;
  onCancel: () => void;
  statusMessage: string;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export default function ControlPanel({
  fileName,
  onOpenFile,
  sourceLang,
  onSourceLangChange,
  targetLang,
  onTargetLangChange,
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  ollamaModels,
  ollamaHost,
  onOllamaHostChange,
  onRefreshOllama,
  isRefreshing,
  smartDetect,
  onSmartDetectChange,
  isTranslating,
  progress,
  onTranslate,
  onCancel,
  statusMessage,
  theme,
  onThemeToggle,
}: Props) {
  const [showKey, setShowKey] = useState(false);

  const models = provider === "openrouter" ? OPENROUTER_MODELS : ollamaModels;
  const progressPct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <div className="control-panel">
       <div className="panel-header">
         <h1 className="app-title">Interpres</h1>
         <span className="app-subtitle">Document Translator</span>
         <button className="btn btn-sm" onClick={onThemeToggle} title="Toggle theme">
           {theme === 'dark' ? '\u263E' : '\u263C'} {/* moon/sun */}
         </button>
       </div>

      {/* File Selection */}
      <section className="control-section">
        <label className="section-label">Document</label>
        <button className="btn btn-secondary btn-block" onClick={onOpenFile} disabled={isTranslating}>
          {fileName ? "Change File" : "Open .docx File"}
        </button>
        {fileName && (
          <div className="file-name" title={fileName}>
            {fileName.split(/[/\\]/).pop()}
          </div>
        )}
      </section>

      {/* Language Selection */}
      <section className="control-section">
        <label className="section-label">Languages</label>
        <div className="lang-row">
          <div className="lang-field">
            <span className="field-label">From</span>
            <select
              value={sourceLang}
              onChange={(e) => onSourceLangChange(e.target.value)}
              disabled={isTranslating}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="lang-arrow">&#8594;</div>
          <div className="lang-field">
            <span className="field-label">To</span>
            <select
              value={targetLang}
              onChange={(e) => onTargetLangChange(e.target.value)}
              disabled={isTranslating}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Provider Selection */}
      <section className="control-section">
        <label className="section-label">Provider</label>
        <div className="provider-tabs">
          <button
            className={`tab ${provider === "openrouter" ? "active" : ""}`}
            onClick={() => onProviderChange("openrouter")}
            disabled={isTranslating}
          >
            OpenRouter
          </button>
          <button
            className={`tab ${provider === "ollama" ? "active" : ""}`}
            onClick={() => onProviderChange("ollama")}
            disabled={isTranslating}
          >
            Ollama
          </button>
        </div>

        {/* Model Selection */}
        <div className="field-group">
          <span className="field-label">Model</span>
          <div className="model-row">
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isTranslating}
            >
              {models.length === 0 && (
                <option value="">No models available</option>
              )}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {provider === "ollama" && (
              <button
                className="btn btn-sm"
                onClick={onRefreshOllama}
                disabled={isTranslating || isRefreshing}
                title="Refresh models"
              >
                {isRefreshing ? "..." : "\u21BB"}
              </button>
            )}
          </div>
        </div>

        {/* Ollama Host */}
        {provider === "ollama" && (
          <div className="field-group">
            <span className="field-label">Host URL</span>
            <input
              type="text"
              value={ollamaHost}
              onChange={(e) => onOllamaHostChange(e.target.value)}
              placeholder="http://localhost:11434"
              disabled={isTranslating}
            />
          </div>
        )}

        {/* API Key (OpenRouter only) */}
        {provider === "openrouter" && (
          <div className="field-group">
            <span className="field-label">API Key</span>
            <div className="key-row">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk-or-..."
                disabled={isTranslating}
              />
              <button
                className="btn btn-sm"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? "\u25C9" : "\u25CE"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Options */}
      <section className="control-section">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={smartDetect}
            onChange={(e) => onSmartDetectChange(e.target.checked)}
            disabled={isTranslating}
          />
          <span>Skip already translated segments</span>
        </label>
      </section>

      {/* Progress */}
      {isTranslating && (
        <section className="control-section">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="progress-text">
            {progress.current} / {progress.total} segments
            {progress.skipped > 0 && ` (${progress.skipped} skipped)`}
            {" \u2014 "}{progressPct}%
          </div>
        </section>
      )}

      {/* Status */}
      {statusMessage && (
        <div className={`status-message ${statusMessage.startsWith("Error") ? "error" : statusMessage.startsWith("Done") ? "success" : ""}`}>
          {statusMessage}
        </div>
      )}

      {/* Translate Button */}
      <section className="control-section action-section">
        {isTranslating ? (
          <button className="btn btn-danger btn-block" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button
            className="btn btn-primary btn-block"
            onClick={onTranslate}
            disabled={!fileName}
          >
            Translate
          </button>
        )}
      </section>
    </div>
  );
}

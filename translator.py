"""Docx Translator — Modern desktop app for translating .docx files."""

import os
import threading
import customtkinter as ctk
from tkinter import filedialog, messagebox
from pathlib import Path

from docx import Document

from docx_processor import extract_all_runs, apply_translations
from batch_translator import (
    translate_texts,
    get_available_models,
    get_ollama_models,
    OLLAMA_URL,
)

LANGUAGES = [
    "English", "Spanish", "French", "German", "Italian", "Portuguese",
    "Russian", "Chinese (Simplified)", "Chinese (Traditional)", "Japanese",
    "Korean", "Arabic", "Hindi", "Dutch", "Polish", "Turkish",
    "Swedish", "Norwegian", "Danish", "Finnish", "Czech", "Romanian",
    "Hungarian", "Greek", "Hebrew", "Thai", "Vietnamese", "Indonesian",
    "Malay", "Ukrainian", "Bulgarian", "Croatian", "Serbian", "Slovak",
    "Slovenian", "Lithuanian", "Latvian", "Estonian", "Catalan",
    "Basque", "Galician", "Welsh", "Irish", "Tagalog", "Swahili",
]

APP_TITLE = "Interpres"


class TranslatorApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.title(APP_TITLE)
        self.geometry("540x620")
        self.resizable(False, False)

        # State
        self.file_path = ctk.StringVar()
        self.source_lang = ctk.StringVar(value="English")
        self.target_lang = ctk.StringVar(value="Spanish")
        self.provider = ctk.StringVar(value="OpenRouter")
        self.api_key = ctk.StringVar(value=os.environ.get("OPENROUTER_API_KEY", ""))
        self.or_model = ctk.StringVar(value=get_available_models()[0] if get_available_models() else "")
        self.ol_model = ctk.StringVar()
        self.ollama_host = ctk.StringVar(value=OLLAMA_URL)
        self.status_var = ctk.StringVar(value="Ready")
        self.is_running = False

        self.ollama_models: list[str] = []

        self._build_ui()

    def _build_ui(self):
        # Main container with padding
        main = ctk.CTkFrame(self, fg_color="transparent")
        main.pack(fill="both", expand=True, padx=24, pady=20)

        # --- Title ---
        title = ctk.CTkLabel(
            main, text="Interpres",
            font=ctk.CTkFont(size=26, weight="bold"),
        )
        title.pack(anchor="w", pady=(0, 2))

        subtitle = ctk.CTkLabel(
            main, text="Translate Word documents while preserving formatting",
            font=ctk.CTkFont(size=13),
            text_color="gray60",
        )
        subtitle.pack(anchor="w", pady=(0, 18))

        # --- File picker ---
        file_label = ctk.CTkLabel(main, text="Document", font=ctk.CTkFont(size=14, weight="bold"))
        file_label.pack(anchor="w", pady=(0, 6))

        file_row = ctk.CTkFrame(main, fg_color="transparent")
        file_row.pack(fill="x", pady=(0, 14))

        self.file_entry = ctk.CTkEntry(
            file_row, textvariable=self.file_path,
            placeholder_text="Select a .docx file...",
            height=40, corner_radius=8,
        )
        self.file_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))

        browse_btn = ctk.CTkButton(
            file_row, text="Browse", width=100, height=40,
            corner_radius=8, command=self._browse_file,
        )
        browse_btn.pack(side="right")

        # --- Languages ---
        lang_label = ctk.CTkLabel(main, text="Languages", font=ctk.CTkFont(size=14, weight="bold"))
        lang_label.pack(anchor="w", pady=(0, 6))

        lang_row = ctk.CTkFrame(main, fg_color="transparent")
        lang_row.pack(fill="x", pady=(0, 14))

        # From
        from_frame = ctk.CTkFrame(lang_row, fg_color="transparent")
        from_frame.pack(side="left", fill="x", expand=True, padx=(0, 8))

        ctk.CTkLabel(from_frame, text="From", font=ctk.CTkFont(size=12), text_color="gray65").pack(anchor="w")
        self.src_combo = ctk.CTkComboBox(
            from_frame, variable=self.source_lang,
            values=LANGUAGES, height=40, corner_radius=8,
            state="readonly", dropdown_font=ctk.CTkFont(size=13),
        )
        self.src_combo.pack(fill="x", pady=(4, 0))

        # Swap button
        swap_btn = ctk.CTkButton(
            lang_row, text="\u2194", width=36, height=40,
            corner_radius=8, font=ctk.CTkFont(size=18),
            command=self._swap_languages,
        )
        swap_btn.pack(side="left", padx=4, pady=(18, 0))

        # To
        to_frame = ctk.CTkFrame(lang_row, fg_color="transparent")
        to_frame.pack(side="left", fill="x", expand=True, padx=(8, 0))

        ctk.CTkLabel(to_frame, text="To", font=ctk.CTkFont(size=12), text_color="gray65").pack(anchor="w")
        self.tgt_combo = ctk.CTkComboBox(
            to_frame, variable=self.target_lang,
            values=LANGUAGES, height=40, corner_radius=8,
            state="readonly", dropdown_font=ctk.CTkFont(size=13),
        )
        self.tgt_combo.pack(fill="x", pady=(4, 0))

        # --- Provider ---
        provider_label = ctk.CTkLabel(main, text="Provider", font=ctk.CTkFont(size=14, weight="bold"))
        provider_label.pack(anchor="w", pady=(0, 6))

        self.provider_seg = ctk.CTkSegmentedButton(
            main, values=["OpenRouter", "Ollama"],
            variable=self.provider, height=40, corner_radius=8,
            command=self._on_provider_change,
        )
        self.provider_seg.pack(fill="x", pady=(0, 10))

        # --- OpenRouter frame ---
        self.or_frame = ctk.CTkFrame(main, fg_color="transparent")
        self.or_frame.pack(fill="x", pady=(0, 10))

        ctk.CTkLabel(self.or_frame, text="API Key", font=ctk.CTkFont(size=12), text_color="gray65").pack(anchor="w")
        self.or_key_entry = ctk.CTkEntry(
            self.or_frame, textvariable=self.api_key,
            placeholder_text="sk-or-...", show="\u2022",
            height=40, corner_radius=8,
        )
        self.or_key_entry.pack(fill="x", pady=(4, 10))

        ctk.CTkLabel(self.or_frame, text="Model", font=ctk.CTkFont(size=12), text_color="gray65").pack(anchor="w")
        self.or_model_combo = ctk.CTkComboBox(
            self.or_frame, variable=self.or_model,
            values=get_available_models(), height=40, corner_radius=8,
            state="readonly", dropdown_font=ctk.CTkFont(size=12),
        )
        self.or_model_combo.pack(fill="x", pady=(4, 0))

        # --- Ollama frame ---
        self.ol_frame = ctk.CTkFrame(main, fg_color="transparent")

        ctk.CTkLabel(self.ol_frame, text="Host", font=ctk.CTkFont(size=12), text_color="gray65").pack(anchor="w")
        self.ol_host_entry = ctk.CTkEntry(
            self.ol_frame, textvariable=self.ollama_host,
            placeholder_text="http://localhost:11434",
            height=40, corner_radius=8,
        )
        self.ol_host_entry.pack(fill="x", pady=(4, 10))

        ctk.CTkLabel(self.ol_frame, text="Model", font=ctk.CTkFont(size=12), text_color="gray65").pack(anchor="w")
        ol_model_row = ctk.CTkFrame(self.ol_frame, fg_color="transparent")
        ol_model_row.pack(fill="x", pady=(4, 0))

        self.ol_model_combo = ctk.CTkComboBox(
            ol_model_row, variable=self.ol_model,
            values=[], height=40, corner_radius=8,
            state="readonly", dropdown_font=ctk.CTkFont(size=12),
        )
        self.ol_model_combo.pack(side="left", fill="x", expand=True, padx=(0, 8))

        self.refresh_btn = ctk.CTkButton(
            ol_model_row, text="\u21bb", width=40, height=40,
            corner_radius=8, font=ctk.CTkFont(size=18),
            command=self._refresh_ollama_models,
        )
        self.refresh_btn.pack(side="right")

        # --- Progress ---
        self.progress_bar = ctk.CTkProgressBar(main, height=8, corner_radius=4)
        self.progress_bar.pack(fill="x", pady=(18, 6))
        self.progress_bar.set(0)

        self.status_label = ctk.CTkLabel(
            main, textvariable=self.status_var,
            font=ctk.CTkFont(size=12), text_color="gray60",
        )
        self.status_label.pack(anchor="w")

        # --- Translate button ---
        self.translate_btn = ctk.CTkButton(
            main, text="Translate", height=48, corner_radius=10,
            font=ctk.CTkFont(size=16, weight="bold"),
            command=self._start_translation,
        )
        self.translate_btn.pack(fill="x", pady=(16, 0))

        # Init provider view
        self._on_provider_change("OpenRouter")

    def _on_provider_change(self, value):
        if value == "OpenRouter":
            self.ol_frame.pack_forget()
            self.or_frame.pack(fill="x", pady=(0, 10))
        else:
            self.or_frame.pack_forget()
            self.ol_frame.pack(fill="x", pady=(0, 10))
            self._refresh_ollama_models()

    def _swap_languages(self):
        src = self.source_lang.get()
        tgt = self.target_lang.get()
        self.source_lang.set(tgt)
        self.target_lang.set(src)

    def _refresh_ollama_models(self):
        host = self.ollama_host.get().strip()
        self.ollama_models = get_ollama_models(host or OLLAMA_URL)
        self.ol_model_combo.configure(values=self.ollama_models)
        if self.ollama_models:
            self.ol_model.set(self.ollama_models[0])
            self.status_var.set(f"Found {len(self.ollama_models)} Ollama model(s)")
        else:
            self.ol_model.set("")
            self.status_var.set("No Ollama models found. Is Ollama running?")

    def _browse_file(self):
        path = filedialog.askopenfilename(
            title="Select .docx file",
            filetypes=[("Word Documents", "*.docx"), ("All files", "*.*")],
        )
        if path:
            self.file_path.set(path)

    def _start_translation(self):
        if self.is_running:
            return

        path = self.file_path.get().strip()
        if not path:
            messagebox.showwarning("No file", "Please select a .docx file first.")
            return
        if not Path(path).exists():
            messagebox.showerror("File not found", f"File does not exist:\n{path}")
            return

        prov = self.provider.get().lower()

        if prov == "openrouter":
            api_key = self.api_key.get().strip()
            if not api_key:
                messagebox.showwarning("No API key", "Please enter your OpenRouter API key.")
                return
        else:
            api_key = None

        model = (self.or_model if prov == "openrouter" else self.ol_model).get().strip()
        if not model:
            messagebox.showwarning("No model", "Please select a translation model.")
            return

        src = self.source_lang.get()
        tgt = self.target_lang.get()
        if src == tgt:
            messagebox.showwarning("Same language", "Source and target languages are the same.")
            return

        self.is_running = True
        self.translate_btn.configure(state="disabled", text="Translating...")
        self.progress_bar.set(0)
        self.status_var.set("Loading document...")

        ollama_host = self.ollama_host.get().strip() or OLLAMA_URL

        thread = threading.Thread(
            target=self._run_translation,
            args=(path, src, tgt, prov, api_key, model, ollama_host),
            daemon=True,
        )
        thread.start()

    def _run_translation(self, path, src, tgt, prov, api_key, model, ollama_host):
        try:
            doc = Document(path)
            run_items = extract_all_runs(doc)

            if not run_items:
                self._on_done(False, "No translatable text found in the document.")
                return

            texts = [item[1] for item in run_items]
            total = len(texts)

            self.after(0, lambda: self.status_var.set(f"Translating {total} text segments..."))

            def on_progress(completed, total_count):
                pct = completed / total_count
                self.after(0, lambda: self.progress_bar.set(pct))
                self.after(
                    0,
                    lambda c=completed, t=total_count: self.status_var.set(
                        f"Translating {c}/{t}..."
                    ),
                )

            translations = translate_texts(
                texts=texts,
                source_lang=src,
                target_lang=tgt,
                provider=prov,
                api_key=api_key,
                model=model,
                ollama_host=ollama_host,
                progress_callback=on_progress,
            )

            apply_translations(run_items, translations)

            p = Path(path)
            output_path = p.parent / f"{p.stem}_translated{p.suffix}"
            counter = 1
            while output_path.exists():
                output_path = p.parent / f"{p.stem}_translated_{counter}{p.suffix}"
                counter += 1

            doc.save(str(output_path))
            self._on_done(True, f"Saved to: {output_path.name}")

        except Exception as e:
            self._on_done(False, f"Error: {e}")

    def _on_done(self, success: bool, message: str):
        def update():
            self.is_running = False
            self.translate_btn.configure(state="normal", text="Translate")
            if success:
                self.progress_bar.set(1)
                self.status_var.set(message)
                messagebox.showinfo("Done", message)
            else:
                self.progress_bar.set(0)
                self.status_var.set(message)
                messagebox.showerror("Translation failed", message)

        self.after(0, update)


def main():
    app = TranslatorApp()
    app.mainloop()


if __name__ == "__main__":
    main()

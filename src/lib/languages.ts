export const LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian", "Portuguese",
  "Russian", "Chinese (Simplified)", "Chinese (Traditional)", "Japanese",
  "Korean", "Arabic", "Hindi", "Dutch", "Polish", "Turkish", "Swedish",
  "Norwegian", "Danish", "Finnish", "Czech", "Romanian", "Hungarian",
  "Greek", "Hebrew", "Thai", "Vietnamese", "Indonesian", "Malay",
  "Ukrainian", "Bulgarian", "Croatian", "Serbian", "Slovak", "Slovenian",
  "Lithuanian", "Latvian", "Estonian", "Catalan", "Basque", "Galician",
  "Welsh", "Irish", "Tagalog", "Swahili",
] as const;

/** Map display language name → ISO 639-3 code used by franc */
export const LANG_TO_FRANC: Record<string, string> = {
  "English": "eng", "Spanish": "spa", "French": "fra", "German": "deu",
  "Italian": "ita", "Portuguese": "por", "Russian": "rus",
  "Chinese (Simplified)": "cmn", "Chinese (Traditional)": "cmn",
  "Japanese": "jpn", "Korean": "kor", "Arabic": "ara", "Hindi": "hin",
  "Dutch": "nld", "Polish": "pol", "Turkish": "tur", "Swedish": "swe",
  "Norwegian": "nob", "Danish": "dan", "Finnish": "fin", "Czech": "ces",
  "Romanian": "ron", "Hungarian": "hun", "Greek": "ell", "Hebrew": "heb",
  "Thai": "tha", "Vietnamese": "vie", "Indonesian": "ind", "Malay": "zlm",
  "Ukrainian": "ukr", "Bulgarian": "bul", "Croatian": "hrv", "Serbian": "srp",
  "Slovak": "slk", "Slovenian": "slv", "Lithuanian": "lit", "Latvian": "lav",
  "Estonian": "est", "Catalan": "cat", "Basque": "eus", "Galician": "glg",
  "Welsh": "cym", "Irish": "gle", "Tagalog": "tgl", "Swahili": "swa",
};

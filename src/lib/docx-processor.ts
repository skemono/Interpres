import JSZip from "jszip";
import type { TextRun } from "./types";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Parts of a .docx that can contain translatable text */
const TEXT_PARTS_PATTERNS = [
  "word/document.xml",
  /^word\/header\d*\.xml$/,
  /^word\/footer\d*\.xml$/,
  "word/footnotes.xml",
  "word/endnotes.xml",
];

function matchesPart(filename: string): boolean {
  return TEXT_PARTS_PATTERNS.some((p) =>
    typeof p === "string" ? filename === p : p.test(filename)
  );
}

function locationFromPart(partName: string): string {
  if (partName.includes("document")) return "body";
  if (partName.includes("header")) return "header";
  if (partName.includes("footer")) return "footer";
  if (partName.includes("footnote")) return "footnote";
  if (partName.includes("endnote")) return "endnote";
  return "other";
}

/** Escape text for safe insertion into XML text content */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class DocxProcessor {
  private zip!: JSZip;
  /** Parsed DOMs — used only for READING (extracting text runs) */
  private parsedParts = new Map<string, Document>();
  /** Original raw XML strings — used for WRITING (string-based replacement) */
  private rawXml = new Map<string, string>();
  /** Pending text modifications: partName → (elementIndex → newText) */
  private modifications = new Map<string, Map<number, string>>();

  async load(bytes: Uint8Array): Promise<void> {
    this.zip = await JSZip.loadAsync(bytes);
    this.parsedParts.clear();
    this.rawXml.clear();
    this.modifications.clear();

    for (const filename of Object.keys(this.zip.files)) {
      if (matchesPart(filename)) {
        const content = await this.zip.file(filename)?.async("string");
        if (content) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "application/xml");
          const parseError = doc.querySelector("parsererror");
          if (!parseError) {
            this.parsedParts.set(filename, doc);
            this.rawXml.set(filename, content);
          }
        }
      }
    }
  }

  /**
   * Extract all text runs from the document.
   * Uses DOMParser to find every w:t element with non-empty text.
   * Each run is tagged with a paragraphId so related runs can be kept together.
   */
  extractAllRuns(): TextRun[] {
    const runs: TextRun[] = [];

    for (const [partName, doc] of this.parsedParts) {
      // Pre-enumerate paragraphs for stable ID assignment
      const paragraphs = doc.getElementsByTagNameNS(W_NS, "p");
      const paraMap = new Map<Element, number>();
      for (let p = 0; p < paragraphs.length; p++) {
        paraMap.set(paragraphs[p], p);
      }

      const tElements = doc.getElementsByTagNameNS(W_NS, "t");
      for (let i = 0; i < tElements.length; i++) {
        const text = tElements[i].textContent || "";
        if (text.trim()) {
          // Walk up to the parent w:p element
          let el: Element | null = tElements[i];
          while (el && !(el.namespaceURI === W_NS && el.localName === "p")) {
            el = el.parentElement;
          }
          const paraIdx = el ? paraMap.get(el) ?? -1 : -1;

          runs.push({
            partName,
            elementIndex: i,
            originalText: text,
            location: locationFromPart(partName),
            paragraphId: `${partName}:p${paraIdx}`,
          });
        }
      }
    }

    return runs;
  }

  /**
   * Get the serialized formatting properties (w:rPr) for a text run.
   * Returns "" if no formatting is set (default style).
   * Used to compare formatting between runs in the same paragraph.
   */
  getRunFormatting(run: TextRun): string {
    const doc = this.parsedParts.get(run.partName);
    if (!doc) return "";

    const tElements = doc.getElementsByTagNameNS(W_NS, "t");
    if (run.elementIndex >= tElements.length) return "";

    const tEl = tElements[run.elementIndex];

    // Walk up to parent w:r
    let rEl: Element | null = tEl.parentElement;
    while (rEl && !(rEl.namespaceURI === W_NS && rEl.localName === "r")) {
      rEl = rEl.parentElement;
    }
    if (!rEl) return "";

    // Find w:rPr child
    for (let i = 0; i < rEl.children.length; i++) {
      const child = rEl.children[i];
      if (child.namespaceURI === W_NS && child.localName === "rPr") {
        return new XMLSerializer().serializeToString(child);
      }
    }

    return "";
  }

  /**
   * Record a translation for a text run.
   * Preserves leading/trailing whitespace from the original.
   * Empty translations clear the run's text (used when merging paragraph runs).
   * Does NOT use DOM mutation — stores the change for string-based replacement in toBytes().
   */
  applyTranslation(run: TextRun, translation: string): void {
    if (!this.rawXml.has(run.partName)) return;

    if (!this.modifications.has(run.partName)) {
      this.modifications.set(run.partName, new Map());
    }

    // Empty translation = clear this run (used for merged paragraph runs)
    if (!translation.trim()) {
      this.modifications.get(run.partName)!.set(run.elementIndex, "");
      return;
    }

    const original = run.originalText;
    const leading = original.length - original.trimStart().length;
    const trailing = original.length - original.trimEnd().length;
    const prefix = original.substring(0, leading);
    const suffix = trailing > 0 ? original.substring(original.length - trailing) : "";

    const newText = prefix + translation.trim() + suffix;
    this.modifications.get(run.partName)!.set(run.elementIndex, newText);
  }

  /**
   * Apply translations to all runs at once.
   */
  applyAllTranslations(runs: TextRun[], translations: string[]): void {
    for (let i = 0; i < runs.length; i++) {
      const trans = translations[i];
      if (trans && trans.trim()) {
        this.applyTranslation(runs[i], trans);
      }
    }
  }

  /**
   * Serialize the document back to bytes.
   *
   * Uses string-based text replacement on the original XML — never touches
   * XMLSerializer, so namespace prefixes, attribute order, self-closing tags,
   * and all other XML structure is preserved byte-for-byte. Only the text
   * content inside modified <w:t> elements changes.
   */
  async toBytes(): Promise<Uint8Array> {
    for (const [partName, xml] of this.rawXml) {
      const mods = this.modifications.get(partName);
      if (mods && mods.size > 0) {
        const modified = this.applyModsToXml(xml, mods);
        this.zip.file(partName, modified);
      }
      // Unmodified parts stay untouched in the zip
    }
    return await this.zip.generateAsync({ type: "uint8array" });
  }

  /**
   * Apply text modifications to a raw XML string by scanning for <w:t> elements
   * and replacing text content for modified ones. Preserves all other XML structure.
   */
  private applyModsToXml(xml: string, mods: Map<number, string>): string {
    const parts: string[] = [];
    let lastCopied = 0;
    let searchPos = 0;
    let elementIndex = 0;

    while (searchPos < xml.length) {
      const wtStart = xml.indexOf("<w:t", searchPos);
      if (wtStart === -1) break;

      // Verify it's actually a w:t element (not w:tbl, w:tc, w:tr, etc.)
      const charAfter = xml.charAt(wtStart + 4);
      if (charAfter !== ">" && charAfter !== " " && charAfter !== "/" &&
          charAfter !== "\t" && charAfter !== "\n" && charAfter !== "\r") {
        searchPos = wtStart + 5;
        continue;
      }

      const tagClosePos = xml.indexOf(">", wtStart);
      if (tagClosePos === -1) break;

      // Self-closing tag like <w:t/> — count it but don't modify
      if (xml.charAt(tagClosePos - 1) === "/") {
        elementIndex++;
        searchPos = tagClosePos + 1;
        continue;
      }

      // Find closing </w:t>
      const endTagStart = xml.indexOf("</w:t>", tagClosePos);
      if (endTagStart === -1) break;
      const endTagEnd = endTagStart + 6;

      const newText = mods.get(elementIndex);
      if (newText !== undefined) {
        // Copy everything before this element unchanged
        parts.push(xml.substring(lastCopied, wtStart));

        // Rebuild the opening tag, adding xml:space="preserve" if needed
        let openTag = xml.substring(wtStart, tagClosePos + 1);
        if (!openTag.includes("xml:space") &&
            (/^\s/.test(newText) || /\s$/.test(newText))) {
          openTag = openTag.slice(0, -1) + ' xml:space="preserve">';
        }

        parts.push(openTag);
        parts.push(escapeXml(newText));
        parts.push("</w:t>");

        lastCopied = endTagEnd;
      }

      elementIndex++;
      searchPos = endTagEnd;
    }

    // Copy remaining XML after the last modification
    parts.push(xml.substring(lastCopied));
    return parts.join("");
  }
}

import type { TextRun } from "./types";

interface FormatGroup {
  /** "" for base (untagged) formatting, "f1"/"f2"/etc for non-base */
  tag: string;
  /** Indices within this unit's runs (0-based into originalRunIndices) */
  localRunIndices: number[];
}

export interface TranslationUnit {
  /** Indices into the original runs array */
  originalRunIndices: number[];
  /** Merged text to send to translator (may contain <fN> tags) */
  mergedText: string;
  /** Whether all runs share the same formatting */
  isUniform: boolean;
  /** Paragraph ID for batching */
  paragraphId: string;
  /** Format groups for distributing translations back */
  formatGroups: FormatGroup[];
}

/**
 * Group runs by paragraph and merge their text, adding format tags
 * around differently-formatted runs so the LLM can preserve formatting.
 */
export function buildTranslationUnits(
  runs: TextRun[],
  indicesToTranslate: number[],
  getFormatting: (run: TextRun) => string
): TranslationUnit[] {
  // Group by paragraphId, preserving order of first appearance
  const paragraphGroups: { pid: string; indices: number[] }[] = [];
  const seen = new Map<string, number>();

  for (const idx of indicesToTranslate) {
    const pid = runs[idx].paragraphId;
    if (seen.has(pid)) {
      paragraphGroups[seen.get(pid)!].indices.push(idx);
    } else {
      seen.set(pid, paragraphGroups.length);
      paragraphGroups.push({ pid, indices: [idx] });
    }
  }

  const units: TranslationUnit[] = [];

  for (const { pid, indices } of paragraphGroups) {
    // Single run — no merging needed
    if (indices.length === 1) {
      units.push({
        originalRunIndices: indices,
        mergedText: runs[indices[0]].originalText,
        isUniform: true,
        paragraphId: pid,
        formatGroups: [{ tag: "", localRunIndices: [0] }],
      });
      continue;
    }

    // Multiple runs — check formatting
    const fmtKeys = indices.map((idx) => getFormatting(runs[idx]));
    const uniqueFormats = new Set(fmtKeys);

    if (uniqueFormats.size <= 1) {
      // Uniform formatting — merge text, no tags
      const mergedText = indices.map((idx) => runs[idx].originalText).join("");
      units.push({
        originalRunIndices: indices,
        mergedText,
        isUniform: true,
        paragraphId: pid,
        formatGroups: [
          { tag: "", localRunIndices: indices.map((_, i) => i) },
        ],
      });
    } else {
      // Mixed formatting — tag non-base runs
      // Base = most common format
      const fmtCounts = new Map<string, number>();
      for (const key of fmtKeys) {
        fmtCounts.set(key, (fmtCounts.get(key) || 0) + 1);
      }
      let baseFormat = fmtKeys[0];
      let maxCount = 0;
      for (const [key, count] of fmtCounts) {
        if (count > maxCount) {
          baseFormat = key;
          maxCount = count;
        }
      }

      // Assign tag numbers to non-base formats
      const formatToTag = new Map<string, string>();
      let tagNum = 1;
      for (const key of fmtKeys) {
        if (key !== baseFormat && !formatToTag.has(key)) {
          formatToTag.set(key, `f${tagNum++}`);
        }
      }

      // Build merged text with tags and group map
      let mergedText = "";
      const groupMap = new Map<string, number[]>();
      groupMap.set("", []);

      for (let i = 0; i < indices.length; i++) {
        const text = runs[indices[i]].originalText;
        const tag = formatToTag.get(fmtKeys[i]) || "";

        if (tag) {
          mergedText += `<${tag}>${text}</${tag}>`;
        } else {
          mergedText += text;
        }

        if (!groupMap.has(tag)) groupMap.set(tag, []);
        groupMap.get(tag)!.push(i);
      }

      const formatGroups: FormatGroup[] = [];
      for (const [tag, localIndices] of groupMap) {
        if (localIndices.length > 0) {
          formatGroups.push({ tag, localRunIndices: localIndices });
        }
      }

      units.push({
        originalRunIndices: indices,
        mergedText,
        isUniform: false,
        paragraphId: pid,
        formatGroups,
      });
    }
  }

  return units;
}

/**
 * Parse a unit-level translation and distribute text back to individual runs.
 * For uniform units: all text goes to the first run, others get "".
 * For tagged units: parse <fN> tags, match to format groups, distribute.
 * Fallback: if tags can't be parsed, put everything in the first run.
 */
export function distributeTranslation(
  unit: TranslationUnit,
  translation: string
): string[] {
  const result: string[] = new Array(unit.originalRunIndices.length).fill("");

  if (unit.isUniform) {
    result[0] = translation;
    return result;
  }

  // Parse format tags from translation
  const tagPattern = /<(f\d+)>([\s\S]*?)<\/\1>/g;
  const segments: { text: string; tag: string }[] = [];
  let lastEnd = 0;
  let match;

  while ((match = tagPattern.exec(translation)) !== null) {
    if (match.index > lastEnd) {
      segments.push({
        text: translation.substring(lastEnd, match.index),
        tag: "",
      });
    }
    segments.push({ text: match[2], tag: match[1] });
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < translation.length) {
    segments.push({ text: translation.substring(lastEnd), tag: "" });
  }

  // If no tags found, fallback: put everything in first run
  if (!segments.some((s) => s.tag !== "")) {
    result[0] = translation;
    return result;
  }

  // Distribute segments to runs using format group counters
  const tagCounters = new Map<string, number>();
  for (const group of unit.formatGroups) {
    tagCounters.set(group.tag, 0);
  }

  for (const seg of segments) {
    if (!seg.text) continue;

    const group = unit.formatGroups.find((g) => g.tag === seg.tag);
    if (!group) {
      // Unknown tag — append to first run
      result[0] += seg.text;
      continue;
    }

    const counter = tagCounters.get(seg.tag) ?? 0;
    if (counter < group.localRunIndices.length) {
      const localIdx = group.localRunIndices[counter];
      result[localIdx] += seg.text;
      tagCounters.set(seg.tag, counter + 1);
    } else {
      // More segments than runs for this format — append to last run
      const lastIdx = group.localRunIndices[group.localRunIndices.length - 1];
      result[lastIdx] += seg.text;
    }
  }

  return result;
}

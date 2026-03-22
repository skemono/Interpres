import { useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SegmentState } from "../lib/types";
import "./TranslationFlow.css";

interface TranslationFlowProps {
  segments: SegmentState[];
  activeIndex: number;
  isTranslating: boolean;
  fileName: string;
}

function SegmentRow({
  segment,
  index,
}: {
  segment: SegmentState;
  index: number;
}) {
  const showBadge = segment.location !== "body";

  return (
    <div
      className="segment-row"
      data-status={segment.status}
    >
      <div className="segment-meta">
        <span className="segment-index">{index + 1}</span>
        {showBadge && (
          <span className="segment-location-badge">{segment.location}</span>
        )}
      </div>

      <div className="segment-texts">
        <div className="segment-original" title={segment.originalText}>
          {segment.originalText}
        </div>

        <div className="segment-arrow">
          {segment.status === "skipped" ? "—" : "\u2192"}
        </div>

        <div className={`segment-translated ${segment.status}`}>
          {segment.status === "translating" ? (
            <div className="translation-skeleton" />
          ) : segment.status === "done" && segment.translatedText ? (
            segment.translatedText
          ) : segment.status === "skipped" ? (
            <span>{segment.originalText} <small>(kept)</small></span>
          ) : (
            "..."
          )}
        </div>
      </div>
    </div>
  );
}

export default function TranslationFlow({
  segments,
  activeIndex,
  isTranslating,
  fileName,
}: TranslationFlowProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const lastActiveRef = useRef(-1);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 15,
  });

  // Auto-scroll to active segment
  useEffect(() => {
    if (!isTranslating || activeIndex < 0) return;

    // If activeIndex jumped by a lot (new batch), reset user scroll flag
    if (Math.abs(activeIndex - lastActiveRef.current) > 5) {
      userScrolledRef.current = false;
    }
    lastActiveRef.current = activeIndex;

    if (!userScrolledRef.current) {
      virtualizer.scrollToIndex(activeIndex, {
        align: "center",
        behavior: "smooth",
      });
    }
  }, [activeIndex, isTranslating, virtualizer]);

  // Detect user scroll
  const handleScroll = useCallback(() => {
    if (isTranslating && activeIndex >= 0) {
      userScrolledRef.current = true;
    }
  }, [isTranslating, activeIndex]);

  // Compute stats
  const stats = {
    done: 0,
    translating: 0,
    skipped: 0,
    pending: 0,
  };
  for (const seg of segments) {
    stats[seg.status]++;
  }

  return (
    <div className="flow-panel">
      <div className="flow-header">
        <span className="flow-title">Translation Flow</span>
        {segments.length > 0 && (
          <div className="flow-stats">
            {stats.done > 0 && (
              <span className="flow-stat">
                <span className="flow-stat-dot done" />
                {stats.done}
              </span>
            )}
            {stats.translating > 0 && (
              <span className="flow-stat">
                <span className="flow-stat-dot translating" />
                {stats.translating}
              </span>
            )}
            {stats.skipped > 0 && (
              <span className="flow-stat">
                <span className="flow-stat-dot skipped" />
                {stats.skipped}
              </span>
            )}
            <span className="flow-stat">
              <span className="flow-stat-dot pending" />
              {segments.length}
            </span>
          </div>
        )}
      </div>

      <div
        ref={parentRef}
        className="flow-scroll-container"
        onScroll={handleScroll}
      >
        {segments.length === 0 ? (
          <div className="flow-placeholder">
            <div className="flow-placeholder-icon">&#128196;</div>
            <div className="flow-placeholder-text">
              {fileName
                ? "No translatable text found"
                : "Open a .docx file to see translation flow"}
            </div>
          </div>
        ) : (
          <div
            className="flow-virtual-container"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SegmentRow
                  segment={segments[virtualRow.index]}
                  index={virtualRow.index}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

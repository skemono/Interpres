import { useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SegmentState } from "../lib/types";
import "./FlowDiagram.css";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface FlowDiagramProps {
  segments: SegmentState[];
  activeIndex: number;
}

function FlowNode({
  segment,
  index,
  isLast,
}: {
  segment: SegmentState;
  index: number;
  isLast: boolean;
}) {
  const showResult =
    segment.status === "done" || segment.status === "translating";

  return (
    <div className="flow-node" data-status={segment.status}>
      {/* Source card */}
      <div className="fn-source">
        <div className="fn-meta">
          <span className="fn-num">{index + 1}</span>
          {segment.location !== "body" && (
            <span className="fn-loc">{segment.location}</span>
          )}
          {segment.status === "skipped" && (
            <span className="fn-kept">kept</span>
          )}
        </div>
        <p className="fn-text">{segment.originalText}</p>
      </div>

      {/* Connector + Result */}
      {showResult && (
        <>
          <div className="fn-connector">
            <div className="fn-conn-line" />
            <div className="fn-conn-badge">
              {segment.status === "done" ? (
                <span className="fn-check">&#10003;</span>
              ) : (
                <span className="fn-spinner" />
              )}
            </div>
            <div className="fn-conn-line" />
          </div>

          <div className="fn-result">
            {segment.status === "translating" ? (
              <div className="fn-shimmer">
                <div className="fn-shimmer-bar" />
                <div className="fn-shimmer-bar" />
              </div>
            ) : (
              <p className="fn-text">{segment.translatedText}</p>
            )}
          </div>
        </>
      )}

      {/* Link to next node */}
      {!isLast && (
        <div className="fn-link">
          <div className="fn-link-line" />
        </div>
      )}
    </div>
  );
}

export default function FlowDiagram({
  segments,
  activeIndex,
}: FlowDiagramProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const lastActiveRef = useRef(-1);
  const autoScrollingRef = useRef(false);
  const animFrameRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const status = segments[index]?.status;
      if (status === "done" || status === "translating") return 190;
      return 75;
    },
    overscan: 8,
  });

  // Animate scroll to a target offset using requestAnimationFrame + easing
  const animateScrollTo = useCallback((targetOffset: number) => {
    const el = parentRef.current;
    if (!el) return;

    cancelAnimationFrame(animFrameRef.current);

    const start = el.scrollTop;
    const distance = targetOffset - start;
    if (Math.abs(distance) < 2) return;

    autoScrollingRef.current = true;
    const duration = Math.min(Math.max(Math.abs(distance) * 1.8, 600), 1600);
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      el.scrollTop = start + distance * easeInOutCubic(progress);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        autoScrollingRef.current = false;
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Auto-scroll to active segment — bypasses virtualizer.scrollToIndex
  // to avoid its reconciliation loop which forces instant scrolling
  useEffect(() => {
    if (activeIndex < 0) return;
    if (Math.abs(activeIndex - lastActiveRef.current) > 3) {
      userScrolledRef.current = false;
    }
    lastActiveRef.current = activeIndex;

    if (!userScrolledRef.current) {
      const offsetInfo = virtualizer.getOffsetForIndex(activeIndex, "center");
      if (offsetInfo) {
        animateScrollTo(offsetInfo[0]);
      }
    }
  }, [activeIndex, virtualizer, animateScrollTo]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Detect manual scrolling (ignore programmatic scrolls)
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!autoScrollingRef.current) {
        userScrolledRef.current = true;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const processed = segments.filter(
    (s) => s.status === "done" || s.status === "skipped"
  ).length;
  const active = segments.filter((s) => s.status === "translating").length;

  return (
    <div className="flow-diagram">
      <div className="fd-header">
        <div className="fd-title">
          <span className="fd-pulse" />
          Translating
        </div>
        <div className="fd-stats">
          {processed} / {segments.length}
          {active > 0 && ` \u00b7 ${active} active`}
        </div>
      </div>

      <div className="fd-viewport" ref={parentRef}>
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((vRow) => (
            <div
              key={vRow.key}
              ref={virtualizer.measureElement}
              data-index={vRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              <FlowNode
                segment={segments[vRow.index]}
                index={vRow.index}
                isLast={vRow.index === segments.length - 1}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

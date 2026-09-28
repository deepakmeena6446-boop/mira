"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";

export type Snap = "peek" | "half" | "full";
/** Detents are CSS variables (globals.css): `full` stops below the top chrome, so the help anchors stay visible. */
const HEIGHTS: Record<Snap, string> = { peek: "var(--sheet-peek)", half: "var(--sheet-half)", full: "var(--sheet-full)" };

/**
 * Draggable, non-modal bottom sheet with three snap points. It sits above the docked tab bar
 * (or at the bottom edge in immersive journey mode). The handle is also a button so keyboard and
 * screen-reader users can change the size. Content scrolls inside.
 */
export function BottomSheet({
  children,
  snap,
  onSnap,
  label,
  className,
}: {
  children: React.ReactNode;
  snap: Snap;
  onSnap: (s: Snap) => void;
  label: string;
  className?: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const onDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, h: ref.current?.getBoundingClientRect().height ?? 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(120, start.current.h + (start.current.y - e.clientY)));
  };
  const onUp = useCallback(() => {
    if (!start.current || drag === null) {
      start.current = null;
      return;
    }
    // Snap by the share of the space the sheet may use (between the tab bar and the top chrome).
    const box = ref.current?.getBoundingClientRect();
    const room = box ? box.bottom - readPx("--chrome-top") : window.innerHeight;
    const ratio = drag / Math.max(1, room);
    onSnap(ratio > 0.8 ? "full" : ratio > 0.45 ? "half" : "peek");
    setDrag(null);
    start.current = null;
  }, [drag, onSnap]);

  useEffect(() => {
    if (drag === null) return;
    const up = () => onUp();
    // pointercancel: a system gesture or incoming call interrupted the drag — snap, don't freeze.
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, onUp]);

  const next: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };
  return (
    <section
      ref={ref}
      aria-label={label}
      data-snap={snap}
      className={cx(
        "mira-sheet fixed inset-x-0 bottom-[var(--tabbar-space)] z-30 mx-auto flex max-w-xl flex-col rounded-t-[var(--radius-lg)] border border-b-0 border-line bg-surface shadow-[var(--shadow-sheet)]",
        drag === null && "transition-[height] duration-[var(--dur-sheet)] ease-[var(--ease-sheet)]",
        className,
      )}
      style={{ height: drag ?? HEIGHTS[snap], maxHeight: "var(--sheet-full)" }}
    >
      <button
        type="button"
        aria-label={`Resize panel (currently ${snap})`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onClick={() => drag === null && onSnap(next[snap])}
        className="mira-sheet-handle flex min-h-11 w-full touch-none cursor-grab items-center justify-center rounded-t-[var(--radius-lg)] pt-1"
      >
        <span className="h-[5px] w-9 rounded-full bg-line-strong" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
    </section>
  );
}

/** A CSS length variable on <html> in px (rem-based values are converted). */
function readPx(name: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:var(${name})`;
  document.body.append(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

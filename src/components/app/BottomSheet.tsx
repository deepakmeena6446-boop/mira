"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";

export type Snap = "peek" | "half" | "full";
const HEIGHTS: Record<Snap, string> = { peek: "40dvh", half: "55dvh", full: "88dvh" };

/**
 * Draggable bottom sheet with three snap points. The handle is also a button so
 * keyboard and screen-reader users can change the size. Content scrolls inside.
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
    const vh = window.innerHeight;
    const ratio = drag / vh;
    onSnap(ratio > 0.72 ? "full" : ratio > 0.42 ? "half" : "peek");
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
      className={cx(
        "glass fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-xl flex-col rounded-t-[2rem] border border-glass-edge shadow-[0_-12px_40px_-16px_rgb(50_25_120/0.35)]",
        drag === null && "transition-[height] duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]",
        className,
      )}
      style={{ height: drag ?? HEIGHTS[snap] }}
    >
      <button
        type="button"
        aria-label={`Resize panel (currently ${snap})`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onClick={() => drag === null && onSnap(next[snap])}
        className="flex min-h-11 w-full touch-none cursor-grab items-center justify-center rounded-t-[2rem] pt-2"
      >
        <span className="h-1.5 w-11 rounded-full bg-line-strong" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-28">{children}</div>
    </section>
  );
}

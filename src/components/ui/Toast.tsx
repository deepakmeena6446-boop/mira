"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cx } from "./cx";

type ToastTone = "info" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/** Polite live-region toasts. Messages never contain report text or contact details. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [scope, setScope] = useState(path);
  const [items, setItems] = useState<ToastItem[]>([]);
  // Action feedback belongs to its screen. Adjust only this provider's state; never remount children.
  if (scope !== path) { setScope(path); setItems([]); }
  const next = useRef(1);
  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = next.current++;
    // The latest action replaces previous feedback rather than stacking over mobile controls.
    setItems([{ id, message, tone }]);
  }, []);
  // Stable callback: a new toast must not restart the others' timers.
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="mira-toasts pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-space)+1rem)] z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(item.id), item.tone === "error" ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [onDone, item.id, item.tone]);
  return (
    <div
      className={cx(
        "pointer-events-auto flex max-w-md items-center gap-2 rounded-[var(--radius-card)] py-2 pl-4 pr-2 text-[0.95rem] font-medium shadow-[var(--shadow-float)] animate-rise",
        item.tone === "error" ? "bg-error text-canvas" : "bg-ink text-canvas",
      )}
    >
      <span className="min-w-0 flex-1">{item.message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => onDone(item.id)} className="grid size-12 shrink-0 place-items-center rounded-full text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"><span aria-hidden>×</span></button>
    </div>
  );
}

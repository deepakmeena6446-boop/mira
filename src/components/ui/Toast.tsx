"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = next.current++;
    setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
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
        "max-w-md rounded-[var(--radius-card)] px-4 py-3 text-[0.95rem] font-medium shadow-[var(--shadow-float)] animate-rise",
        item.tone === "error" ? "bg-error text-canvas" : "bg-ink text-canvas",
      )}
    >
      {item.message}
    </div>
  );
}

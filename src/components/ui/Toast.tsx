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
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className={cx(
        "pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
        item.tone === "error" ? "bg-error text-white" : "bg-ink text-white",
      )}
    >
      {item.message}
    </div>
  );
}

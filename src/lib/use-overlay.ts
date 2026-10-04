"use client";

import { useEffect, useRef } from "react";

type Overlay = { id: number; dialog: HTMLElement; close: () => void; popped: boolean; opener: HTMLElement | null; afterClose?: () => void };
const stack: Overlay[] = [];
let sequence = 0;
let pendingReturn: { id: number; after: (() => void)[] } | null = null;
const inertBefore = new Map<HTMLElement, boolean>();
const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((element) => !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
function refreshInert() {
  for (const [element, previous] of inertBefore) element.inert = previous;
  inertBefore.clear();
  const top = stack.at(-1);
  if (!top) return;
  let branch: HTMLElement = top.dialog;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) { inertBefore.set(sibling, sibling.inert); sibling.inert = true; }
    }
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
}
function onKey(event: KeyboardEvent) {
  const top = stack.at(-1);
  if (!top) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); top.close(); return; }
  if (event.key !== 'Tab') return;
  const targets = focusable(top.dialog);
  if (!targets.length) { event.preventDefault(); top.dialog.focus(); return; }
  const index = targets.indexOf(document.activeElement as HTMLElement);
  if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === targets.length - 1)) {
    event.preventDefault(); (event.shiftKey ? targets.at(-1)! : targets[0]).focus();
  }
}
function onPop(event: PopStateEvent) {
  if (pendingReturn) {
    // Ignore a pop that has not left the entry being closed. Navigate only after its return.
    if (event.state?.miraOverlayId === pendingReturn.id) return;
    const after = pendingReturn.after; pendingReturn = null;
    if (!stack.length) window.removeEventListener("popstate", onPop);
    for (const action of after) action();
    return;
  }
  const top = stack.at(-1);
  if (top) { top.popped = true; top.close(); }
}
/** Register before closing; React cleanup consumes overlay history before the next action. */
export function closeOverlayThen(close: () => void, after: () => void) {
  const entry = stack.at(-1);
  if (entry) { entry.afterClose = after; close(); }
  else if (pendingReturn) { pendingReturn.after.push(after); close(); }
  else { close(); after(); }
}
/** Immediate focus, modal-only tab order and topmost Escape/Back, including nested sheets. */
export function useOverlay(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter((element) => element.getClientRects().length > 0).at(-1);
    if (!dialog) return;
    const entry: Overlay = { id: ++sequence, dialog, close: () => closeRef.current(), popped: false, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    stack.push(entry);
    if (stack.length === 1) { window.addEventListener('keydown', onKey, true); window.addEventListener('popstate', onPop); }
    window.history.pushState({ ...(window.history.state ?? {}), miraOverlay: true, miraOverlayId: entry.id }, '');
    refreshInert();
    dialog.tabIndex = -1;
    (focusable(dialog)[0] ?? dialog).focus({ preventScroll: true });
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      refreshInert();
      const needsReturn = !entry.popped && window.history.state?.miraOverlayId === entry.id;
      if (needsReturn) { pendingReturn = { id: entry.id, after: entry.afterClose ? [entry.afterClose] : [] }; window.history.back(); }
      if (!stack.length) { window.removeEventListener("keydown", onKey, true); if (!pendingReturn) window.removeEventListener("popstate", onPop); }
      if (entry.opener?.isConnected && !entry.opener.closest('[inert]')) entry.opener.focus({ preventScroll: true });
      if (!needsReturn) entry.afterClose?.();
    };
  }, [open]);
}

/**
 * A tap on the scrim closes a sheet — but not the second tap of a double-tap that just opened it, which lands on the
 * scrim before she sees the sheet (audit P08-004: "I feel unsafe" opened and closed again). Only taps on the scrim itself.
 */
export function useScrimClose(open: boolean, onClose: () => void, guardMs = 600) {
  const openedAt = useRef(0);
  useEffect(() => { if (open) openedAt.current = Date.now(); }, [open]);
  return (event: { target: EventTarget; currentTarget: EventTarget }) => {
    if (event.target !== event.currentTarget || Date.now() - openedAt.current < guardMs) return;
    onClose();
  };
}

"use client";

/**
 * The seam for an installable native shell (docs/phase4/00 §1). In a browser — today — location
 * updates can pause when the screen locks, and the journey screen says so. A native shell (e.g. a
 * Capacitor iOS/Android wrapper) would inject `window.MiraNative` and keep a journey's position
 * updating in the background, with the operating system's own location indicator showing.
 *
 * PLACEHOLDER: no shell exists yet, so `nativeShell()` reports nothing available and every call is a
 * no-op. Nothing in Mira may claim background tracking until `available.backgroundLocation` is true.
 */
export interface NativeShell {
  available: { backgroundLocation: boolean; pushNotifications: boolean };
  /** Begin background updates for one journey; resolves false when the person or the OS declines. */
  startBackgroundLocation(journeyId: string, uploadUrl: string): Promise<boolean>;
  stopBackgroundLocation(journeyId: string): Promise<void>;
}

type InjectedShell = Partial<NativeShell> & { version?: string };

const NONE: NativeShell = {
  available: { backgroundLocation: false, pushNotifications: false },
  startBackgroundLocation: async () => false,
  stopBackgroundLocation: async () => {},
};

export function nativeShell(): NativeShell {
  if (typeof window === "undefined") return NONE;
  const injected = (window as unknown as { MiraNative?: InjectedShell }).MiraNative;
  if (!injected?.available || !injected.startBackgroundLocation || !injected.stopBackgroundLocation) return NONE;
  return { available: { backgroundLocation: Boolean(injected.available.backgroundLocation), pushNotifications: Boolean(injected.available.pushNotifications) }, startBackgroundLocation: injected.startBackgroundLocation, stopBackgroundLocation: injected.stopBackgroundLocation };
}

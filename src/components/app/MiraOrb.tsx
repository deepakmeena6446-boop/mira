import { MiraPulse } from "./MiraPulse";

/** Compatibility shim: the gradient orb is retired (docs/launch-ux/04 §12). Renders the Mira Pulse mark. */
export function MiraOrb({ size = 40, className }: { size?: number; className?: string; calm?: boolean }) {
  return <MiraPulse size={Math.min(size, 40)} className={className} />;
}

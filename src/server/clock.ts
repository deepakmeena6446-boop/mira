/** Injectable clock so journey, retention and aggregation logic are testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(start: Date | string): Clock & { set(d: Date | string): void; advance(ms: number): void } {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    set: (d) => {
      t = new Date(d).getTime();
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

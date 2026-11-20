export interface Rng {
  (): number;
  state: () => number;
  set: (value: number) => void;
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  const next = (() => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.state = () => state;
  next.set = (value: number) => {
    state = value >>> 0;
  };
  return next;
}

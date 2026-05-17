export interface Rng {
  float(): number;
  floatRange(min: number, max: number): number;
  intRange(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  return {
    float: next,
    floatRange: (min, max) => min + next() * (max - min),
    intRange: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) {
        throw new Error('Cannot pick from an empty array.');
      }

      return items[Math.floor(next() * items.length)];
    },
  };
}

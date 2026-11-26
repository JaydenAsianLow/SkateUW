// The Controls guide's demo scene runs in its own iframe (/?demo, see DemoStage.jsx): the same game code, but its
// own copy of every module, so it never touches the real game's state or the phone connection.
//
// In there, time is virtual: performance.now() only moves when the guide steps the demo (1/60 s per frame). So a
// demo plays exactly the same way every time, in slow motion, or faster than real time while the guide records the
// card previews. This module is imported first (main.jsx), before anything reads the clock.
export const demoMode = new URLSearchParams(globalThis.location?.search ?? '').has('demo');

export const vclock = { ms: 0 };

if (demoMode) {
  vclock.ms = performance.now();
  performance.now = () => vclock.ms;
}

// Seeded Math.random for the demo (the manual's drifting zone, bails): the same demo looks the same every run.
export function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

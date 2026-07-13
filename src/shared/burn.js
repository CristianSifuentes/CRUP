/*
 * burn(ms) — synchronously occupy the main thread for ~ms milliseconds.
 *
 * This simulates a genuinely expensive component render (heavy layout,
 * big data transformation, complex SVG, etc.) in a deterministic way.
 * The main thread is BUSY during a burn: no clicks, no keystrokes, no
 * rAF callbacks, no paints can happen until it returns.
 *
 * Everything this lab demonstrates hinges on one fact: React cannot make
 * a slow component fast. Concurrent rendering does not remove this work —
 * it splits the work into small chunks and schedules it so that URGENT
 * work (your keystroke) can jump the queue between chunks.
 */
export function burn(ms) {
  const end = performance.now() + ms;
  // Deliberate busy-wait: while() spinning is the point.
  while (performance.now() < end) {
    /* main thread held hostage */
  }
}

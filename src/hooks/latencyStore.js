import { useSyncExternalStore } from 'react';

/*
 * latencyStore — measures INPUT RESPONSIVENESS: keystroke → next frame.
 *
 * HOW THE MEASUREMENT WORKS
 * In React 18, discrete input events (keydown, input, click) produce URGENT
 * updates that are flushed synchronously before the event handler returns to
 * the browser. requestAnimationFrame fires just before the next paint, so:
 *
 *   t0 = performance.now() inside the event handler
 *   requestAnimationFrame(() => latency = performance.now() - t0)
 *
 * captures everything that stood between the user's keystroke and the next
 * frame: React's synchronous render + commit + whatever else blocked the
 * thread. In the blocking demo that includes re-rendering the whole result
 * list (hundreds of ms). In the concurrent demo the urgent render only
 * touches the input, so latency collapses to a few ms — the expensive list
 * render was moved to a lower-priority lane that runs AFTER the paint.
 *
 * The stats live outside React so the meter component can subscribe without
 * forcing the measured tree to re-render (a meter that perturbs the
 * measurement would be a bad meter).
 */

const store = new Map(); // source -> { last, samples: [], worst }
let version = 0;
const listeners = new Set();

function emit() {
  version++;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call from an input event handler, BEFORE setState. */
export function trackInput(source) {
  const t0 = performance.now();
  requestAnimationFrame(() => {
    const latency = performance.now() - t0;
    let stats = store.get(source);
    if (!stats) {
      stats = { last: 0, samples: [], worst: 0 };
      store.set(source, stats);
    }
    stats.last = latency;
    stats.samples.push(latency);
    if (stats.samples.length > 30) stats.samples.shift();
    stats.worst = Math.max(stats.worst, latency);
    emit();
  });
}

const EMPTY = { last: null, average: null, worst: null, count: 0 };

export function useInputLatency(source) {
  useSyncExternalStore(subscribe, () => version);
  const stats = store.get(source);
  if (!stats || stats.samples.length === 0) return EMPTY;
  const average =
    stats.samples.reduce((sum, s) => sum + s, 0) / stats.samples.length;
  return {
    last: stats.last,
    average,
    worst: stats.worst,
    count: stats.samples.length,
  };
}

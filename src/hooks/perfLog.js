import { useSyncExternalStore } from 'react';

/*
 * perfLog — a tiny external store that records every update the lab performs.
 *
 * WHY AN EXTERNAL STORE?
 * The "Update Priority" panel must observe updates happening in OTHER
 * component trees without participating in their renders (observing through
 * props/context would change the very timings we're measuring). Components
 * subscribe with useSyncExternalStore — the React 18 primitive built exactly
 * for reading external mutable sources safely under concurrent rendering
 * (it protects against "tearing": two components seeing different versions
 * of the store within one interrupted render pass).
 *
 * VOCABULARY (mirrors React's internal lane model, simplified):
 *   lane: 'urgent'     — discrete input (typing, clicks). React renders these
 *                        synchronously, before the browser may paint.
 *   lane: 'transition' — updates wrapped in startTransition. Rendered
 *                        concurrently: time-sliced, interruptible, abandonable.
 *   lane: 'deferred'   — re-renders scheduled by useDeferredValue lagging
 *                        behind its source value. Same low priority as
 *                        transitions under the hood.
 *
 * Each entry:
 *   { id, label, lane, source, start, end, interrupted, samples[] }
 * `samples` holds performance.now() timestamps captured DURING the render
 * phase of the update — the flamechart derives time-slicing chunks from the
 * gaps between them (a gap = React yielded back to the browser).
 */

const MAX_ENTRIES = 120;

const store = {
  entries: [],
  version: 0,
};

const listeners = new Set();

function emit() {
  store.version++;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let nextId = 1;

/** Record the start of an update. Returns an id to close it with later. */
export function beginUpdate(label, lane, source) {
  const entry = {
    id: nextId++,
    label,
    lane,
    source,
    start: performance.now(),
    end: null,
    interrupted: false,
    samples: [],
  };
  store.entries.push(entry);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries.splice(0, store.entries.length - MAX_ENTRIES);
  }
  emit();
  return entry.id;
}

/** Mark an update as committed (called from useEffect, i.e. after commit). */
export function endUpdate(id) {
  const entry = store.entries.find((e) => e.id === id);
  if (!entry || entry.end !== null) return;
  entry.end = performance.now();
  emit();
}

/**
 * Mark an in-flight low-priority update as interrupted: a more urgent update
 * arrived before it committed, so React threw away the work-in-progress tree
 * and will restart with fresh state. This is the heart of concurrency —
 * rendering became ABANDONABLE.
 */
export function interruptUpdate(id) {
  const entry = store.entries.find((e) => e.id === id);
  if (!entry || entry.end !== null) return;
  entry.interrupted = true;
  entry.end = performance.now();
  emit();
}

/**
 * Called from inside component render functions (an instrumentation-only
 * side effect, the same trick profilers use). Deliberately does NOT emit —
 * it runs hundreds of times per render pass and subscribers only need the
 * samples once the update ends.
 */
export function recordRenderSample(id) {
  if (id == null) return;
  const entry = store.entries.find((e) => e.id === id);
  if (entry && entry.end === null) {
    entry.samples.push(performance.now());
  }
}

/** Subscribe a component to the log. Re-renders on begin/end/interrupt. */
export function useUpdateLog() {
  useSyncExternalStore(subscribe, () => store.version);
  return store.entries;
}

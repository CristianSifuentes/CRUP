# Concurrent React Cheatsheet

Quick reference for `useTransition`, `useDeferredValue`, and update
prioritization in React 18+. Live demonstrations of every pattern here are in
this repo — run `npm run dev`.

## The 10-second mental model

> Every update is **urgent** unless you say otherwise. Urgent updates render
> synchronously and block the main thread. Updates marked with
> `startTransition` / `useDeferredValue` render **concurrently**: in ~5 ms
> time slices, yielding between slices, interruptible and disposable when
> something urgent arrives. React always finishes urgent work first, and the
> screen only ever shows fully-committed trees.

| | urgent (default) | transition / deferred |
|---|---|---|
| Trigger | any `setState` | `startTransition(() => setState())`, `useDeferredValue` lag |
| Rendering | synchronous, runs to completion | time-sliced (~5 ms chunks) |
| Interruptible | no | yes — abandoned and restarted on newer input |
| Blocks paint/input | yes, for its full duration | no |
| Right for | caret, toggles, highlights, direct manipulation | lists, charts, filtering, navigation, anything big |

---

## useTransition patterns

### 1. Filter-as-you-type (split-state pattern)

```jsx
function Search() {
  const [inputValue, setInputValue] = useState(''); // urgent twin
  const [query, setQuery] = useState('');           // transition twin
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    setInputValue(e.target.value);                       // caret: instant
    startTransition(() => setQuery(e.target.value));     // results: whenever
  }

  return (
    <>
      <input value={inputValue} onChange={handleChange} />
      {isPending && <Spinner />}
      <BigResultList query={query} />   {/* MUST be memo()ed — see pitfalls */}
    </>
  );
}
```

One value, two states, two priorities. The input is never gated on the list.

### 2. Non-blocking navigation (tab/route switch)

```jsx
function selectTab(id) {
  startTransition(() => setActiveTab(id));
}
```

- Tab highlight (urgent, from the click itself) lands immediately.
- The old screen stays mounted and interactive while the new one renders.
- Clicking a third tab mid-render abandons the second — no queue of stale
  screens. Pair with `isPending` to badge the outgoing screen.

### 3. Stale-but-interactive with `isPending`

```jsx
<div style={{ opacity: isPending ? 0.5 : 1 }}>
  <Results query={query} />
</div>
```

Show the old content, dimmed, instead of a spinner — users keep reading (and
scrolling) while the replacement renders in the background.

### 4. `startTransition` without the hook

```js
import { startTransition } from 'react';
startTransition(() => setBigState(next));
```

Same scheduling, no `isPending`. Use it outside components (stores, event
buses) or when you don't need the pending flag.

---

## useDeferredValue use cases

### 1. You receive the value; you don't own the setter

```jsx
function ResultsPane({ query }) {           // query arrives as a prop
  const deferredQuery = useDeferredValue(query);
  return <BigResultList query={deferredQuery} />;  // memo()ed
}
```

The parent stays dumb and urgent; this consumer opts its expensive subtree
into lag locally.

### 2. Derived "isStale" affordance (poor man's isPending)

```jsx
const deferred = useDeferredValue(value);
const isStale = deferred !== value;
return <Chart data={deferred} style={{ opacity: isStale ? 0.5 : 1 }} />;
```

### 3. Debounce-like behavior without timers

Typing bursts collapse naturally: each new value abandons the previous
catch-up render, so only the final value's expensive render commits. Unlike a
debounce there's no fixed delay — on a fast machine it updates every
keystroke; on a slow one it skips intermediate values. It adapts to the
device instead of a hardcoded 300 ms.

### 4. Keeping old content during Suspense refetch

`useDeferredValue` holds the previous value (previous data → previous UI)
while the new value's render suspends — old list stays visible instead of a
fallback flash.

---

## Choosing the technique

| Situation | Reach for |
|---|---|
| You call the setter and the update is expensive | `useTransition` |
| The expensive consumer only receives a prop/context value | `useDeferredValue` |
| You need a pending indicator | `useTransition` (`isPending`) — or `deferred !== value` |
| Navigation / tab switch mounting a heavy screen | `useTransition` |
| Search box + huge result list | either; transition if you own the input |
| Update is genuinely urgent (caret, checkbox, drag) | plain `setState` — never wrap these |
| Work is not rendering (network, crypto, parsing) | neither — use async/web workers; concurrency only schedules *renders* |

---

## Common pitfalls and solutions

**1. Forgetting `memo` on the expensive child — the #1 mistake.**
The urgent render re-renders parents, and parents re-render children. If the
big list isn't memoized, it renders in the urgent pass anyway and the
transition bought nothing. *Solution:* `memo()` the expensive subtree and keep
its props referentially stable (`useCallback`/`useMemo`).

**2. Wrapping the urgent update in the transition.**
`startTransition(() => setInputValue(v))` makes the *caret* low-priority —
typing now lags behind rendering. *Solution:* urgent twin outside, expensive
twin inside. Two states.

**3. Expecting `startTransition` to make code asynchronous.**
The callback runs synchronously; only the *rendering* it schedules is
deferred. `startTransition(() => { expensiveComputation(); })` still blocks
right there. *Solution:* transitions schedule renders; move non-render CPU
work to `useMemo` inside the (memoized, deferred) component, or off-thread.

**4. Deferring the value but computing with the live one.**
`useDeferredValue(query)` then `useMemo(() => filter(items, query), [query])`
— the expensive memo still keys on the urgent value. *Solution:* every
expensive dependency must use the deferred value.

**5. Awaiting inside a transition (React 18).**
`startTransition(async () => { await fetch(); setState(x); })` — updates after
the `await` are no longer inside the transition scope in React 18.
*Solution:* set transition state before/after the await from a new
`startTransition`, or use React 19's async transition actions.

**6. Treating transitions as a performance fix for slow components.**
A 200 ms component render is still 200 ms of CPU — concurrency hides it from
the user's fingers but drains batteries and delays results. *Solution:*
transitions for scheduling, plus real optimization (virtualization,
memoization, less DOM) for the work itself. This lab's list would be
virtualized in production.

**7. Marking controlled-input state as a transition to "fix" lag.**
If typing lags, the expensive subtree is in the urgent path; demoting the
input just trades caret lag for a different lag. *Solution:* find what's
expensive, memoize it, and demote *that* via transition/deferral.

**8. Measuring with StrictMode on and wondering about doubled numbers.**
Dev StrictMode double-invokes renders; profiling numbers lie. *Solution:*
measure production builds (this repo's `scripts/measure.mjs` does).

---

## Under-the-hood vocabulary

- **Lanes** — 31-bit priority bitmask; each pending update is assigned a lane.
  SyncLane (discrete input) > InputContinuousLane (drag/scroll) > DefaultLane >
  TransitionLanes (16 of them) > IdleLane.
- **Time-slicing** — concurrent renders run in a scheduler loop that performs
  one component's worth of work at a time and checks `shouldYield()` (~every
  5 ms) to hand the thread back to the browser.
- **Interruption** — when higher-priority work arrives mid-render, React
  discards the work-in-progress fiber tree; the update isn't lost, its lane is
  re-rendered later with the latest state.
- **Tearing** — inconsistent reads of external mutable state across an
  interrupted render. React state/props are tear-proof; external stores need
  `useSyncExternalStore` (this repo's instrumentation panel uses it).
- **Entanglement** — overlapping transitions get batched/entangled so related
  state never commits half-updated.

## Self-audit: finding blocking updates in your own app

1. **Feel it:** type/click with CPU throttling (DevTools → Performance → 6×).
2. **See it:** record a Performance profile; look for long solid "Render" tasks
   (> 50 ms) triggered by input events — those are urgent-lane renders that
   should probably be transitions.
3. **Prove it:** React DevTools Profiler → "Highlight updates" + ranked chart:
   what re-rendered on a keystroke, and how expensive was it?
4. **Fix it:** split state → memoize the heavy subtree → wrap the heavy set in
   `startTransition` (or defer the received value) → re-profile.

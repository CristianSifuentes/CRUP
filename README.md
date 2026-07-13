# Concurrent Rendering & Update Prioritization Lab

An interactive, dependency-free React 18 lab that makes concurrent rendering
**visible**: the same 12,000-item search implemented with and without
transitions, live meters for input latency and frame rate, a priority timeline
of every update (including the ones React interrupts and throws away), and a
flamechart that reconstructs React's time-slicing from render-phase timestamps.

```bash
npm install
npm run dev      # open the printed URL
```

Companion reference: [CONCURRENT_CHEATSHEET.md](./CONCURRENT_CHEATSHEET.md)

## Project structure

```
src/
├── blocking/        Section 1 — pre-concurrent behavior (all updates urgent)
│   └── BlockingSearch.jsx
├── concurrent/      Sections 2–3 — transitions & deferred values
│   ├── ConcurrentSearch.jsx     useTransition search
│   ├── DeferredValueDemo.jsx    useDeferredValue + expensive chart
│   └── TransitionDemo.jsx       transition-wrapped navigation (tabs)
├── visualization/   Section 4 — seeing the scheduler work
│   ├── PriorityTimeline.jsx     swimlanes: urgent / transition / deferred
│   ├── Flamechart.jsx           time-slicing reconstructed from samples
│   ├── LatencyMeter.jsx         keystroke → frame responsiveness
│   └── HealthBar.jsx            FPS + main-thread heartbeat
├── hooks/           instrumentation built on React 18 primitives
│   ├── perfLog.js               update log store (useSyncExternalStore)
│   ├── latencyStore.js          input-latency measurement
│   └── useFps.js                rAF frame monitor
└── shared/          burn(), the 12k dataset, the deliberately slow list
```

Every concurrent pattern in the source carries a comment block explaining why
the pattern exists, what problem it solves, when to use it, and what it costs.

---

## 1. What concurrent rendering is — and why React 18 introduced it

Before React 18, rendering was **synchronous and uninterruptible**. Once React
started rendering an update it ran to completion, however long that took. The
main thread — the one thread that also handles your clicks, keystrokes, and
60-per-second paint deadlines — was held hostage. An expensive re-render meant
a frozen caret, a dead button, a stuttering animation. Section 1 of the lab is
exactly this: one state drives an input and 250 expensive rows, and every
keystroke costs ~200 ms of frozen UI.

React 18's concurrent renderer changes the *mechanics* of rendering:

- **Rendering is chunked (time-slicing).** React builds the new tree in memory
  in small units of work, checking roughly every 5 ms whether it should yield
  the thread back to the browser. Frames keep painting; input keeps flowing.
- **Rendering is interruptible.** If an urgent update arrives while a
  low-priority render is in progress, React pauses — or abandons — the
  work-in-progress tree, handles the urgent update, then restarts the
  background work with fresh state.
- **Rendering stays consistent.** The screen never shows a half-applied
  update; React only commits complete trees. Concurrency happens in the
  render phase, never in the commit phase.

Crucially, concurrency is **opt-in per update**. `createRoot` enables the
machinery, but every update is still urgent by default. You tell React what
can wait — with `startTransition` or `useDeferredValue` — and only that work
becomes interruptible. This is why React 18 was adoptable: existing code
behaves as before, and you add concurrency where it pays.

## 2. How React prioritizes updates: urgent vs. non-urgent

React 18 schedules work using **lanes** — a 31-bit priority bitmask. The
simplified mental model used throughout this lab:

| Lane (lab name) | Real examples | Scheduling behavior |
|---|---|---|
| **urgent** | typing, clicks, key presses (discrete events) | rendered synchronously, before the browser may paint; never interrupted |
| **transition** | anything inside `startTransition` | time-sliced, interruptible, abandonable, batched together |
| **deferred** | the catch-up render of `useDeferredValue` | same low-priority pool as transitions |

Two rules generate all observable behavior:

1. **Higher lanes render first.** Pending urgent work always preempts pending
   transition work.
2. **Lower-lane work in progress is disposable.** If an urgent update lands
   mid-transition-render, React throws the half-built tree away and restarts
   later with the newest state. Users never wait for results they no longer
   want.

You can watch rule 2 fire in Section 4: type a burst of five characters into
the concurrent search and count the ⚡ interrupted bars — typically all but
the last transition of the burst.

## 3. `useTransition`: marking non-urgent updates

```jsx
const [isPending, startTransition] = useTransition();

function handleChange(e) {
  setInputValue(e.target.value);                  // urgent: caret must move NOW
  startTransition(() => setListQuery(e.target.value)); // non-urgent: list can lag
}
```

The pattern is **one event, two updates, two priorities**. The state is split:
`inputValue` (urgent, cheap) and `listQuery` (transition, drives the expensive
subtree). `isPending` is true from the moment the transition is scheduled
until it commits — free UI state for "updating…" affordances.

Two practical requirements (both demonstrated in `ConcurrentSearch.jsx`):

- The expensive subtree must be **memoized** (`memo`), otherwise the urgent
  render re-renders it anyway and nothing was gained.
- The transition setter must be called **inside** the `startTransition`
  callback (it's synchronous — React tags updates scheduled during the call).

## 4. `useDeferredValue`: deferring expensive computations

`useTransition` wraps the *setter*. When you don't own the setter — the value
arrives as a prop, from context, or from a hook — wrap the *value* instead:

```jsx
const deferredQuery = useDeferredValue(query);
const isStale = deferredQuery !== query;
return <ExpensiveChart value={deferredQuery} />; // ExpensiveChart is memo()ed
```

Under the hood, when `query` changes React renders **twice**:

1. an urgent render where `deferredQuery` still holds the **old** value — the
   memoized expensive child bails out, so this render is cheap and commits
   immediately (instant keystroke);
2. a low-priority render where `deferredQuery` catches up — time-sliced,
   interruptible, and abandoned if `query` changes again first.

While the values differ you're showing stale content; the lab dims it
(`opacity`) and shows a "recomputing…" chip. Section 3's toggle lets you feel
the difference: deferral ON ≈ 6 ms keystrokes, OFF ≈ 114 ms keystrokes.

## 5. Suspense integration with concurrent rendering

Concurrent rendering is what makes React 18's Suspense semantics work:

- **Non-blocking fallbacks.** When a component suspends during a concurrent
  render, React can keep the *previous* UI on screen while preparing the new
  tree, instead of synchronously stomping it with a fallback.
- **Transitions + Suspense.** Navigation wrapped in `startTransition` that
  suspends shows `isPending` on the old screen rather than unmounting it and
  flashing a spinner. Already-visible content is never replaced by a fallback
  during a transition.
- **Selective hydration (SSR).** The server streams HTML per Suspense
  boundary; on the client, hydration itself is time-sliced concurrent work,
  and React **prioritizes hydrating the boundary the user is interacting
  with** — update prioritization applied to hydration.

This lab keeps its focus on CPU-bound rendering (no network), which is why
there's no Suspense demo section — but the scheduling model you observe here
(urgent first, background interruptible) is exactly the model Suspense rides.

## 6. Automatic batching in React 18

Before 18, React only batched multiple `setState` calls inside React event
handlers; updates in `setTimeout`, promises, or native handlers each triggered
their own render. With `createRoot`, **all** updates from a single task are
batched into one render regardless of origin:

```js
setTimeout(() => {
  setCount(c => c + 1);
  setFlag(f => !f);     // React 17: two renders. React 18: ONE render.
}, 100);
```

Same theme as everything above: React 18 decouples "state changed" from
"render now" and gives the scheduler room to be smart. (Escape hatch, rarely
needed: `flushSync`.)

---

## Real performance measurements

Collected from this app (production build, headless Chromium 140, this repo's
`scripts/measure.mjs`, typing 5 characters per panel at ~120 ms intervals).
Reproduce with the instructions at the top of that script — absolute numbers
vary by machine; the *ratio* is the lesson.

| Metric | Blocking (Section 1) | Concurrent (Section 2) |
|---|---|---|
| Keystroke → next frame, average | **210 ms** | **6.8 ms** (≈ 31× better) |
| Keystroke → next frame, worst | 225 ms | 10.8 ms |
| Minimum FPS while typing | **28 fps** | **60 fps** |
| Committed render shape (flamechart) | 1 chunk, 190 ms solid | 19 chunks, longest 15.9 ms |
| Transitions interrupted during a 5-key burst | n/a (nothing interruptible) | 3 of 5 abandoned before commit |
| `useDeferredValue` demo (Section 3) | OFF: 113.8 ms avg keystroke | ON: 5.6 ms avg keystroke |

Note what did **not** change: total CPU work. The concurrent search's last
transition actually spent *longer* in wall-clock time (it kept yielding to
urgent work). Concurrent rendering is not an optimizer — it's a scheduler.
Users don't feel total work; they feel *when* the thread is available.

---

## Self-check questions

<details>
<summary><strong>1. A colleague says "startTransition makes the filtering faster." What actually changed?</strong></summary>

Nothing got faster — the same components render with the same cost (the lab
measures slightly *more* total work, since interrupted renders are thrown
away). What changed is scheduling: the expensive render was moved off the
urgent path, split into ~5 ms slices, and interleaved with paint and input.
Latency of the *urgent* update dropped from ~210 ms to ~7 ms; the background
result arrives when it arrives.
</details>

<details>
<summary><strong>2. Why does the concurrent search need <code>memo()</code> on the list? What happens without it?</strong></summary>

The keystroke's urgent update re-renders the parent component. Without
`memo`, React would re-render the 250 slow rows *during the urgent pass* —
synchronously, blocking again — because a parent render re-renders children by
default. `memo` lets the urgent pass skip the list (its `query` prop hasn't
changed yet), so only the low-priority transition render pays the cost.
`startTransition`/`useDeferredValue` and `memo` only work as a team.
</details>

<details>
<summary><strong>3. You type "abc" quickly into the concurrent search. How many list renders commit, and what happens to the others?</strong></summary>

Typically one — the render for "abc". The transitions for "a" and "ab" are
interrupted: each new keystroke (urgent) preempts the in-progress transition
render, and React abandons the stale work-in-progress tree rather than
finishing a result the user has already typed past. The timeline shows these
as ⚡ interrupted bars. (If you type slowly enough for a transition to commit
between keystrokes, that one lands too.)
</details>

<details>
<summary><strong>4. When do you reach for <code>useDeferredValue</code> instead of <code>useTransition</code>?</strong></summary>

When you don't control the setter. `useTransition` wraps the code that *sets*
state — yours to call. `useDeferredValue` wraps a *value you receive* (prop,
context, external-store subscription result) and creates a lagging copy that
updates at low priority. Same lane, same interruption semantics, opposite end
of the data flow. Both need the expensive consumer memoized.
</details>

<details>
<summary><strong>5. Why can't an urgent update be interrupted, and why is that fine?</strong></summary>

Urgent updates (discrete input) render synchronously by design: React assumes
they're small — a caret, a toggle, a highlight — and that users need immediate
acknowledgment of direct manipulation. Interruptibility only pays for *large*
renders, and the whole discipline of React 18 is keeping large renders out of
the urgent lane. If an urgent update is slow, the fix isn't interruption —
it's moving the expensive part into a transition.
</details>

<details>
<summary><strong>6. The flamechart shows the blocking render as one 190 ms chunk and the concurrent render as 19 small chunks. What is happening in the gaps between chunks?</strong></summary>

React's scheduler called `shouldYield()` after ~5 ms of work, returned the
main thread to the browser, and the browser used it: painting frames, running
rAF callbacks, dispatching input events (which may then interrupt the render
entirely). Then React resumed where it left off. That handshake — work,
yield, resume — is time-slicing, and it's why FPS stays at 60 during a 300 ms
concurrent render.
</details>

<details>
<summary><strong>7. Does <code>createRoot</code> alone make an app concurrent?</strong></summary>

No. `createRoot` enables the concurrent renderer, but every update is still
urgent (synchronous, blocking) unless marked otherwise. Concurrency activates
per-update via `startTransition` / `useDeferredValue` (and internally for
things like Suspense retries and hydration). That's why Section 1 still
freezes even though this whole app runs under `createRoot`.
</details>

## License

Apache-2.0 (see [LICENSE](./LICENSE)).

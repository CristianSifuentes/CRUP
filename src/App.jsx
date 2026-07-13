import { version } from 'react';
import BlockingSearch from './blocking/BlockingSearch.jsx';
import ConcurrentSearch from './concurrent/ConcurrentSearch.jsx';
import DeferredValueDemo from './concurrent/DeferredValueDemo.jsx';
import TransitionDemo from './concurrent/TransitionDemo.jsx';
import PriorityTimeline from './visualization/PriorityTimeline.jsx';
import Flamechart from './visualization/Flamechart.jsx';
import LatencyMeter from './visualization/LatencyMeter.jsx';
import HealthBar from './visualization/HealthBar.jsx';
import { ITEM_COUNT } from './shared/data.js';

/*
 * Concurrent Rendering & Update Prioritization Lab
 *
 * Suggested tour:
 *   1. Type fast in the BLOCKING search → watch the heartbeat freeze,
 *      fps crater, and latency climb into the hundreds of ms.
 *   2. Type the same thing in the CONCURRENT search → caret instant,
 *      heartbeat smooth, results trail politely behind.
 *   3. Toggle useDeferredValue off/on in Section 3 → same contrast, achieved
 *      from the consumer side.
 *   4. Watch Section 4 the whole time: every keystroke you typed is on the
 *      timeline, labelled with its priority lane, with ⚡ marking transition
 *      renders that React interrupted and threw away.
 */
export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Concurrent Rendering Lab</h1>
          <p className="subtitle">
            React 18 update prioritization: urgent input vs. background work —
            same data ({ITEM_COUNT.toLocaleString()} items), different scheduling.
          </p>
        </div>
        <HealthBar />
      </header>

      <section className="section">
        <div className="section-head">
          <h2>
            <span className="section-num">1 + 2</span> Blocking vs. concurrent —
            side by side
          </h2>
          <p>
            Identical search over the same {ITEM_COUNT.toLocaleString()} items,
            identical ~175 ms of render work per keystroke. The only difference:
            the right panel marks the list update as a <code>transition</code>.
            Type fast in each and watch the meters — and the heartbeat dot above.
          </p>
        </div>
        <div className="compare-grid">
          <div className="compare-col">
            <LatencyMeter source="blocking" title="① Blocking (all updates urgent)" />
            <BlockingSearch />
          </div>
          <div className="compare-col">
            <LatencyMeter source="concurrent" title="② Concurrent (useTransition)" />
            <ConcurrentSearch />
          </div>
        </div>
        <details className="explain">
          <summary>Why the difference? (the one-paragraph version)</summary>
          <p>
            React cannot make your components faster — the work is the same on
            both sides. What changed is <strong>scheduling</strong>. On the
            left, one urgent update carries the caret AND the expensive list,
            so the browser cannot paint your keystroke until 250 slow rows
            finish rendering. On the right, the keystroke is its own tiny
            urgent update (commits in ~2 ms), and the list render is a
            transition: time-sliced into ~5 ms chunks, interleaved with paints
            and input, and thrown away wholesale if you type again before it
            commits. Urgency became a property of the <em>update</em>, not of
            the app.
          </p>
        </details>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <span className="section-num">3</span> useDeferredValue in action
          </h2>
          <p>
            Every keystroke feeds a ~110 ms “data transformation” (the chart).
            With deferral ON, the input updates urgently while the chart lags
            behind on a stale value — dimmed until the background render
            catches up. Toggle it OFF to feel every keystroke pay the full price.
          </p>
        </div>
        <div className="compare-grid">
          <div className="compare-col">
            <LatencyMeter source="deferred-on" title="③ Typing with deferral ON" />
            <LatencyMeter source="deferred-off" title="③ Typing with deferral OFF" />
          </div>
          <div className="compare-col wide">
            <DeferredValueDemo />
          </div>
        </div>
        <details className="explain">
          <summary>useTransition vs. useDeferredValue — which one when?</summary>
          <p>
            Both put work in the same low-priority basket. <code>useTransition</code>{' '}
            wraps the <em>setter</em>: use it when the slow update is yours to
            trigger (search state, navigation). <code>useDeferredValue</code>{' '}
            wraps the <em>value</em>: use it when you merely receive a prop or
            context value and can’t reach the setter. Both require the
            expensive child to be memoized — otherwise the urgent render
            re-renders it anyway and nothing was gained.
          </p>
        </details>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <span className="section-num">3b</span> Transitions for navigation
          </h2>
          <p>
            An expensive screen behind a tab (~180 ms mount). Mash the “Am I
            alive?” button while opening Analytics — with and without{' '}
            <code>startTransition</code>. Then click away to Settings
            mid-load: interruptible rendering means abandoning screens you no
            longer want.
          </p>
        </div>
        <TransitionDemo />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            <span className="section-num">4</span> Update priority visualization
          </h2>
          <p>
            Live log of every update the demos above produce: which lane it ran
            in, how long it took, and whether React interrupted it (⚡) because
            something more urgent arrived. Type a burst in the concurrent
            search and count how many transitions never got to commit.
          </p>
        </div>
        <PriorityTimeline />
        <div className="section-head sub">
          <h3>Time-slicing flamechart</h3>
          <p>
            The same render work, reconstructed from timestamps captured inside
            each row’s render. One solid bar = a synchronous render that never
            yields. A comb of ~5 ms slices = React’s scheduler cooperating with
            the browser between chunks.
          </p>
        </div>
        <Flamechart />
      </section>

      <footer className="footer">
        Concurrent Rendering &amp; Update Prioritization Lab · React {version} ·
        no external dependencies · see README.md and CONCURRENT_CHEATSHEET.md
      </footer>
    </div>
  );
}

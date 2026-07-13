import { memo, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { burn } from '../shared/burn.js';
import {
  beginUpdate,
  endUpdate,
  interruptUpdate,
  recordRenderSample,
} from '../hooks/perfLog.js';
import { trackInput } from '../hooks/latencyStore.js';

/*
 * SECTION 3 — useDeferredValue: concurrency without touching the setter.
 *
 * useTransition needs access to the setState call to wrap it. But often you
 * only RECEIVE a value (a prop, a context value, a hook result) and can't
 * change how it's set. useDeferredValue is the mirror-image tool:
 *
 *   const deferred = useDeferredValue(value);
 *
 * UNDER THE HOOD: when `value` changes, React first re-renders URGENTLY with
 * the OLD deferred value (cheap — nothing downstream changed, memoized
 * children bail out entirely), commits and paints that. Then it schedules a
 * SECOND, low-priority render where deferred catches up to value. That
 * second render is time-sliced and interruptible — if `value` changes again
 * first, the catch-up render is abandoned and restarted with the newest
 * value, exactly like a transition.
 *
 * While `deferred !== value` you are showing STALE content — free signal
 * for a "recomputing…" affordance (like isPending, but derived).
 *
 * WHEN TO USE: expensive subtree consumes a value you don't control the
 * setter of. PITFALL: without memo() on the expensive child it's pointless —
 * the urgent render would re-render the child anyway. Defer + memo, always.
 */

const BAR_COUNT = 36;
const BAR_COST_MS = 3; // 36 bars × 3 ms ≈ 110 ms per chart computation

/**
 * Simulated expensive transformation: derives a histogram from the text.
 * Deterministic (same text → same bars) and deliberately slow.
 */
function computeBars(text, probeRef) {
  const bars = [];
  let hash = 7;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  for (let i = 0; i < BAR_COUNT; i++) {
    recordRenderSample(probeRef?.current); // flamechart sample per unit of work
    burn(BAR_COST_MS); // the "expensive data transformation"
    hash = (hash * 137 + i * 71 + 13) % 997;
    bars.push(0.15 + (hash / 997) * 0.85);
  }
  return bars;
}

/*
 * memo() is load-bearing here (see the pitfall note above): during the
 * urgent render the `value` prop is still the OLD deferred value, so memo
 * bails out and the urgent pass never pays the 110 ms.
 */
const ExpensiveChart = memo(function ExpensiveChart({ value, probeRef }) {
  const bars = useMemo(() => computeBars(value, probeRef), [value, probeRef]);
  const width = 360;
  const height = 120;
  const barWidth = width / BAR_COUNT;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="chart"
      role="img"
      aria-label={`Histogram derived from “${value}”`}
    >
      {bars.map((v, i) => (
        <rect
          key={i}
          x={i * barWidth + 1}
          y={height - v * height}
          width={barWidth - 2}
          height={v * height}
          rx="2"
          className="chart-bar"
        />
      ))}
    </svg>
  );
});

export default function DeferredValueDemo() {
  const [text, setText] = useState('concurrent react');
  const [deferOn, setDeferOn] = useState(true);
  const deferredText = useDeferredValue(text);

  // Toggle between the two behaviors so the difference is felt, not told:
  //   deferOn  → chart consumes the lagging value (urgent render stays cheap)
  //   deferOff → chart consumes the live value (every keystroke pays 110 ms)
  const chartValue = deferOn ? deferredText : text;
  const isStale = deferOn && deferredText !== text;

  const urgentUpdateRef = useRef(null);
  const deferredUpdateRef = useRef(null);

  function handleChange(event) {
    const value = event.target.value;
    trackInput(deferOn ? 'deferred-on' : 'deferred-off');
    urgentUpdateRef.current = beginUpdate(
      `type "${value}"`,
      'urgent',
      'deferred-demo'
    );
    if (deferOn) {
      // A new keystroke abandons the previous catch-up render, if any.
      if (deferredUpdateRef.current != null) {
        interruptUpdate(deferredUpdateRef.current);
      }
      deferredUpdateRef.current = beginUpdate(
        `recompute chart for "${value}"`,
        'deferred',
        'deferred-demo'
      );
    }
    setText(value);
  }

  useEffect(() => {
    if (urgentUpdateRef.current != null) {
      endUpdate(urgentUpdateRef.current);
      urgentUpdateRef.current = null;
    }
  }, [text]);

  // Fires when the low-priority catch-up render commits (deferredText moved).
  useEffect(() => {
    if (deferredUpdateRef.current != null) {
      endUpdate(deferredUpdateRef.current);
      deferredUpdateRef.current = null;
    }
  }, [deferredText]);

  return (
    <div className="deferred-demo">
      <div className="demo-controls">
        <label className="field grow">
          <span className="field-label">
            Chart source text{' '}
            {isStale && <span className="pending-chip">recomputing…</span>}
          </span>
          <input
            type="text"
            value={text}
            onChange={handleChange}
            placeholder="Type — each change recomputes a ~110 ms chart"
            spellCheck={false}
          />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={deferOn}
            onChange={(e) => setDeferOn(e.target.checked)}
          />
          <span>useDeferredValue</span>
        </label>
      </div>
      {/* Stale chart stays visible, dimmed, while the new one computes in
          the background — the user never stares at a blank or frozen UI. */}
      <div className={`chart-wrap ${isStale ? 'stale' : ''}`}>
        <ExpensiveChart value={chartValue} probeRef={deferredUpdateRef} />
        <div className="chart-caption">
          {deferOn
            ? 'Chart consumes the DEFERRED value: input stays instant, chart catches up.'
            : 'Chart consumes the LIVE value: every keystroke blocks ~110 ms. Feel the lag.'}
        </div>
      </div>
    </div>
  );
}

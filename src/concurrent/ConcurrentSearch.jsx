import { useEffect, useRef, useState, useTransition } from 'react';
import { MemoItemList } from '../shared/ItemList.jsx';
import {
  beginUpdate,
  endUpdate,
  interruptUpdate,
} from '../hooks/perfLog.js';
import { trackInput } from '../hooks/latencyStore.js';

/*
 * SECTION 2 — "With concurrent rendering": the same search, same data, same
 * per-row cost — but the expensive part is marked as a TRANSITION.
 *
 * THE PATTERN
 * Split one conceptual value into two states with different priorities:
 *   inputValue — urgent: what the user sees in the box. Must update NOW.
 *   listQuery  — transition: what the list filters by. Can lag.
 *
 * startTransition(() => setListQuery(v)) tells React: "this update is not
 * urgent — render it concurrently." React then:
 *   1. Renders the urgent update (input box) synchronously → instant caret.
 *   2. Starts rendering the list in the background, in ~5 ms time slices,
 *      yielding to the browser between slices (frames keep painting).
 *   3. If another keystroke arrives mid-render, React ABANDONS the stale
 *      work-in-progress tree and restarts with the newest value — the user
 *      never waits for results they no longer want.
 *
 * isPending (from useTransition) is true while the low-priority render is
 * in flight — free UI state for "results updating…" affordances.
 *
 * WHEN TO USE THIS: whenever one input drives both something small/urgent
 * (a text box, a tab highlight) and something big/slow (a list, a chart).
 * PERFORMANCE NOTE: the total CPU work is the same or slightly higher
 * (abandoned renders are thrown away) — what improves is SCHEDULING, which
 * is what users actually feel.
 */
export default function ConcurrentSearch() {
  const [inputValue, setInputValue] = useState(''); // urgent state
  const [listQuery, setListQuery] = useState(''); // transition state
  const [isPending, startTransition] = useTransition();

  const urgentUpdateRef = useRef(null);
  const transitionUpdateRef = useRef(null);

  function handleChange(event) {
    const value = event.target.value;
    trackInput('concurrent');

    // 1) URGENT: the input box must reflect the keystroke immediately.
    urgentUpdateRef.current = beginUpdate(
      `type "${value}"`,
      'urgent',
      'concurrent'
    );
    setInputValue(value);

    // 2) If a previous transition render hasn't committed yet, this new
    //    keystroke interrupts it — React discards that work-in-progress
    //    tree. Log it so the timeline shows the interruption.
    if (transitionUpdateRef.current != null) {
      interruptUpdate(transitionUpdateRef.current);
    }

    // 3) TRANSITION: the expensive list render is explicitly non-urgent.
    transitionUpdateRef.current = beginUpdate(
      `filter "${value}" + render list`,
      'transition',
      'concurrent'
    );
    startTransition(() => {
      setListQuery(value);
    });
  }

  // Commit effects close the log entries. Two separate effects because the
  // two states commit at different times — that time gap IS the priority gap.
  useEffect(() => {
    if (urgentUpdateRef.current != null) {
      endUpdate(urgentUpdateRef.current);
      urgentUpdateRef.current = null;
    }
  }, [inputValue]);

  useEffect(() => {
    if (transitionUpdateRef.current != null) {
      endUpdate(transitionUpdateRef.current);
      transitionUpdateRef.current = null;
    }
  }, [listQuery]);

  return (
    <div className="search-panel concurrent">
      <label className="field">
        <span className="field-label">
          Search 12,000 items (useTransition)
          {isPending && <span className="pending-chip">updating…</span>}
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          placeholder="Type the same thing here — feel the difference"
          spellCheck={false}
        />
      </label>
      {/*
        MemoItemList (memoized) is essential: the urgent keystroke render
        re-runs this component, and without memo it would drag the 250 slow
        rows into the urgent pass — blocking again. With memo, the urgent
        pass sees an unchanged `query` prop and skips the list entirely.
        The stale list stays on screen (slightly dimmed) until the
        transition commits.
      */}
      <div className={isPending ? 'stale' : ''}>
        <MemoItemList query={listQuery} probeRef={transitionUpdateRef} />
      </div>
    </div>
  );
}

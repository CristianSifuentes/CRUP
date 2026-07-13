import { useEffect, useRef, useState } from 'react';
import ItemList from '../shared/ItemList.jsx';
import { beginUpdate, endUpdate } from '../hooks/perfLog.js';
import { trackInput } from '../hooks/latencyStore.js';

/*
 * SECTION 1 — "Without concurrent rendering" (how every update behaved
 * before React 18, and how UNMARKED updates still behave today).
 *
 * One state drives both the input text AND the filtered list. Typing fires
 * a discrete input event, which React treats as URGENT: it renders the
 * entire affected tree synchronously — input box + 250 slow rows — before
 * the browser is allowed to paint the character you just typed.
 *
 * The result: every keystroke costs ~180 ms of blocked main thread.
 * The caret freezes, the FPS meter craters, the heartbeat dot stutters,
 * and fast typists outrun the UI.
 *
 * Nothing here is "wrong" code — it's the default. The lesson of React 18
 * is that the default treats ALL updates as equally urgent, and for
 * expensive subtrees you must TELL React what can wait (Section 2).
 */
export default function BlockingSearch() {
  const [query, setQuery] = useState('');
  // Holds the perf-log id of the in-flight update so rows can attribute
  // their render samples to it, and the commit effect can close it.
  const pendingUpdateRef = useRef(null);

  function handleChange(event) {
    const value = event.target.value;
    trackInput('blocking'); // start the keystroke→frame stopwatch
    pendingUpdateRef.current = beginUpdate(
      `type "${value}" + filter + render list`,
      'urgent',
      'blocking'
    );
    // ONE urgent update carries everything: caret, filter, 250 slow rows.
    // React will render it all synchronously, right now, on this thread.
    setQuery(value);
  }

  // useEffect runs after commit — closing the entry here measures the full
  // synchronous render+commit the keystroke paid for.
  useEffect(() => {
    if (pendingUpdateRef.current != null) {
      endUpdate(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, [query]);

  return (
    <div className="search-panel blocking">
      <label className="field">
        <span className="field-label">Search 12,000 items (blocking)</span>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Try typing “turbo” quickly…"
          spellCheck={false}
        />
      </label>
      <ItemList query={query} probeRef={pendingUpdateRef} />
    </div>
  );
}

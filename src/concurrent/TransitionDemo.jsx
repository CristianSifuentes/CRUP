import { useEffect, useRef, useState, useTransition } from 'react';
import { burn } from '../shared/burn.js';
import { beginUpdate, endUpdate } from '../hooks/perfLog.js';

/*
 * TRANSITION DEMO — a button/tab click that triggers an expensive render.
 *
 * Search inputs aren't the only victims of blocking renders: navigation is
 * the classic case. Clicking a tab that mounts an expensive screen freezes
 * the app BEFORE it can even highlight the tab you clicked — the UI can't
 * acknowledge the click until the whole new screen has rendered.
 *
 * Wrapped in startTransition, the same click:
 *   - highlights the tab instantly (urgent update),
 *   - shows isPending feedback on the OLD screen (which stays interactive),
 *   - mounts the expensive screen concurrently in the background,
 *   - can be cancelled by clicking another tab mid-render.
 *
 * The counter button is the "is the page alive?" probe: mash it while the
 * expensive tab loads. Without the transition it goes dead; with it, it
 * keeps counting.
 */

const CELL_COUNT = 120;
const CELL_COST_MS = 1.5; // 120 × 1.5 ms ≈ 180 ms to mount Analytics

function ExpensiveAnalytics() {
  return (
    <div className="analytics-grid">
      {Array.from({ length: CELL_COUNT }, (_, i) => {
        burn(CELL_COST_MS); // each cell is a pretend mini-visualization
        return (
          <div key={i} className="analytics-cell">
            <span className="cell-value">{((i * 37) % 90) + 10}</span>
            <span className="cell-label">metric {i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', cheap: true },
  { id: 'analytics', label: 'Analytics (expensive)', cheap: false },
  { id: 'settings', label: 'Settings', cheap: true },
];

export default function TransitionDemo() {
  const [activeTab, setActiveTab] = useState('overview');
  const [useTransitionMode, setUseTransitionMode] = useState(true);
  const [clicks, setClicks] = useState(0);
  const [isPending, startTransition] = useTransition();
  const pendingUpdateRef = useRef(null);

  function selectTab(id) {
    if (useTransitionMode) {
      pendingUpdateRef.current = beginUpdate(
        `open "${id}" tab`,
        'transition',
        'tabs'
      );
      // Non-urgent: mount the new screen concurrently. The click's own
      // urgent work (button active state, isPending flip) commits first.
      startTransition(() => setActiveTab(id));
    } else {
      pendingUpdateRef.current = beginUpdate(
        `open "${id}" tab (blocking)`,
        'urgent',
        'tabs'
      );
      setActiveTab(id); // urgent → mounts the expensive screen synchronously
    }
  }

  useEffect(() => {
    if (pendingUpdateRef.current != null) {
      endUpdate(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, [activeTab]);

  return (
    <div className="transition-demo">
      <div className="demo-controls">
        <div className="tab-row" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          {isPending && <span className="pending-chip">loading…</span>}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={useTransitionMode}
            onChange={(e) => setUseTransitionMode(e.target.checked)}
          />
          <span>wrap in startTransition</span>
        </label>
        <button className="probe-button" onClick={() => setClicks((c) => c + 1)}>
          Am I alive? Clicked {clicks}×
        </button>
      </div>

      <div className={`tab-panel ${isPending ? 'stale' : ''}`}>
        {activeTab === 'overview' && (
          <p className="tab-copy">
            Cheap tab. Now open <strong>Analytics</strong> — first with the
            transition ON (tab highlights instantly, “loading…” appears, the
            counter button keeps working), then with it OFF (the whole page
            freezes for ~180 ms before anything reacts).
          </p>
        )}
        {activeTab === 'analytics' && <ExpensiveAnalytics />}
        {activeTab === 'settings' && (
          <p className="tab-copy">
            Another cheap tab. Try clicking here WHILE Analytics is still
            pending — the transition is abandoned and you land here at once:
            interruptible rendering means never waiting for a screen you
            already navigated away from.
          </p>
        )}
      </div>
    </div>
  );
}

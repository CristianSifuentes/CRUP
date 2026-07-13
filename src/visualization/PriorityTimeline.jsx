import { useEffect, useState } from 'react';
import { useUpdateLog } from '../hooks/perfLog.js';

/*
 * SECTION 4a — Update Priority Timeline.
 *
 * Three swimlanes — urgent / transition / deferred — mirroring (in
 * simplified form) React's internal LANE model: a 31-bit mask where each bit
 * class is a priority level. SyncLane (discrete input) outranks
 * TransitionLanes; when both have pending work, React always renders the
 * higher lane first and will interrupt in-progress lower-lane work to do so.
 *
 * Reading the chart while you type in Section 2:
 *   - urgent bars are hairline-short (a few ms) and never interrupted;
 *   - transition bars are long, and most of them end with the ⚡ interrupted
 *     marker: the next keystroke's urgent update preempted them and React
 *     threw the half-built tree away;
 *   - only the LAST transition of a typing burst commits. That asymmetry —
 *     urgent always wins, non-urgent work is disposable — IS update
 *     prioritization.
 */

const WINDOW_MS = 15000;

const LANES = [
  { key: 'urgent', label: 'Urgent', hint: 'discrete input · sync, uninterruptible' },
  { key: 'transition', label: 'Transition', hint: 'startTransition · time-sliced, interruptible' },
  { key: 'deferred', label: 'Deferred', hint: 'useDeferredValue catch-up · same low priority' },
];

export default function PriorityTimeline() {
  const entries = useUpdateLog();
  const [now, setNow] = useState(() => performance.now());

  // Tick 4×/second so the window scrolls; cheap because this component
  // renders only lightweight absolutely-positioned divs.
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const windowStart = now - WINDOW_MS;
  const recent = entries.filter((e) => (e.end ?? now) >= windowStart);
  const latest = [...entries].slice(-8).reverse();

  return (
    <div className="timeline">
      <div className="timeline-lanes">
        {LANES.map((lane) => (
          <div key={lane.key} className="timeline-lane">
            <div className="lane-label">
              <span className={`lane-chip lane-${lane.key}`} />
              <span>{lane.label}</span>
              <span className="lane-hint">{lane.hint}</span>
            </div>
            <div className="lane-track">
              {recent
                .filter((e) => e.lane === lane.key)
                .map((e) => {
                  const end = e.end ?? now;
                  const left = Math.max(
                    0,
                    ((e.start - windowStart) / WINDOW_MS) * 100
                  );
                  const width = Math.max(
                    0.4,
                    ((end - Math.max(e.start, windowStart)) / WINDOW_MS) * 100
                  );
                  const duration = e.end
                    ? `${(e.end - e.start).toFixed(1)} ms`
                    : 'running…';
                  const status = e.interrupted
                    ? ' — ⚡ interrupted by a more urgent update'
                    : e.end
                      ? ' — committed'
                      : ' — in flight';
                  return (
                    <div
                      key={e.id}
                      className={`lane-bar lane-${lane.key} ${
                        e.interrupted ? 'interrupted' : ''
                      } ${e.end == null ? 'running' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`[${e.source}] ${e.label} · ${duration}${status}`}
                    />
                  );
                })}
            </div>
          </div>
        ))}
        <div className="timeline-axis">
          <span>−15 s</span>
          <span>−10 s</span>
          <span>−5 s</span>
          <span>now</span>
        </div>
      </div>

      <div className="update-log">
        <div className="update-log-title">Latest updates (newest first)</div>
        <table>
          <thead>
            <tr>
              <th>lane</th>
              <th>update</th>
              <th>duration</th>
              <th>outcome</th>
            </tr>
          </thead>
          <tbody>
            {latest.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className={`lane-chip lane-${e.lane}`} /> {e.lane}
                </td>
                <td className="log-label">{e.label}</td>
                <td className="num">
                  {e.end ? `${(e.end - e.start).toFixed(1)} ms` : '…'}
                </td>
                <td>
                  {e.interrupted
                    ? '⚡ interrupted'
                    : e.end
                      ? 'committed'
                      : 'running'}
                </td>
              </tr>
            ))}
            {latest.length === 0 && (
              <tr>
                <td colSpan="4" className="empty">
                  Interact with any demo above to populate the timeline.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

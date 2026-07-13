import { useInputLatency } from '../hooks/latencyStore.js';

/*
 * Input responsiveness meter — keystroke → next frame, per demo.
 *
 * Thresholds follow perception research (and the RAIL model):
 *   ≤ 16 ms  → within one 60 fps frame: feels instant
 *   ≤ 100 ms → still perceived as "reacting to me"
 *   > 100 ms → the UI is visibly lagging behind the user's fingers
 *
 * Values are exposed as data-* attributes so external tooling (and this
 * repo's measurement script) can scrape real numbers off the live app.
 */

function grade(ms) {
  if (ms == null) return 'idle';
  if (ms <= 16) return 'good';
  if (ms <= 100) return 'warn';
  return 'bad';
}

export default function LatencyMeter({ source, title }) {
  const { last, average, worst, count } = useInputLatency(source);

  return (
    <div
      className={`latency-meter grade-${grade(average)}`}
      data-source={source}
      data-last={last?.toFixed(1) ?? ''}
      data-average={average?.toFixed(1) ?? ''}
      data-worst={worst?.toFixed(1) ?? ''}
    >
      <div className="meter-title">{title}</div>
      <div className="meter-value">
        {average == null ? '—' : `${average.toFixed(0)} ms`}
        <span className="meter-unit">avg keystroke → frame</span>
      </div>
      <div className="meter-detail">
        {count === 0
          ? 'type in this panel to measure'
          : `last ${last.toFixed(0)} ms · worst ${worst.toFixed(0)} ms · ${count} keys`}
      </div>
    </div>
  );
}

import { useUpdateLog } from '../hooks/perfLog.js';

/*
 * SECTION 4b — Time-slicing flamechart.
 *
 * Every slow row/bar in this lab timestamps itself during the render phase
 * (recordRenderSample). This component reconstructs how React SCHEDULED that
 * work by looking at the gaps between consecutive timestamps:
 *
 *   - consecutive samples < GAP_MS apart  → same uninterrupted chunk of work
 *   - a gap ≥ GAP_MS                      → React yielded the main thread
 *                                           back to the browser (paint, input)
 *                                           before resuming
 *
 * The blocking search renders as ONE solid chunk spanning the whole update:
 * synchronous rendering never yields. The concurrent search renders as a
 * comb of ~5 ms chunks: React's scheduler checks shouldYield() roughly every
 * 5 ms and hands the thread back between slices — this is TIME-SLICING, and
 * the white gaps are where your keystrokes, clicks and frames get serviced.
 */

const GAP_MS = 4;
const ROW_COST_ESTIMATE = 0.7; // matches ItemList's per-row burn

function chunkify(samples) {
  const chunks = [];
  for (const ts of samples) {
    const last = chunks[chunks.length - 1];
    if (last && ts - last.end <= GAP_MS) {
      last.end = ts + ROW_COST_ESTIMATE;
      last.units++;
    } else {
      chunks.push({ start: ts, end: ts + ROW_COST_ESTIMATE, units: 1 });
    }
  }
  return chunks;
}

function latestSampledEntry(entries, source) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.source === source && e.end !== null && !e.interrupted && e.samples.length > 10) {
      return e;
    }
  }
  return null;
}

function FlameRow({ title, entry, scaleMs, tone }) {
  if (!entry) {
    return (
      <div className="flame-row">
        <div className="flame-title">{title}</div>
        <div className="flame-track empty-track">type in the search boxes above to capture a render</div>
      </div>
    );
  }
  const chunks = chunkify(entry.samples);
  const duration = entry.end - entry.start;
  const longest = Math.max(...chunks.map((c) => c.end - c.start));

  return (
    <div className="flame-row">
      <div className="flame-title">
        {title}
        <span className="flame-stats">
          {duration.toFixed(0)} ms total · {chunks.length}{' '}
          {chunks.length === 1 ? 'chunk' : 'chunks'} · longest chunk{' '}
          {longest.toFixed(1)} ms
        </span>
      </div>
      <div className="flame-track">
        {chunks.map((c, i) => (
          <div
            key={i}
            className={`flame-chunk ${tone}`}
            style={{
              left: `${((c.start - entry.start) / scaleMs) * 100}%`,
              width: `${Math.max(0.3, ((c.end - c.start) / scaleMs) * 100)}%`,
            }}
            title={`chunk ${i + 1}: ${(c.end - c.start).toFixed(1)} ms · ${c.units} rows`}
          />
        ))}
      </div>
      <div className="flame-verdict">
        {chunks.length === 1 ? (
          <>
            One solid chunk — the main thread was held for{' '}
            {duration.toFixed(0)} ms straight. Nothing else could run:
            no paint, no input, no animation. That is a blocking render.
          </>
        ) : (
          <>
            {chunks.length} slices with yields between them — React paused
            after ~5 ms of work each time, let the browser breathe, then
            resumed. The gaps are where your input and frames were serviced.
          </>
        )}
      </div>
    </div>
  );
}

export default function Flamechart() {
  const entries = useUpdateLog();
  const blocking = latestSampledEntry(entries, 'blocking');
  const concurrent = latestSampledEntry(entries, 'concurrent');

  const scaleMs = Math.max(
    blocking ? blocking.end - blocking.start : 0,
    concurrent ? concurrent.end - concurrent.start : 0,
    50
  );

  return (
    <div className="flamechart">
      <FlameRow
        title="Blocking search — last committed render"
        entry={blocking}
        scaleMs={scaleMs}
        tone="flame-urgent"
      />
      <FlameRow
        title="Concurrent search — last committed render (same work!)"
        entry={concurrent}
        scaleMs={scaleMs}
        tone="flame-transition"
      />
      <div className="flame-axis">
        <span>0 ms</span>
        <span>{Math.round(scaleMs / 2)} ms</span>
        <span>{Math.round(scaleMs)} ms</span>
      </div>
    </div>
  );
}

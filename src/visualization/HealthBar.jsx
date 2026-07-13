import { useEffect, useRef } from 'react';
import { useFps } from '../hooks/useFps.js';

/*
 * HealthBar — the always-visible "is the main thread alive?" strip.
 *
 * Two probes:
 *
 * 1. FPS + longest frame (useFps): counts real rAF frames. A synchronous
 *    300 ms render produces a 300 ms frame — visible as an fps dip and a
 *    "longest frame" spike.
 *
 * 2. The heartbeat dot: animated from a rAF loop that writes styles
 *    DIRECTLY to the DOM (no React state — a re-render per frame would be
 *    both wasteful and self-defeating). CSS animations can keep running on
 *    the compositor thread even when the main thread is blocked, which
 *    would hide exactly what we want to expose — a JS-driven animation
 *    cannot lie: when the main thread is busy, the dot freezes mid-flight.
 */
export default function HealthBar() {
  const { fps, longestFrame } = useFps();
  const dotRef = useRef(null);
  const clockRef = useRef(null);

  useEffect(() => {
    let rafId;
    const t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000;
      // Ping-pong 0→1→0 across the track, driven purely by main-thread JS.
      const phase = Math.abs(((t * 0.6) % 2) - 1);
      if (dotRef.current) {
        dotRef.current.style.left = `${4 + phase * 88}%`;
      }
      if (clockRef.current) {
        clockRef.current.textContent = `${(now / 1000).toFixed(1)}s`;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const fpsGrade = fps >= 50 ? 'good' : fps >= 30 ? 'warn' : 'bad';

  return (
    <div className="health-bar">
      <div className={`fps-badge grade-${fpsGrade}`} data-fps={fps}>
        <span className="fps-value">{fps}</span>
        <span className="fps-label">fps</span>
        <span className="fps-longest">longest frame {longestFrame} ms</span>
      </div>
      <div className="heartbeat" title="JS-driven animation: freezes whenever the main thread is blocked">
        <div className="heartbeat-track">
          <div className="heartbeat-dot" ref={dotRef} />
        </div>
        <span className="heartbeat-label">
          main-thread heartbeat <span ref={clockRef} className="heartbeat-clock" />
        </span>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

/*
 * useFps — frame-rate + longest-frame monitor built on requestAnimationFrame.
 *
 * WHY THIS SHOWS BLOCKING
 * rAF callbacks run on the main thread, once per displayed frame. When a
 * synchronous render holds the thread for 300 ms, NO frames are produced for
 * 300 ms: fps drops and "longest frame" spikes. Concurrent rendering keeps
 * each slice of work under ~5 ms, so the browser keeps hitting its frame
 * deadline and fps stays near 60 even while heavy rendering is in progress.
 *
 * State updates only once per second so the monitor itself is nearly free.
 */
export function useFps() {
  const [stats, setStats] = useState({ fps: 60, longestFrame: 0 });

  useEffect(() => {
    let frames = 0;
    let longest = 0;
    let last = performance.now();
    let windowStart = last;
    let rafId;

    const loop = (now) => {
      frames++;
      longest = Math.max(longest, now - last);
      last = now;
      if (now - windowStart >= 1000) {
        setStats({
          fps: Math.round((frames * 1000) / (now - windowStart)),
          longestFrame: Math.round(longest),
        });
        frames = 0;
        longest = 0;
        windowStart = now;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return stats;
}

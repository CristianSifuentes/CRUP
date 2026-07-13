import { memo, useMemo } from 'react';
import { filterItems } from './data.js';
import { burn } from './burn.js';
import { recordRenderSample } from '../hooks/perfLog.js';

/*
 * ItemList — the deliberately expensive result list both search demos share.
 *
 * Each visible row busy-waits ~ROW_COST_MS during render, simulating a
 * component that is genuinely expensive (rich markup, formatting, charts…).
 * 250 rows × 0.7 ms ≈ 175 ms of pure render work per filter — far beyond the
 * ~16 ms frame budget of a 60 fps screen. THAT is the work React must either
 * do in one blocking gulp (Section 1) or slice concurrently (Section 2).
 *
 * Rows are intentionally NOT memoized: every filter change should pay the
 * full render cost so both sections handle identical workloads.
 */

export const ROW_COST_MS = 0.7;
export const MAX_VISIBLE = 250;

function Row({ item, probeRef }) {
  // Instrumentation: timestamp this render-phase unit of work. The
  // flamechart reconstructs React's time slices from gaps between samples.
  recordRenderSample(probeRef?.current);
  burn(ROW_COST_MS); // the simulated expensive render
  return (
    <li className="row">
      <span className="row-name">{item.name}</span>
      <span className="row-cat">{item.category}</span>
      <span className="row-price">${item.price}</span>
    </li>
  );
}

function ItemList({ query, probeRef }) {
  const matches = useMemo(() => filterItems(query), [query]);
  const visible = matches.slice(0, MAX_VISIBLE);

  return (
    <div className="item-list">
      <div className="list-meta">
        {matches.length.toLocaleString()} matches
        {matches.length > visible.length
          ? ` · rendering first ${visible.length}`
          : ''}
        {' · '}~{Math.round(visible.length * ROW_COST_MS)} ms of render work
      </div>
      <ul>
        {visible.map((item) => (
          <Row key={item.id} item={item} probeRef={probeRef} />
        ))}
      </ul>
      {visible.length === 0 && <div className="empty">No matches</div>}
    </div>
  );
}

/*
 * Two exports, one crucial difference:
 *
 * - Default (unmemoized): used by the BLOCKING demo, where input and list
 *   share one state — every keystroke re-renders everything synchronously.
 *
 * - MemoItemList: used by the CONCURRENT demo. memo() matters there because
 *   the urgent keystroke update re-renders the parent; without memo, the
 *   urgent render would ALSO re-render 250 slow rows and block anyway.
 *   memo() lets the urgent pass skip the list (its `query` prop hasn't
 *   changed yet) so only the low-priority transition render pays the cost.
 *   startTransition and memo work as a team: the transition de-prioritizes
 *   the expensive subtree, memo keeps it out of the urgent path.
 */
export default ItemList;
export const MemoItemList = memo(ItemList);

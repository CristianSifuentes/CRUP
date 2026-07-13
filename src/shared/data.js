/*
 * Deterministic dataset: 12,000 catalog items.
 *
 * Generated once at module load. Filtering 12k strings is actually cheap
 * (~1–2 ms) — the expensive part of a search UI is RE-RENDERING the result
 * list. That mirrors real apps: the bottleneck is almost always rendering,
 * not the array filter, and rendering is exactly what concurrent React
 * knows how to slice and schedule.
 */

const ADJECTIVES = [
  'Atomic', 'Quantum', 'Turbo', 'Nimble', 'Solar', 'Lunar', 'Rustic',
  'Vivid', 'Silent', 'Rapid', 'Frozen', 'Golden', 'Nordic', 'Cosmic',
  'Vintage', 'Modular', 'Hybrid', 'Compact', 'Prime', 'Stellar',
];

const NOUNS = [
  'Widget', 'Gadget', 'Sensor', 'Router', 'Speaker', 'Monitor', 'Keyboard',
  'Camera', 'Drone', 'Tripod', 'Charger', 'Adapter', 'Console', 'Headset',
  'Printer', 'Scanner', 'Battery', 'Antenna', 'Beacon', 'Module',
  'Turbine', 'Compass', 'Lantern', 'Toolkit', 'Capsule',
];

const CATEGORIES = [
  'Audio', 'Video', 'Power', 'Network', 'Input', 'Output', 'Storage', 'Optics',
];

export const ITEM_COUNT = 12000;

export const ITEMS = Array.from({ length: ITEM_COUNT }, (_, i) => {
  const adjective = ADJECTIVES[i % ADJECTIVES.length];
  const noun = NOUNS[(i * 7) % NOUNS.length];
  const category = CATEGORIES[(i * 3) % CATEGORIES.length];
  const name = `${adjective} ${noun} #${String(i).padStart(5, '0')}`;
  return {
    id: i,
    name,
    category,
    price: 9 + ((i * 37) % 490),
    // Pre-lowercased key so the filter itself stays cheap and the demo
    // isolates RENDER cost, not string-processing cost.
    searchKey: `${name} ${category}`.toLowerCase(),
  };
});

export function filterItems(query) {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS;
  return ITEMS.filter((item) => item.searchKey.includes(q));
}

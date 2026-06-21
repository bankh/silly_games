// elements.js — shared element data layer for the Atomic Clash modes (and any future
// element game). ES module; resolves all asset paths relative to ITSELF via import.meta.url
// so it works no matter which game folder imports it (or what the Pages sub-path is).
//
//   import { loadElements, gridExtent, subsetByCount, GRID } from "../../shared/elements/elements.js";

const BASE = new URL("./", import.meta.url); // shared/elements/

// Visual grid: 18 columns; rows 1-7 are the main block, 9-10 the detached f-block strips
// (row 8 is the intentional gap). Validation and rendering both use (col,row).
export const GRID = Object.freeze({
  cols: 18,
  mainRows: 7,
  fRows: [9, 10],
  gapRow: 8,
  totalRows: 10,
});

// Shared card back (used face-down in the memory game). Resolved like the element images.
export const cardBackURL = new URL("img/atlas_game_back_single.png", BASE).href;

let _cache = null;

/** Load + cache the 118-element table. Each record gets a resolved absolute `img` URL. */
export async function loadElements() {
  if (_cache) return _cache;
  // no-cache: always revalidate so a regenerated elements.json (e.g. fixed symbols/paths)
  // is picked up instead of a stale copy. (force-cache previously pinned old, broken data.)
  const res = await fetch(new URL("elements.json", BASE), { cache: "no-cache" });
  if (!res.ok) throw new Error(`elements.json → HTTP ${res.status}`);
  const data = await res.json();
  _cache = data.map((e) => ({ ...e, img: new URL(e.img, BASE).href }));
  return _cache;
}

/** First N elements by atomic number — the "Fixed" set (always the same block). */
export function subsetByCount(elements, n) {
  return elements.slice(0, Math.max(0, Math.min(n, elements.length)));
}

/** N random distinct elements — the "Random" set (a fresh draw each game), sorted by Z. */
export function randomSubsetByCount(elements, n) {
  const a = elements.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const k = Math.max(0, Math.min(n, a.length));
  return a.slice(0, k).sort((x, y) => x.z - y.z);
}

/** Pick the element set for a round. mode: "fixed" | "random". */
export function pickSet(elements, n, mode) {
  return mode === "random" ? randomSubsetByCount(elements, n) : subsetByCount(elements, n);
}

/** Tight (col,row) bounding box for a set of elements — used to centre/scale the board. */
export function gridExtent(elements) {
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  let hasF = false;
  for (const e of elements) {
    minC = Math.min(minC, e.col); maxC = Math.max(maxC, e.col);
    minR = Math.min(minR, e.row); maxR = Math.max(maxR, e.row);
    if (e.block === "f") hasF = true;
  }
  return { minC, maxC, minR, maxR, hasF };
}

// Palette for slot tinting / card backs by category — colour is a learning cue, not chrome.
export const CATEGORY_COLORS = Object.freeze({
  "nonmetal":               "#43c59e",
  "noble-gas":              "#9d7bff",
  "alkali-metal":           "#ff6b6b",
  "alkaline-earth-metal":   "#ffa94d",
  "transition-metal":       "#4dabf7",
  "lanthanide":             "#f783ac",
  "actinide":               "#e64980",
  "p-block":                "#ffd43b",
});

export function categoryColor(cat) {
  return CATEGORY_COLORS[cat] || "#9fb8da";
}

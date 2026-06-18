// state.js — the authoritative game state + all the rules that mutate it.
// Persistence is timestamp-based: crops store plantedAt (epoch ms), so growth
// continues correctly across reloads. Everything lives in localStorage.

import {
  GRID, CROPS, BUILDINGS, costOf, levelFromXp, xpForLevel, levelReward,
  BARN_BASE, BARN_STEP, BARN_UPGRADE_COST,
} from "./data.js";

const SAVE_KEY = "township.save.v1";

// --- tiny event bus so UI/render can react without tight coupling ---
const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= []).push(fn); }
export function emit(evt, payload) { (listeners[evt] || []).forEach((fn) => fn(payload)); }

export const key = (gx, gy) => `${gx},${gy}`;
export const inBounds = (gx, gy) => gx >= 0 && gy >= 0 && gx < GRID && gy < GRID;

export const state = {
  version: 1,
  coins: 0,
  xp: 0,
  population: 0,
  barnCap: BARN_BASE,
  barnUpgrades: 0,
  inventory: {},          // cropId -> count
  tiles: {},              // "gx,gy" -> { type, crop?, plantedAt? }
  orders: [],             // active helicopter orders
  orderSeq: 1,
  lastOrderAt: 0,
  savedAt: 0,
};

// ---------- derived helpers ----------
export function level() { return levelFromXp(state.xp).level; }
export function levelProgress() { return levelFromXp(state.xp); }

export function barnUsed() {
  return Object.values(state.inventory).reduce((a, b) => a + b, 0);
}
export function barnFree() { return Math.max(0, state.barnCap - barnUsed()); }

export function countType(typeId) {
  return Object.values(state.tiles).filter((t) => t.type === typeId).length;
}
export function nextCost(typeId) { return costOf(typeId, countType(typeId)); }

// population multiplier applied to order coin rewards
export function payMultiplier() { return 1 + state.population * 0.02; }

// Crop maturity 0..1 for a field tile (1 = ready). null if empty.
export function cropProgress(tile, now) {
  if (!tile || tile.type !== "field" || !tile.crop) return null;
  const def = CROPS[tile.crop];
  const elapsed = (now - tile.plantedAt) / 1000;
  return Math.max(0, Math.min(1, elapsed / def.grow));
}
export function isReady(tile, now) {
  const p = cropProgress(tile, now);
  return p != null && p >= 1;
}
export function secondsLeft(tile, now) {
  if (!tile || tile.type !== "field" || !tile.crop) return 0;
  const def = CROPS[tile.crop];
  return Math.max(0, Math.ceil(def.grow - (now - tile.plantedAt) / 1000));
}

// ---------- mutations (each returns {ok, msg?} and emits "change") ----------
function fail(msg) { emit("toast", { kind: "bad", msg }); return { ok: false, msg }; }
function changed() { state.savedAt = Date.now(); save(); emit("change"); }

export function addXp(amount) {
  const before = level();
  state.xp += amount;
  const after = level();
  if (after > before) {
    for (let l = before + 1; l <= after; l++) {
      const reward = levelReward(l);
      state.coins += reward;
      emit("toast", { kind: "level", msg: `Level ${l}! +${reward} 🪙` });
      emit("levelup", l);
    }
  }
}

export function placeBuilding(gx, gy, typeId) {
  if (!inBounds(gx, gy)) return fail("Outside the town.");
  if (state.tiles[key(gx, gy)]) return fail("That tile is occupied.");
  const def = BUILDINGS[typeId];
  if (!def) return fail("Unknown building.");
  if (level() < def.unlock) return fail(`${def.name} unlocks at level ${def.unlock}.`);
  const cost = nextCost(typeId);
  if (state.coins < cost) return fail(`Need ${cost} 🪙 for a ${def.name}.`);

  state.coins -= cost;
  state.tiles[key(gx, gy)] = { type: typeId };
  if (def.pop) state.population += def.pop;
  if (def.xp) addXp(def.xp);
  emit("toast", { kind: "good", msg: `Built ${def.name}${cost ? ` (-${cost} 🪙)` : " (free)"}.` });
  changed();
  return { ok: true };
}

export function removeTile(gx, gy) {
  const t = state.tiles[key(gx, gy)];
  if (!t) return fail("Nothing here.");
  const def = BUILDINGS[t.type];
  if (def && def.pop) state.population = Math.max(0, state.population - def.pop);
  delete state.tiles[key(gx, gy)];
  emit("toast", { kind: "good", msg: `Removed ${def ? def.name : "tile"}.` });
  changed();
  return { ok: true };
}

export function plant(gx, gy, cropId) {
  const t = state.tiles[key(gx, gy)];
  if (!t || t.type !== "field") return fail("Not a field.");
  if (t.crop) return fail("Already planted.");
  const def = CROPS[cropId];
  if (!def) return fail("Unknown crop.");
  if (level() < def.unlock) return fail(`${def.name} unlocks at level ${def.unlock}.`);
  if (state.coins < def.seed) return fail(`Need ${def.seed} 🪙 of seed.`);

  state.coins -= def.seed;
  t.crop = cropId;
  t.plantedAt = Date.now();
  changed();
  return { ok: true };
}

export function harvest(gx, gy) {
  const t = state.tiles[key(gx, gy)];
  const now = Date.now();
  if (!t || t.type !== "field" || !t.crop) return fail("Nothing to harvest.");
  if (!isReady(t, now)) return fail("Not ready yet.");
  if (barnFree() < 1) return fail("Barn is full — sell or deliver first.");
  const def = CROPS[t.crop];
  state.inventory[t.crop] = (state.inventory[t.crop] || 0) + 1;
  addXp(def.xp);
  delete t.crop;
  delete t.plantedAt;
  emit("toast", { kind: "good", msg: `Harvested ${def.icon} ${def.name}. +${def.xp} XP` });
  changed();
  return { ok: true };
}

// "Plant on every empty field that can grow this crop" convenience.
export function plantAll(cropId) {
  let n = 0;
  for (const k in state.tiles) {
    const t = state.tiles[k];
    if (t.type === "field" && !t.crop) {
      const [gx, gy] = k.split(",").map(Number);
      const def = CROPS[cropId];
      if (state.coins < def.seed) break;
      if (plant(gx, gy, cropId).ok) n++;
    }
  }
  if (n) emit("toast", { kind: "good", msg: `Planted ${n} field(s).` });
  else fail("No empty fields (or not enough coins).");
  return n;
}

export function harvestAll() {
  const now = Date.now();
  let n = 0;
  for (const k in state.tiles) {
    const t = state.tiles[k];
    if (t.type === "field" && isReady(t, now) && barnFree() > 0) {
      const [gx, gy] = k.split(",").map(Number);
      if (harvest(gx, gy).ok) n++;
    }
  }
  if (!n) fail("Nothing ready to harvest.");
  return n;
}

export function sell(cropId, qty = 1) {
  const have = state.inventory[cropId] || 0;
  const n = Math.min(qty, have);
  if (n < 1) return fail("None in barn.");
  const def = CROPS[cropId];
  state.inventory[cropId] -= n;
  if (state.inventory[cropId] <= 0) delete state.inventory[cropId];
  state.coins += def.sell * n;
  emit("toast", { kind: "good", msg: `Sold ${n}× ${def.icon} for ${def.sell * n} 🪙` });
  changed();
  return { ok: true };
}

export function upgradeBarn() {
  const cost = BARN_UPGRADE_COST(state.barnUpgrades);
  if (state.coins < cost) return fail(`Need ${cost} 🪙 to expand the barn.`);
  state.coins -= cost;
  state.barnUpgrades++;
  state.barnCap += BARN_STEP;
  emit("toast", { kind: "good", msg: `Barn expanded to ${state.barnCap}.` });
  changed();
  return { ok: true };
}

export function barnUpgradeCost() { return BARN_UPGRADE_COST(state.barnUpgrades); }

// ---------- persistence ----------
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  }, 120);
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* private mode */ }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data);
      return true;
    } catch (e) { /* corrupt — fall through to new game */ }
  }
  newGame();
  return false;
}

export function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  newGame();
  emit("change");
  emit("toast", { kind: "good", msg: "New town started." });
}

// Fresh starting layout: a few free fields + a starter house, some coins.
export function newGame() {
  state.version = 1;
  state.coins = 150;
  state.xp = 0;
  state.population = 0;
  state.barnCap = BARN_BASE;
  state.barnUpgrades = 0;
  state.inventory = {};
  state.tiles = {};
  state.orders = [];
  state.orderSeq = 1;
  state.lastOrderAt = 0;
  state.savedAt = Date.now();

  const mid = Math.floor(GRID / 2);
  state.tiles[key(mid - 1, mid - 1)] = { type: "field" };
  state.tiles[key(mid, mid - 1)] = { type: "field" };
  state.tiles[key(mid - 1, mid)] = { type: "field" };
  save();
}

// orders.js — the helicopter order board. Orders request crops you can grow and
// pay coins + XP. Delivery pays better than selling raw, so it's the main income.

import { CROPS, CROP_IDS } from "./data.js";
import { state, level, payMultiplier, emit, save, addXp } from "./state.js";

const MAX_ORDERS = 3;
const REFILL_MS = 14000; // a new order appears this long after a slot frees up

function rint(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Crops the player has unlocked at their current level.
function availableCrops() {
  const lvl = level();
  return CROP_IDS.filter((id) => CROPS[id].unlock <= lvl);
}

function makeOrder() {
  const pool = availableCrops();
  if (!pool.length) return null;
  const lines = Math.min(pool.length, rint(1, pool.length >= 3 ? 3 : pool.length));
  const chosen = new Set();
  while (chosen.size < lines) chosen.add(pick(pool));

  const items = {};
  let coins = 0, xp = 0;
  for (const id of chosen) {
    const def = CROPS[id];
    const qty = rint(1, 4);
    items[id] = qty;
    // delivery pays ~1.7× the raw market value → orders beat selling.
    coins += Math.round(def.sell * qty * 1.7);
    xp += Math.round(def.xp * qty * 1.3);
  }
  coins += rint(3, 12); // small flat tip
  return {
    id: state.orderSeq++,
    items,
    coins,
    xp,
    createdAt: Date.now(),
  };
}

export function canFill(order) {
  return Object.entries(order.items).every(([id, qty]) => (state.inventory[id] || 0) >= qty);
}

export function fillOrder(orderId) {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return { ok: false };
  const order = state.orders[idx];
  if (!canFill(order)) { emit("toast", { kind: "bad", msg: "Not enough goods in the barn." }); return { ok: false }; }

  for (const [id, qty] of Object.entries(order.items)) {
    state.inventory[id] -= qty;
    if (state.inventory[id] <= 0) delete state.inventory[id];
  }
  const pay = Math.round(order.coins * payMultiplier());
  state.coins += pay;
  state.orders.splice(idx, 1);
  state.lastOrderAt = Date.now();

  addXp(order.xp);
  emit("toast", { kind: "good", msg: `Delivered! +${pay} 🪙 +${order.xp} XP` });
  save();
  emit("change");
  return { ok: true };
}

export function dismissOrder(orderId) {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return;
  state.orders.splice(idx, 1);
  state.lastOrderAt = Date.now() - REFILL_MS / 2; // small penalty: slower refill
  save();
  emit("change");
}

// Called on a timer from main.js. Tops the board back up to MAX_ORDERS.
export function tickOrders(now) {
  if (state.orders.length >= MAX_ORDERS) return false;
  // seed the board instantly when empty (e.g. fresh game / first load)
  const due = state.orders.length === 0 || now - (state.lastOrderAt || 0) >= REFILL_MS;
  if (!due) return false;
  const order = makeOrder();
  if (!order) return false;
  state.orders.push(order);
  state.lastOrderAt = now;
  save();
  emit("change");
  return true;
}

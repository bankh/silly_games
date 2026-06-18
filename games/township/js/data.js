// data.js — the game's tuning tables: crops, buildables, and leveling.
// Grow times are in SECONDS (accelerated vs. real Township so a session is fun).

export const GRID = 8; // 8×8 buildable board

// Crops, ordered by tier. `unlock` = player level required to plant.
// `seed` = coins to plant, `sell` = market sell price, `xp` = harvest XP,
// `grow` = seconds to mature.
export const CROPS = {
  wheat:   { name: "Wheat",   icon: "🌾", seed: 0,  sell: 3,  xp: 2,  grow: 8,   unlock: 1, color: "#e3c34d" },
  corn:    { name: "Corn",    icon: "🌽", seed: 4,  sell: 12, xp: 4,  grow: 22,  unlock: 2, color: "#f2d34a" },
  carrot:  { name: "Carrot",  icon: "🥕", seed: 8,  sell: 22, xp: 7,  grow: 40,  unlock: 3, color: "#f08a2a" },
  tomato:  { name: "Tomato",  icon: "🍅", seed: 14, sell: 38, xp: 11, grow: 65,  unlock: 4, color: "#e5512c" },
  pumpkin: { name: "Pumpkin", icon: "🎃", seed: 22, sell: 60, xp: 16, grow: 100, unlock: 5, color: "#e57a18" },
  grape:   { name: "Grapes",  icon: "🍇", seed: 34, sell: 92, xp: 24, grow: 150, unlock: 7, color: "#8e54c9" },
};
export const CROP_IDS = Object.keys(CROPS);

// Placeable buildings. `cost` is the BASE coin price; price escalates with the
// number you already own (see costOf). `unlock` = player level required.
export const BUILDINGS = {
  field: {
    name: "Field", icon: "🟫", desc: "A plot to plant & harvest crops.",
    cost: 12, growth: 1.5, unlock: 1, free: 3, // first 3 fields free, then priced
  },
  house: {
    name: "House", icon: "🏠", desc: "+5 population. Population boosts order pay.",
    cost: 60, growth: 1.6, unlock: 2, pop: 5,
  },
  tree: {
    name: "Tree", icon: "🌳", desc: "Pure decoration. A little XP for prettifying.",
    cost: 15, growth: 1.25, unlock: 1, xp: 5,
  },
  fountain: {
    name: "Fountain", icon: "⛲", desc: "Fancy decoration. A nice XP bump.",
    cost: 120, growth: 1.4, unlock: 4, xp: 30,
  },
};
export const BUILDING_IDS = Object.keys(BUILDINGS);

// Escalating price: each additional copy costs more.
export function costOf(typeId, ownedCount) {
  const b = BUILDINGS[typeId];
  if (!b) return 0;
  const free = b.free || 0;
  if (ownedCount < free) return 0;
  const n = ownedCount - free;
  return Math.round(b.cost * Math.pow(b.growth, n));
}

// Cumulative XP required to REACH a given level (level 1 = 0).
export function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) total += 40 + (l - 2) * 35;
  return total;
}

// Resolve an XP total into { level, into, span } for the progress bar.
export function levelFromXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - base, span: next - base };
}

// Coin reward granted when you reach a level.
export function levelReward(level) {
  return 40 + level * 20;
}

export const BARN_BASE = 40;        // starting barn capacity
export const BARN_STEP = 20;        // capacity added per upgrade
export const BARN_UPGRADE_COST = (level) => 50 + level * 60; // cost of next upgrade

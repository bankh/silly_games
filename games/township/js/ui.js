// ui.js — all the DOM chrome: HUD, shop, orders board, barn, crop picker, toasts.
// It reads state and calls mutations; main.js owns canvas input and the build tool.

import {
  CROPS, CROP_IDS, BUILDINGS, BUILDING_IDS,
} from "./data.js";
import {
  state, on, level, levelProgress, barnUsed, barnFree, nextCost,
  countType, plant, harvest, plantAll, harvestAll, sell, upgradeBarn,
  barnUpgradeCost, resetGame, secondsLeft, isReady,
} from "./state.js";
import { canFill, fillOrder, dismissOrder } from "./orders.js";

const $ = (id) => document.getElementById(id);

// The current build tool: null (play), a building id, or "_remove".
let tool = null;
// Crop chosen for the "Plant All" button (sticky), defaults to wheat.
let lastCrop = "wheat";

export function getBuildTool() {
  if (!tool) return null;
  if (tool === "_remove") return { type: "_remove", icon: "🚧", isRemove: true };
  return { type: tool, icon: BUILDINGS[tool].icon, isRemove: false };
}
export function clearTool() { tool = null; renderShop(); updateToolbar(); hideHint(); }

function setTool(t) {
  tool = (tool === t) ? null : t;
  renderShop();
  updateToolbar();
  if (tool === "_remove") showHint("Remove mode — click a building or field to bulldoze it. Esc to stop.");
  else if (tool) showHint(`Placing ${BUILDINGS[tool].name} — click a green tile. Esc to cancel.`);
  else hideHint();
}

// ---------- toasts ----------
let toastTimer = null;
export function toast(msg, kind = "good") {
  const wrap = $("toasts");
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2200);
  // cap stack
  while (wrap.children.length > 4) wrap.firstChild.remove();
}

// ---------- hint banner ----------
function showHint(text) { const h = $("hint"); h.textContent = text; h.classList.remove("hidden"); }
function hideHint() { $("hint").classList.add("hidden"); }

// ---------- HUD ----------
function updateHud() {
  const lp = levelProgress();
  $("hud-coins").textContent = Math.floor(state.coins).toLocaleString();
  $("hud-lvl").textContent = `Lv ${lp.level}`;
  const pct = lp.span ? Math.min(100, (lp.into / lp.span) * 100) : 100;
  $("hud-xpfill").style.width = pct + "%";
  $("hud-xp").textContent = `${lp.into}/${lp.span} XP`;
  $("hud-pop").textContent = state.population;
  const used = barnUsed();
  $("hud-barn").textContent = `${used}/${state.barnCap}`;
  $("hud-barn").parentElement.classList.toggle("full", used >= state.barnCap);
}

// ---------- shop ----------
function renderShop() {
  const box = $("shop-list");
  if (!box) return;
  const lvl = level();
  let html = "";
  for (const id of BUILDING_IDS) {
    const b = BUILDINGS[id];
    const locked = lvl < b.unlock;
    const cost = nextCost(id);
    const owned = countType(id);
    const sel = tool === id ? "sel" : "";
    const afford = state.coins >= cost;
    html += `
      <button class="shop-item ${sel} ${locked ? "locked" : ""}" data-build="${id}" ${locked ? "disabled" : ""}>
        <span class="si-icon">${b.icon}</span>
        <span class="si-body">
          <span class="si-name">${b.name} <span class="si-owned">×${owned}</span></span>
          <span class="si-desc">${b.desc}</span>
        </span>
        <span class="si-cost ${afford || cost === 0 ? "" : "no"}">${locked ? `🔒 Lv ${b.unlock}` : (cost === 0 ? "FREE" : `${cost} 🪙`)}</span>
      </button>`;
  }
  html += `
      <button class="shop-item ${tool === "_remove" ? "sel" : ""}" data-build="_remove">
        <span class="si-icon">🚧</span>
        <span class="si-body">
          <span class="si-name">Bulldoze</span>
          <span class="si-desc">Remove a building or field (no refund).</span>
        </span>
        <span class="si-cost"></span>
      </button>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-build]").forEach((el) =>
    el.addEventListener("click", () => setTool(el.dataset.build)));
}

// ---------- barn ----------
function renderBarn() {
  const box = $("barn-list");
  if (!box) return;
  const entries = CROP_IDS.filter((id) => (state.inventory[id] || 0) > 0);
  let html = `<div class="barn-cap">Storage: <b>${barnUsed()}/${state.barnCap}</b>
    <button class="mini" id="barn-upgrade">Expand +20 · ${barnUpgradeCost()} 🪙</button></div>`;
  if (!entries.length) {
    html += `<p class="muted">Your barn is empty. Harvest crops to fill it.</p>`;
  } else {
    for (const id of entries) {
      const def = CROPS[id];
      const n = state.inventory[id];
      html += `
        <div class="barn-row">
          <span class="br-icon">${def.icon}</span>
          <span class="br-name">${def.name}</span>
          <span class="br-count">×${n}</span>
          <button class="mini sell" data-sell="${id}">Sell 1 · ${def.sell} 🪙</button>
          <button class="mini sell" data-sellall="${id}">All · ${def.sell * n} 🪙</button>
        </div>`;
    }
  }
  box.innerHTML = html;
  $("barn-upgrade").addEventListener("click", () => { upgradeBarn(); });
  box.querySelectorAll("[data-sell]").forEach((el) =>
    el.addEventListener("click", () => sell(el.dataset.sell, 1)));
  box.querySelectorAll("[data-sellall]").forEach((el) =>
    el.addEventListener("click", () => sell(el.dataset.sellall, 9999)));
}

// ---------- orders ----------
function renderOrders() {
  const box = $("orders");
  if (!box) return;
  if (!state.orders.length) {
    box.innerHTML = `<div class="order empty">📻 Waiting for new orders…</div>`;
    return;
  }
  let html = "";
  for (const o of state.orders) {
    const ready = canFill(o);
    const items = Object.entries(o.items).map(([id, q]) => {
      const have = state.inventory[id] || 0;
      const ok = have >= q;
      return `<span class="oi ${ok ? "" : "short"}">${CROPS[id].icon}<b>${have}/${q}</b></span>`;
    }).join("");
    html += `
      <div class="order">
        <button class="order-x" data-dismiss="${o.id}" title="Dismiss">×</button>
        <div class="order-items">${items}</div>
        <div class="order-reward">${o.coins} 🪙 · ${o.xp} XP</div>
        <button class="order-go" data-fill="${o.id}" ${ready ? "" : "disabled"}>${ready ? "Deliver" : "Need goods"}</button>
      </div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll("[data-fill]").forEach((el) =>
    el.addEventListener("click", () => fillOrder(Number(el.dataset.fill))));
  box.querySelectorAll("[data-dismiss]").forEach((el) =>
    el.addEventListener("click", () => dismissOrder(Number(el.dataset.dismiss))));
}

// ---------- crop picker popover ----------
// kind: "single" (plant one field gx,gy) or "all" (plant every empty field)
export function openPicker(kind, gx, gy, screenX, screenY) {
  const pop = $("picker");
  const lvl = level();
  let html = `<div class="picker-head">${kind === "all" ? "Plant all empty fields with…" : "Plant…"}</div><div class="picker-grid">`;
  for (const id of CROP_IDS) {
    const def = CROPS[id];
    const locked = lvl < def.unlock;
    html += `
      <button class="crop ${locked ? "locked" : ""}" data-crop="${id}" ${locked ? "disabled" : ""}>
        <span class="c-icon">${def.icon}</span>
        <span class="c-name">${def.name}</span>
        <span class="c-meta">${locked ? `🔒 Lv ${def.unlock}` : `${def.seed ? def.seed + " 🪙" : "free"} · ${def.grow}s`}</span>
      </button>`;
  }
  html += `</div>`;
  pop.innerHTML = html;
  pop.classList.remove("hidden");

  // position near the click, clamped to viewport
  const r = pop.getBoundingClientRect();
  let x = (screenX ?? window.innerWidth / 2) - r.width / 2;
  let y = (screenY ?? window.innerHeight / 2) - r.height - 12;
  x = Math.max(8, Math.min(window.innerWidth - r.width - 8, x));
  y = Math.max(8, Math.min(window.innerHeight - r.height - 8, y));
  pop.style.left = x + "px";
  pop.style.top = y + "px";

  pop.querySelectorAll("[data-crop]").forEach((el) =>
    el.addEventListener("click", () => {
      const cropId = el.dataset.crop;
      lastCrop = cropId;
      if (kind === "all") plantAll(cropId);
      else plant(gx, gy, cropId);
      closePicker();
    }));
}
export function closePicker() { $("picker").classList.add("hidden"); }
export function pickerOpen() { return !$("picker").classList.contains("hidden"); }

// ---------- panels ----------
function togglePanel(id) {
  const p = $(id);
  const wasHidden = p.classList.contains("hidden");
  closeAllPanels();
  if (wasHidden) p.classList.remove("hidden");
  updateToolbar();
}
function closeAllPanels() {
  ["shop", "barnPanel", "menu"].forEach((id) => $(id).classList.add("hidden"));
}
export function panelsOpen() {
  return ["shop", "barnPanel", "menu", "picker"].some((id) => !$(id).classList.contains("hidden"));
}
export function closeEverything() { closeAllPanels(); closePicker(); }

function updateToolbar() {
  $("tb-build").classList.toggle("active", !$("shop").classList.contains("hidden"));
  $("tb-barn").classList.toggle("active", !$("barnPanel").classList.contains("hidden"));
  $("tb-build").classList.toggle("armed", !!tool);
}

// ---------- wiring ----------
export function initUI() {
  // toolbar buttons
  $("tb-build").addEventListener("click", () => { togglePanel("shop"); renderShop(); });
  $("tb-barn").addEventListener("click", () => { togglePanel("barnPanel"); renderBarn(); });
  $("tb-menu").addEventListener("click", () => { togglePanel("menu"); });
  $("tb-plantall").addEventListener("click", (e) => {
    openPicker("all", null, null, e.clientX, window.innerHeight - 150);
  });
  $("tb-harvestall").addEventListener("click", () => harvestAll());

  // menu actions
  $("menu-reset").addEventListener("click", () => {
    if (confirm("Start a brand-new town? This erases your current save.")) resetGame();
    closeAllPanels();
  });

  // panel close buttons (delegated)
  document.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => { closeAllPanels(); }));

  // refresh whenever state changes
  on("change", () => {
    updateHud();
    renderOrders();
    if (!$("shop").classList.contains("hidden")) renderShop();
    if (!$("barnPanel").classList.contains("hidden")) renderBarn();
  });
  on("toast", ({ msg, kind }) => toast(msg, kind === "level" ? "level" : kind === "bad" ? "bad" : "good"));

  updateHud();
  renderOrders();
  renderShop();
  updateToolbar();
}

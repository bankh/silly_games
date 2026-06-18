// main.js — boots the game: canvas sizing, the render loop, pointer input
// (pan / zoom / tap-to-act), and the order timer. Glues state + render + ui.

import {
  makeCamera, centerCamera, zoomAt, screenToGrid,
} from "./iso.js";
import { GRID, CROPS, BUILDINGS } from "./data.js";
import {
  state, load, inBounds, key, level, nextCost,
  harvest, placeBuilding, removeTile, secondsLeft, isReady,
} from "./state.js";
import { tickOrders } from "./orders.js";
import { render } from "./render.js";
import {
  initUI, getBuildTool, clearTool, openPicker, closePicker, pickerOpen,
  panelsOpen, closeEverything, toast,
} from "./ui.js";

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const cam = makeCamera();

let hover = null;       // {gx,gy} under the cursor, or null
let pointerScreen = null;

// ---------- sizing ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
}

// ---------- input ----------
let down = null;        // {x,y, camX, camY} when pointer pressed
let dragging = false;
const DRAG_PX = 6;

function updateHoverFromScreen(x, y) {
  pointerScreen = { x, y };
  const g = screenToGrid(x, y, cam);
  hover = inBounds(g.gx, g.gy) ? g : null;
}

canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y };
  dragging = false;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  updateHoverFromScreen(e.clientX, e.clientY);
  if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!dragging && Math.hypot(dx, dy) > DRAG_PX) dragging = true;
    if (dragging) { cam.x = down.camX + dx; cam.y = down.camY + dy; }
  }
});

function endPointer(e) {
  const wasDrag = dragging;
  const start = down;
  down = null;
  dragging = false;
  if (!start || wasDrag) return; // a pan, not a tap
  handleTap(e.clientX, e.clientY);
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", () => { down = null; dragging = false; });

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoomAt(cam, factor, e.clientX, e.clientY);
  updateHoverFromScreen(e.clientX, e.clientY);
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { clearTool(); closeEverything(); }
});

// click on the dark canvas → act on a tile
function handleTap(sx, sy) {
  // a tap anywhere first dismisses an open crop picker
  if (pickerOpen()) { closePicker(); return; }

  const g = screenToGrid(sx, sy, cam);
  if (!inBounds(g.gx, g.gy)) { closeEverything(); return; }
  const { gx, gy } = g;
  const tile = state.tiles[key(gx, gy)];
  const tool = getBuildTool();

  // build / bulldoze mode
  if (tool) {
    if (tool.isRemove) removeTile(gx, gy);
    else placeBuilding(gx, gy, tool.type);
    return;
  }

  // play mode
  if (!tile) {
    toast("Empty land — open 🔨 Build to place something here.", "good");
    return;
  }
  if (tile.type === "field") {
    if (!tile.crop) { openPicker("single", gx, gy, sx, sy); return; }
    if (isReady(tile, Date.now())) { harvest(gx, gy); return; }
    toast(`${CROPS[tile.crop].icon} ${CROPS[tile.crop].name} — ${secondsLeft(tile, Date.now())}s left`, "good");
    return;
  }
  // a building
  const def = BUILDINGS[tile.type];
  toast(`${def.icon} ${def.name}`, "good");
}

// ---------- per-frame view for the renderer ----------
function buildView() {
  const tool = getBuildTool();
  let placeable = false;
  let ghost = null;
  if (tool && hover) {
    ghost = { type: tool.type, icon: tool.icon };
    const t = state.tiles[key(hover.gx, hover.gy)];
    if (tool.isRemove) {
      placeable = !!t;
    } else {
      const b = BUILDINGS[tool.type];
      placeable = !t && level() >= b.unlock && state.coins >= nextCost(tool.type);
    }
  }
  return { hover, ghost, placeable, mode: tool ? "build" : "play" };
}

// ---------- loop ----------
function frame() {
  const now = Date.now();
  render(ctx, canvas, cam, buildView(), now);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
function boot() {
  resize();
  window.addEventListener("resize", resize);
  load();
  centerCamera(cam, GRID, window.innerWidth, window.innerHeight);
  initUI();

  // zoom buttons (zoom toward viewport center)
  const cx = () => window.innerWidth / 2, cy = () => window.innerHeight / 2;
  document.getElementById("zoom-in").addEventListener("click", () => zoomAt(cam, 1.18, cx(), cy()));
  document.getElementById("zoom-out").addEventListener("click", () => zoomAt(cam, 1 / 1.18, cx(), cy()));

  // seed/refill the order board, and keep the HUD timers fresh
  tickOrders(Date.now());
  setInterval(() => tickOrders(Date.now()), 1500);

  requestAnimationFrame(frame);
}

boot();

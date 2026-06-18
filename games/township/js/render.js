// render.js — draws the isometric town onto a 2D canvas every frame.
// Pure drawing: it reads state but never mutates it.

import {
  TILE_W, TILE_H, gridToScreen, tileW, tileH, wallH, depth,
} from "./iso.js";
import { GRID, CROPS, BUILDINGS } from "./data.js";
import { state, key, cropProgress, isReady } from "./state.js";

// shade a hex color by a factor (>1 lighter, <1 darker)
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `rgb(${r},${g},${b})`;
}

function diamond(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w / 2, y + h / 2);
  ctx.closePath();
}

function drawGroundTile(ctx, gx, gy, cam) {
  const { x, y } = gridToScreen(gx, gy, cam);
  const w = tileW(cam), h = tileH(cam);
  const alt = (gx + gy) % 2 === 0;
  diamond(ctx, x, y, w, h);
  ctx.fillStyle = alt ? "#79bd54" : "#6fb14b";
  ctx.fill();
  ctx.strokeStyle = "rgba(40,80,30,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFieldSoil(ctx, gx, gy, cam) {
  const { x, y } = gridToScreen(gx, gy, cam);
  const w = tileW(cam), h = tileH(cam);
  diamond(ctx, x, y, w, h);
  ctx.fillStyle = "#7a5230";
  ctx.fill();
  // furrows along one iso axis
  ctx.strokeStyle = "rgba(60,38,20,0.55)";
  ctx.lineWidth = Math.max(1, 2 * cam.scale);
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + (w / 2) * t, y + (h / 2) * t);
    ctx.lineTo(x + (w / 2) * t, y + h - (h / 2) * t);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(40,25,12,0.5)";
  diamond(ctx, x, y, w, h);
  ctx.stroke();
}

function drawCrop(ctx, gx, gy, tile, cam, now) {
  const p = cropProgress(tile, now);
  if (p == null) return;
  const def = CROPS[tile.crop];
  const { x, y } = gridToScreen(gx, gy, cam);
  const h = tileH(cam);
  const cx = x, cy = y + h / 2;
  const ready = p >= 1;
  // grow from a sprout (0.4) up to full size; ready crops bob gently.
  const scale = (0.4 + 0.6 * p) * cam.scale;
  const bob = ready ? Math.sin(now / 250) * 3 * cam.scale : 0;
  const size = 30 * scale;

  if (ready) {
    // soft glow ring under a ripe crop
    ctx.beginPath();
    ctx.arc(cx, cy + 2, size * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,238,140,0.35)";
    ctx.fill();
  }
  ctx.font = `${Math.max(8, size)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // young crops show a sprout; mature/ready show the crop icon
  const glyph = p < 0.5 ? "🌱" : def.icon;
  ctx.fillText(glyph, cx, cy + size * 0.35 - bob);

  if (ready) {
    ctx.font = `${Math.max(8, 14 * cam.scale)}px system-ui, sans-serif`;
    ctx.fillText("✅", cx + size * 0.55, cy - size * 0.5 - bob);
  }
}

// An iso cuboid building with three shaded faces and an emoji on the roof.
function drawBuilding(ctx, gx, gy, tile, cam) {
  const def = BUILDINGS[tile.type];
  const { x, y } = gridToScreen(gx, gy, cam);
  const w = tileW(cam), h = tileH(cam);
  const wh = wallH(cam) * (def.tall || 1);

  const base = {
    top: { x, y },
    right: { x: x + w / 2, y: y + h / 2 },
    bottom: { x, y: y + h },
    left: { x: x - w / 2, y: y + h / 2 },
  };
  // decorations are short/squat; houses get full walls
  const isDecor = def.xp != null && def.pop == null;
  const bodyH = isDecor ? wh * 0.45 : wh;

  const palette = {
    house: "#e8e2d2", tree: "#5aa54a", fountain: "#cfd8e0", field: "#caa46a",
  };
  const wall = palette[tile.type] || "#d9d2c2";

  // left & right wall faces (skip drawn body for trees — drawn as canopy below)
  if (tile.type !== "tree") {
    // left face
    ctx.beginPath();
    ctx.moveTo(base.left.x, base.left.y);
    ctx.lineTo(base.bottom.x, base.bottom.y);
    ctx.lineTo(base.bottom.x, base.bottom.y - bodyH);
    ctx.lineTo(base.left.x, base.left.y - bodyH);
    ctx.closePath();
    ctx.fillStyle = shade(wall, 0.72);
    ctx.fill();
    // right face
    ctx.beginPath();
    ctx.moveTo(base.right.x, base.right.y);
    ctx.lineTo(base.bottom.x, base.bottom.y);
    ctx.lineTo(base.bottom.x, base.bottom.y - bodyH);
    ctx.lineTo(base.right.x, base.right.y - bodyH);
    ctx.closePath();
    ctx.fillStyle = shade(wall, 0.88);
    ctx.fill();
    // roof / top diamond
    diamond(ctx, base.top.x, base.top.y - bodyH, w, h);
    ctx.fillStyle = tile.type === "house" ? "#d2553f" : shade(wall, 1.05);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // emoji marker floating just above the roof for instant recognizability
  const topCy = base.top.y - bodyH + h / 2;
  const fs = Math.max(12, (isDecor ? 30 : 26) * cam.scale);
  ctx.font = `${fs}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.icon, x, topCy - (tile.type === "tree" ? fs * 0.1 : fs * 0.15));
}

function strokeDiamond(ctx, gx, gy, cam, color, lw = 2) {
  const { x, y } = gridToScreen(gx, gy, cam);
  diamond(ctx, x, y, tileW(cam), tileH(cam));
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function fillDiamond(ctx, gx, gy, cam, color) {
  const { x, y } = gridToScreen(gx, gy, cam);
  diamond(ctx, x, y, tileW(cam), tileH(cam));
  ctx.fillStyle = color;
  ctx.fill();
}

// view = { hover:{gx,gy}|null, ghost:{type}|null, placeable:bool, mode:'build'|'play' }
export function render(ctx, canvas, cam, view, now) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

  // build a draw list of all cells, sorted back-to-front
  const cells = [];
  for (let gx = 0; gx < GRID; gx++) {
    for (let gy = 0; gy < GRID; gy++) cells.push([gx, gy]);
  }
  cells.sort((a, b) => depth(a[0], a[1]) - depth(b[0], b[1]) || a[0] - b[0]);

  // 1) ground
  for (const [gx, gy] of cells) {
    const tile = state.tiles[key(gx, gy)];
    if (tile && tile.type === "field") drawFieldSoil(ctx, gx, gy, cam);
    else drawGroundTile(ctx, gx, gy, cam);
  }

  // 2) hover / ghost highlight (under content so content stays crisp)
  if (view.hover) {
    const { gx, gy } = view.hover;
    if (view.mode === "build" && view.ghost) {
      fillDiamond(ctx, gx, gy, cam, view.placeable ? "rgba(120,255,120,0.30)" : "rgba(255,90,90,0.32)");
      strokeDiamond(ctx, gx, gy, cam, view.placeable ? "#8effa0" : "#ff7a7a", 2);
    } else {
      fillDiamond(ctx, gx, gy, cam, "rgba(255,255,255,0.16)");
      strokeDiamond(ctx, gx, gy, cam, "rgba(255,255,255,0.7)", 2);
    }
  }

  // 3) content: crops + buildings, in depth order
  for (const [gx, gy] of cells) {
    const tile = state.tiles[key(gx, gy)];
    if (!tile) continue;
    if (tile.type === "field") {
      if (tile.crop) drawCrop(ctx, gx, gy, tile, cam, now);
    } else {
      drawBuilding(ctx, gx, gy, tile, cam);
    }
  }

  // 4) build-mode ghost icon on the hovered tile
  if (view.mode === "build" && view.ghost && view.hover) {
    const { x, y } = gridToScreen(view.hover.gx, view.hover.gy, cam);
    ctx.globalAlpha = 0.9;
    ctx.font = `${Math.max(12, 26 * cam.scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(view.ghost.icon || "▢", x, y + tileH(cam) / 2 - wallH(cam) * 0.4);
    ctx.globalAlpha = 1;
  }
}

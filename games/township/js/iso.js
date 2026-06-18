// iso.js — isometric coordinate math + a simple pan/zoom camera.
// Tiles are 2:1 diamonds. The camera maps grid (gx,gy) to screen pixels.
//
// gridToScreen returns the TOP vertex of tile (gx,gy)'s diamond. The diamond's
// four vertices are: top (x,y), right (x+w/2, y+h/2), bottom (x, y+h),
// left (x-w/2, y+h/2), where w,h are the scaled tile size.

export const TILE_W = 96; // unscaled diamond width
export const TILE_H = 48; // unscaled diamond height (2:1)
export const WALL_H = 44; // unscaled building wall height

export function tileW(cam) { return TILE_W * cam.scale; }
export function tileH(cam) { return TILE_H * cam.scale; }
export function wallH(cam) { return WALL_H * cam.scale; }

// Grid cell -> screen pixel (top vertex of the diamond).
export function gridToScreen(gx, gy, cam) {
  const w = tileW(cam), h = tileH(cam);
  return {
    x: cam.x + (gx - gy) * (w / 2),
    y: cam.y + (gx + gy) * (h / 2),
  };
}

// Screen pixel -> grid cell (floored to the containing tile).
export function screenToGrid(px, py, cam) {
  const w = tileW(cam), h = tileH(cam);
  const a = (px - cam.x) / (w / 2); // = gx - gy
  const b = (py - cam.y) / (h / 2); // = gx + gy
  return {
    gx: Math.floor((a + b) / 2),
    gy: Math.floor((b - a) / 2),
  };
}

// The four screen-space corners of a tile diamond (for drawing/hit overlays).
export function tileCorners(gx, gy, cam) {
  const { x, y } = gridToScreen(gx, gy, cam);
  const w = tileW(cam), h = tileH(cam);
  return [
    { x, y },                       // top
    { x: x + w / 2, y: y + h / 2 }, // right
    { x, y: y + h },                // bottom
    { x: x - w / 2, y: y + h / 2 }, // left
  ];
}

// Depth key for back-to-front painter's-algorithm sorting.
export function depth(gx, gy) { return gx + gy; }

export function makeCamera() {
  return { x: 0, y: 0, scale: 1 };
}

// Center the camera so the GRID×GRID board sits in the middle of the viewport.
export function centerCamera(cam, grid, vw, vh) {
  const mid = (grid - 1) / 2;
  const c = gridToScreen(mid, mid, { x: 0, y: 0, scale: cam.scale });
  cam.x = vw / 2 - c.x;
  cam.y = vh / 2 - c.y - tileH(cam); // nudge up so buildings have headroom
}

// Zoom toward a screen anchor (keeps the world point under the cursor fixed).
export function zoomAt(cam, factor, anchorX, anchorY, min = 0.55, max = 2.2) {
  const next = Math.max(min, Math.min(max, cam.scale * factor));
  const k = next / cam.scale;
  cam.x = anchorX - (anchorX - cam.x) * k;
  cam.y = anchorY - (anchorY - cam.y) * k;
  cam.scale = next;
}

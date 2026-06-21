// sort.js — 3D periodic-table sort. A shuffled cloud of element cards floats in front of an
// empty table grid; the player taps a card (it lifts "into hand"), then taps the slot where
// it belongs. Correct → it snaps in and locks; wrong → the slot flashes. Solved when full.
//
// Interaction is tap-based (down+up with little movement) so it never fights the orbit drag.
import * as THREE from "three";
import { gridExtent, categoryColor } from "../../../../shared/elements/elements.js";

const CARD_W = 0.95, CARD_H = 1.4;     // 0.678 aspect — matches the card art
const CELL_W = 1.18, CELL_H = 1.72;    // grid spacing (a touch larger than a card)
const TAP_MOVE = 8, TAP_MS = 400;       // tap vs drag thresholds

export class SortMode {
  constructor(stage, elements, opts = {}) {
    this.stage = stage;
    this.elements = elements;
    this.opts = opts;
    this.cards = [];          // unplaced + placed card meshes
    this.slots = [];          // { element, filled, group, plane, border, label }
    this.held = null;         // currently picked card mesh
    this.placed = 0;
    this.mistakes = 0;
    this.seconds = 0;
    this.solved = false;
    this._t = 0;
    this._flash = [];         // active red-flash slot borders
    this._loader = new THREE.TextureLoader();
    this.scatter = opts.scatter || "air";   // "air" = floating 3D cloud · "around" = scattered in the table plane
  }

  // ---- build ----
  build() {
    const ext = gridExtent(this.elements);
    const rawX = (c) => (c - 1) * CELL_W;
    const rawY = (r) => -(r - 1) * CELL_H;
    this._cx = (rawX(ext.minC) + rawX(ext.maxC)) / 2;
    const rowsTop = rawY(ext.minR), rowsBot = rawY(ext.maxR);
    this._cy = (rowsTop + rowsBot) / 2;
    this._slotPos = (c, r) => new THREE.Vector3(rawX(c) - this._cx, rawY(r) - this._cy, 0);
    this._halfW = (ext.maxC - ext.minC + 1) * CELL_W / 2;
    this._halfH = ((rowsTop - rowsBot) + CELL_H) / 2;

    this._buildSlots();
    this._buildCards();

    if (this.scatter === "air") {
      this.stage.frame(new THREE.Vector3(0, 0, 0), this._halfW * 2 + 2, this._halfH * 2 + 2, 1.15);
    } else {
      // "linear": a card tray above the table — frame both zones together
      const f = this._linearFrame;
      this.stage.frame(new THREE.Vector3(0, f.cy, 0), f.w + 2, f.h + 2, 1.1);
    }

    this._bindPointer();
    this.opts.onTick?.(this._state());
    this.opts.onHint?.("Tap a card, then tap its slot. Drag to orbit · right-drag to pan · scroll/pinch to zoom.");
  }

  _buildSlots() {
    const group = new THREE.Group();
    const plane = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const edges = new THREE.EdgesGeometry(plane);
    for (const el of this.elements) {
      const col = categoryColor(el.category);
      const fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.1, depthWrite: false,
      }));
      const border = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: col, transparent: true, opacity: 0.55,
      }));
      const label = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
        map: this._labelTexture(el), transparent: true, opacity: 0.85, depthWrite: false,
      }));
      const pos = this._slotPos(el.col, el.row);
      fill.position.copy(pos);
      border.position.copy(pos);
      label.position.copy(pos).z += 0.01;
      const slot = { element: el, filled: false, fill, border, label };
      fill.userData.slot = slot;
      group.add(fill, border, label);
      this.slots.push(slot);
    }
    this.slotGroup = group;
    this.stage.scene.add(group);
  }

  _buildCards() {
    // shuffle, then scatter: a floating 3D cloud ("air"), or laid out AROUND the table
    // coplanar (z=0) and non-overlapping as concentric circles ("circle") or rectangular
    // frames / straight lines ("linear").
    const shuffled = shuffle(this.elements.slice());
    const ring = this.scatter === "linear" ? this._gridPositions(shuffled.length) : null;
    const geom = new THREE.PlaneGeometry(CARD_W, CARD_H);
    // Soft yellow glow behind each LOOSE card → distinguishes still-to-place cards from the
    // ones already locked into the table. Shared geometry + material across all cards; the
    // halo extends past the card edges, the card's opaque face hides the centre.
    const glowGeom = new THREE.PlaneGeometry(CARD_W * 1.42, CARD_H * 1.32);
    this._glowMat = new THREE.MeshBasicMaterial({
      map: this._glowTexture(), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
    });
    const group = new THREE.Group();
    for (let i = 0; i < shuffled.length; i++) {
      const el = shuffled[i];
      const tex = this._loader.load(el.img, (t) => { t.colorSpace = THREE.SRGBColorSpace; });
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      const glow = new THREE.Mesh(glowGeom, this._glowMat);
      glow.position.z = -0.02;          // sit just behind the card face
      mesh.add(glow);
      const home = ring ? ring[i] : this._scatterAir();
      mesh.position.copy(home);
      // "around": near-flat, coplanar, only a whisper of tilt (kept small so spacing holds)
      if (ring) mesh.rotation.set(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.12, 0.12));
      else mesh.rotation.set(rand(-0.4, 0.4), rand(-0.5, 0.5), rand(-0.25, 0.25));
      mesh.userData = {
        element: el, placed: false, anim: null, glow,
        home: home.clone(), homeQuat: mesh.quaternion.clone(),
        phase: rand(0, Math.PI * 2),
      };
      group.add(mesh);
      this.cards.push(mesh);
    }
    this.cardGroup = group;
    this.stage.scene.add(group);
  }

  // soft-edged yellow rounded-rect → a glow halo. Sized to the card footprint inside the
  // larger glow plane; heavy blur feathers it so only the halo shows around the card.
  _glowTexture() {
    const c = document.createElement("canvas");
    c.width = 192; c.height = 256;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    const mx = c.width * 0.16, my = c.height * 0.14;
    x.shadowColor = "rgba(255,214,64,0.95)";
    x.shadowBlur = 34;
    x.fillStyle = "rgba(255,214,64,0.85)";
    roundRectPath(x, mx, my, c.width - 2 * mx, c.height - 2 * my, 16);
    x.fill();
    x.fill();   // second pass → denser, softer glow
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // floating 3D cloud in front of the board (z > 0; camera starts at +z)
  _scatterAir() {
    return new THREE.Vector3(
      rand(-(this._halfW + 1.5), this._halfW + 1.5),
      rand(-(this._halfH + 0.5), this._halfH + 0.5),
      rand(3, 9),
    );
  }
  // "linear": cards in a wide, short grid (rows & columns) sitting ABOVE the periodic table
  // on the SAME flat surface — a "tray" the player draws from. NOT overlaying the table:
  //     [  cards tray  ]
  //     [    table     ]
  // The shuffled deck fills the tray (random order); spacing >= card size so nothing overlaps.
  _gridPositions(n) {
    const boardW = this._halfW * 2;
    const sx = CARD_W + 0.35, sy = CARD_H + 0.35;          // spacing >= card size -> no overlap
    const tableCols = Math.max(1, Math.round(boardW / sx));
    const cols = Math.min(n, Math.max(tableCols, Math.ceil(n / 5)));  // wide & short (<= 5 rows)
    const rows = Math.ceil(n / cols);
    const GAP = 1.2;
    const bottomRowCY = this._halfH + GAP + CARD_H / 2;    // lowest tray row sits above table top
    const positions = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, n - r * cols);
      const c = i % cols;
      const x = -((inRow - 1) * sx) / 2 + c * sx;          // centre each row
      const y = bottomRowCY + (rows - 1 - r) * sy;         // r=0 top row … last row nearest table
      positions.push(new THREE.Vector3(x, y, 0.05));       // same surface as the table
    }
    const trayTop = bottomRowCY + (rows - 1) * sy + CARD_H / 2;
    const tableBottom = -this._halfH;
    this._linearFrame = {                                  // frame both zones together
      cy: (trayTop + tableBottom) / 2,
      w: Math.max(boardW, (cols - 1) * sx + CARD_W),
      h: trayTop - tableBottom,
    };
    return positions;
  }

  // small canvas texture: atomic number + symbol, drawn faintly into the empty slot
  _labelTexture(el) {
    const c = document.createElement("canvas");
    c.width = 192; c.height = 283;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = "rgba(234,242,255,0.85)";
    x.font = "800 40px system-ui, sans-serif";
    x.textBaseline = "top";
    x.fillText(String(el.z), 14, 12);
    x.fillStyle = "rgba(234,242,255,0.22)";
    x.font = "900 96px system-ui, sans-serif";
    x.textAlign = "center";
    x.fillText(el.symbol, c.width / 2, c.height / 2 - 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- input ----
  _bindPointer() {
    const el = this.stage.canvas;
    this._onDown = (e) => { if (e.button !== 0) return; this._dn = { x: e.clientX, y: e.clientY, t: performance.now() }; }; // left only; right-drag pans
    this._onUp = (e) => {
      if (!this._dn) return;
      const moved = Math.hypot(e.clientX - this._dn.x, e.clientY - this._dn.y);
      const dt = performance.now() - this._dn.t;
      this._dn = null;
      if (moved > TAP_MOVE || dt > TAP_MS) return; // it was an orbit drag
      this._tap(e.clientX, e.clientY);
    };
    el.addEventListener("pointerdown", this._onDown);
    el.addEventListener("pointerup", this._onUp);
  }

  _tap(x, y) {
    if (this.solved) return;
    if (this.held) {
      const slotHit = this.stage.pick(x, y, this.slots.filter((s) => !s.filled).map((s) => s.fill));
      if (slotHit) return this._place(this.held, slotHit.object.userData.slot);
    }
    const cardHit = this.stage.pick(x, y, this.cards.filter((m) => !m.userData.placed));
    if (cardHit) { this._select(cardHit.object); return; }
    if (!this.held) return;
    this._deselect();
  }

  _select(mesh) {
    if (this.held === mesh) return;
    if (this.held) this._returnHome(this.held);
    this.held = mesh;
    mesh.userData.anim = null;
    const el = mesh.userData.element;
    this.opts.onHint?.(`Holding ${el.symbol} (${el.name}, Z=${el.z}) — tap its slot.`);
    this.opts.onHeld?.(el);
  }
  _deselect() {
    if (!this.held) return;
    this._returnHome(this.held);
    this.held = null;
    this.opts.onHeld?.(null);
  }
  _returnHome(mesh) {
    mesh.userData.anim = { toPos: mesh.userData.home.clone(), toQuat: mesh.userData.homeQuat.clone(), t: 0, dur: 0.3 };
  }

  _place(mesh, slot) {
    const card = mesh.userData.element;
    if (slot.element.z === card.z) {
      const pos = this._slotPos(slot.element.col, slot.element.row).setZ(0.05);
      mesh.userData.anim = { toPos: pos, toQuat: new THREE.Quaternion(), t: 0, dur: 0.28, lock: true };
      mesh.userData.placed = true;
      slot.filled = true;
      slot.label.visible = false;
      slot.fill.material.opacity = 0.0;
      mesh.userData.glow.visible = false;   // it's locked in now — drop the "loose" glow
      this.held = null;
      this.opts.onHeld?.(null);
      this.placed++;
      this.opts.onHint?.(`✓ ${card.symbol} placed (${this.placed}/${this.elements.length}).`);
      this.opts.onTick?.(this._state());
      if (this.placed === this.elements.length) this._win();
    } else {
      this.mistakes++;
      this._flashSlot(slot);
      this.opts.onHint?.(`✗ Not here — that's where Z=${slot.element.z} (${slot.element.symbol}) goes. Try again.`);
      this.opts.onTick?.(this._state());
    }
  }

  _flashSlot(slot) {
    slot.border.material.color.set("#ff5b6e");
    slot.border.material.opacity = 1;
    this._flash.push({ slot, t: 0, base: categoryColor(slot.element.category) });
  }

  _win() {
    this.solved = true;
    this._deselect();
    this.opts.onWin?.({ seconds: Math.round(this.seconds), mistakes: this.mistakes, total: this.elements.length });
  }

  _state() {
    return { placed: this.placed, total: this.elements.length, mistakes: this.mistakes, seconds: this.seconds };
  }

  // ---- per-frame ----
  update(dt) {
    if (!this.solved) this.seconds += dt;
    this._t += dt;
    if (this._glowMat) this._glowMat.opacity = 0.4 + 0.18 * Math.sin(this._t * 2.2); // soft pulse

    for (const mesh of this.cards) {
      const u = mesh.userData;
      // selection cue: gently scale the held card up. It STAYS in the cloud — the zoomed
      // view lives in the 2D left panel (onHeld), so the 3D table is never occluded.
      const scaleTarget = mesh === this.held ? 1.3 : 1;
      mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, scaleTarget, 0.2));

      if (u.anim) {
        u.anim.t += dt;
        const k = Math.min(1, u.anim.t / u.anim.dur);
        const e = k * k * (3 - 2 * k);
        mesh.position.lerp(u.anim.toPos, e);
        mesh.quaternion.slerp(u.anim.toQuat, e);
        if (k >= 1) { mesh.position.copy(u.anim.toPos); mesh.quaternion.copy(u.anim.toQuat); u.anim = null; }
        continue;
      }
      if (!u.placed && this.scatter === "air") { // gentle idle bob — air cloud only; the
        mesh.position.y = u.home.y + Math.sin(this._t * 0.7 + u.phase) * 0.12; // around layouts stay put
      }
    }

    // fade red flashes back to category colour
    for (let i = this._flash.length - 1; i >= 0; i--) {
      const f = this._flash[i];
      f.t += dt;
      if (f.t >= 0.6) {
        f.slot.border.material.color.set(f.base);
        f.slot.border.material.opacity = 0.55;
        this._flash.splice(i, 1);
      }
    }
  }

  dispose() {
    const el = this.stage.canvas;
    el.removeEventListener("pointerdown", this._onDown);
    el.removeEventListener("pointerup", this._onUp);
    this.stage.clearScene(true);
    this.cards = []; this.slots = []; this.held = null;
  }
}

function rand(a, b) { return a + Math.random() * (b - a); }
// Trace a rounded-rectangle path (used for the soft glow texture).
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

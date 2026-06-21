// scene.js — Three.js stage shared by the 3D modes: renderer, camera, lights, a render
// loop, raycasting helpers, and a self-contained orbit/zoom/pan controller (Three's core
// build ships no OrbitControls, so we implement the small bit we need).
import * as THREE from "three";

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // lets the leaderboard grab a proof screenshot of the canvas
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 0.5);
    key.position.set(3, 6, 8);
    this.scene.add(key);

    this.controls = new OrbitLite(this.camera, canvas);
    this.raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this._running = false;
    this._last = 0;
    this._update = null;
    this._onFrame = this._onFrame.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._onResize();
  }

  /** start(updateCb) — updateCb(dt) runs every frame before render. */
  start(updateCb) {
    this._update = updateCb || null;
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    requestAnimationFrame(this._onFrame);
  }
  stop() { this._running = false; }

  _onFrame(now) {
    if (!this._running) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.controls.update();
    if (this._update) this._update(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._onFrame);
  }

  _onResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Raycast from a client (px) point against `objects`; returns the first hit or null. */
  pick(clientX, clientY, objects) {
    const r = this.canvas.getBoundingClientRect();
    this._pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this._pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this.raycaster.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  }

  /** Frame the camera so a [w x h] board centred on `center` fits the viewport. */
  frame(center, w, h, pad = 1.25) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const distV = (h / 2) / Math.tan(vfov / 2);
    const distH = (w / 2) / Math.tan(vfov / 2) / this.camera.aspect;
    const dist = Math.max(distV, distH) * pad;
    this.controls.target.copy(center);
    this.controls.setFromTargetDistance(dist);
  }

  clearScene(keepLights = true) {
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const o = this.scene.children[i];
      if (keepLights && o.isLight) continue;
      this.scene.remove(o);
      disposeDeep(o);
    }
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this._onResize);
    this.controls.dispose();
    this.clearScene(false);
    this.renderer.dispose();
  }
}

/** Minimal orbit + dolly (wheel/pinch) controller around a target point. */
class OrbitLite {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.radius = 16;
    this.theta = 0;          // azimuth
    this.phi = Math.PI / 2;  // polar (from +Y)
    this.minRadius = 3;
    this.maxRadius = 120;
    this.rotateSpeed = 0.0055;
    this.enabled = true;

    this._down = false;
    this._panning = false;   // right-drag pans instead of orbiting
    this._lastX = 0; this._lastY = 0;
    this._pointers = new Map();
    this._pinchDist = 0;
    this._dirty = true;
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();

    this._bind();
  }

  setFromTargetDistance(d) {
    this.radius = THREE.MathUtils.clamp(d, this.minRadius, this.maxRadius);
    this.maxRadius = Math.max(this.maxRadius, d * 2.5);
    this._dirty = true;
  }

  _bind() {
    const el = this.dom;
    this._onDown = (e) => {
      if (!this.enabled) return;
      el.setPointerCapture?.(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._down = true; this._lastX = e.clientX; this._lastY = e.clientY;
      this._panning = e.button === 2;   // right button → pan; left → orbit
      if (this._pointers.size === 2) this._pinchDist = this._twoDist();
    };
    this._onContext = (e) => e.preventDefault();   // allow right-drag without the context menu
    this._onMove = (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size >= 2) { // pinch-zoom
        const d = this._twoDist();
        if (this._pinchDist > 0) {
          this.radius = THREE.MathUtils.clamp(this.radius * (this._pinchDist / d), this.minRadius, this.maxRadius);
          this._dirty = true;
        }
        this._pinchDist = d;
        return;
      }
      if (!this._down) return;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      if (this._panning) { this._pan(dx, dy); return; }
      this.theta -= dx * this.rotateSpeed;
      this.phi = THREE.MathUtils.clamp(this.phi - dy * this.rotateSpeed, 0.15, Math.PI - 0.15);
      this._dirty = true;
    };
    this._onUp = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      if (this._pointers.size === 0) { this._down = false; this._panning = false; }
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0012);
      this.radius = THREE.MathUtils.clamp(this.radius * f, this.minRadius, this.maxRadius);
      this._dirty = true;
    };
    el.addEventListener("pointerdown", this._onDown);
    el.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    el.addEventListener("wheel", this._onWheel, { passive: false });
    el.addEventListener("contextmenu", this._onContext);
  }

  // Right-drag pan: slide the orbit target across the camera's right/up plane so panning
  // tracks the cursor (world-units-per-pixel scales with distance + fov).
  _pan(dx, dy) {
    this.camera.updateMatrixWorld();
    const h = this.dom.clientHeight || 1;
    const wpp = (2 * this.radius * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / h;
    this._right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(this._right, -dx * wpp);
    this.target.addScaledVector(this._up, dy * wpp);
    this._dirty = true;
  }

  _twoDist() {
    const p = [...this._pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  update() {
    if (!this._dirty) return;
    const sinPhi = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
    this._dirty = false;
  }

  dispose() {
    const el = this.dom;
    el.removeEventListener("pointerdown", this._onDown);
    el.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerup", this._onUp);
    el.removeEventListener("wheel", this._onWheel);
    el.removeEventListener("contextmenu", this._onContext);
  }
}

export function disposeDeep(obj) {
  obj.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  });
}

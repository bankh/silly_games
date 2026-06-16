// crowd.js — the army: instanced soldiers that flock around a moving lead point.
import * as THREE from "three";

const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // golden angle for even disc packing
const YAXIS = new THREE.Vector3(0, 1, 0);     // shared up-axis (avoids per-frame alloc)
export const MAX_VISIBLE = 700;               // rendered cap (true count can far exceed)

export class Crowd {
  constructor(scene) {
    this.count = 1;        // true army size (integer during run)
    this.active = 0;       // currently rendered instances
    this.scene = scene;

    // soldier model = capsule body + sphere head (two instanced meshes, shared matrices)
    const body = new THREE.CapsuleGeometry(0.32, 0.7, 4, 10);
    body.translate(0, 0.67, 0);
    const head = new THREE.SphereGeometry(0.23, 10, 8);
    head.translate(0, 1.52, 0);

    this.bodyMesh = new THREE.InstancedMesh(
      body, new THREE.MeshLambertMaterial({ vertexColors: false }), MAX_VISIBLE
    );
    this.headMesh = new THREE.InstancedMesh(
      head, new THREE.MeshLambertMaterial({ color: 0xf2c79a }), MAX_VISIBLE
    );
    this.bodyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_VISIBLE * 3), 3);
    this.bodyMesh.frustumCulled = false;
    this.headMesh.frustumCulled = false;

    // per-instance blue tints + bob phase
    const tint = new THREE.Color();
    this.phase = new Float32Array(MAX_VISIBLE);
    for (let i = 0; i < MAX_VISIBLE; i++) {
      const h = 0.6 + (Math.random() - 0.5) * 0.05;     // blue-ish hue
      const l = 0.42 + Math.random() * 0.16;
      tint.setHSL(h, 0.62, l);
      this.bodyMesh.setColorAt(i, tint);
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    this.bodyMesh.instanceColor.needsUpdate = true;

    scene.add(this.bodyMesh, this.headMesh);

    // soldier positions + scratch math
    this.pos = Array.from({ length: MAX_VISIBLE }, () => new THREE.Vector3());
    this._target = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._z = new THREE.Vector3(0, 0, 1);

    this.leadPos = new THREE.Vector3();
  }

  reset(count, leadPos) {
    this.count = count;
    this.active = 0;
    this.leadPos.copy(leadPos);
  }

  // returns visible (rendered) count
  get visible() { return Math.min(Math.max(0, Math.floor(this.count)), MAX_VISIBLE); }

  update(dt, leadPos, tangent, right, time) {
    this.leadPos.copy(leadPos);
    const want = this.visible;

    // newly activated soldiers spawn from the lead point, then fan out
    if (want > this.active) {
      for (let i = this.active; i < want; i++) this.pos[i].copy(leadPos);
    }
    this.active = want;

    // forward axis flattened a touch so the disc hugs the road surface
    this._fwd.copy(tangent);
    const fyaw = Math.atan2(this._fwd.x, this._fwd.z);
    this._q.setFromAxisAngle(YAXIS, fyaw);

    // dynamic packing: keep the blob roughly within the road, denser when crowded
    const n = Math.max(1, want);
    const maxR = THREE.MathUtils.clamp(0.95 * Math.sqrt(n), 1.0, 11.5);
    const spacing = maxR / Math.sqrt(n);
    const backBias = maxR * 0.45;          // crowd trails behind the lead point
    const damp = 1 - Math.exp(-9 * dt);

    for (let i = 0; i < want; i++) {
      const r = spacing * Math.sqrt(i + 0.5);
      const a = i * GOLDEN;
      const ox = Math.cos(a) * r;
      const oz = Math.sin(a) * r - backBias;

      this._target.copy(leadPos)
        .addScaledVector(right, ox)
        .addScaledVector(tangent, oz);
      this._target.y = leadPos.y;

      const p = this.pos[i];
      p.lerp(this._target, damp);

      const bob = Math.sin(time * 11 + this.phase[i]) * 0.07;
      this._m.compose(
        this._target3(p.x, p.y + bob + 0.02 * Math.abs(Math.sin(time * 11 + this.phase[i])), p.z),
        this._q, this._s
      );
      this.bodyMesh.setMatrixAt(i, this._m);
      this.headMesh.setMatrixAt(i, this._m);
    }

    this.bodyMesh.count = want;
    this.headMesh.count = want;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
  }

  _target3(x, y, z) { this.__v = this.__v || new THREE.Vector3(); return this.__v.set(x, y, z); }

  dispose() {
    this.scene.remove(this.bodyMesh, this.headMesh);
    this.bodyMesh.geometry.dispose();
    this.headMesh.geometry.dispose();
    this.bodyMesh.material.dispose();
    this.headMesh.material.dispose();
  }
}

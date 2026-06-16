// level.js — procedural gates, fire hazards, and pickups placed along the road.
import * as THREE from "three";
import { disposeGroup } from "./dispose.js";

const UPV = new THREE.Vector3(0, 1, 0);
const ZAXIS = new THREE.Vector3(0, 0, 1);

export class Level {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.gates = [];
    this.hazards = [];
    this.pickups = [];
    this.bossU = 0.955;

    this._c = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._r = new THREE.Vector3();
  }

  clear() {
    disposeGroup(this.group); // frees geometries, materials, and label CanvasTextures
    this.gates = []; this.hazards = []; this.pickups = [];
  }

  build(level = 1) {
    this.clear();
    const hw = this.world.halfWidth;

    // ---------- gates ----------
    const nGates = 6 + level;
    const startU = 0.09, endU = 0.88;
    for (let i = 0; i < nGates; i++) {
      const u = startU + (endU - startU) * (i / (nGates - 1));
      const goodOnRight = Math.random() < 0.5;
      // first two gates are always "grow" gates (both lanes positive) so a
      // single starting soldier can never be wiped out before building a crowd
      const bothPositive = i < 2;
      const pair = this._makeGatePair(level, goodOnRight, bothPositive);
      this._placeGate(u, pair, hw);
      this.gates.push({ u, ...pair, consumed: false });
    }

    // ---------- hazards (fire) — only after the crowd has had time to grow ----------
    const nHaz = 2 + Math.floor(level * 0.8);
    for (let i = 0; i < nHaz; i++) {
      const u0 = 0.26 + Math.random() * 0.54;
      const len = 0.018 + Math.random() * 0.01;
      const side = Math.random() < 0.5 ? -1 : 1;
      this._placeHazard(u0, u0 + len, side, hw);
    }

    // ---------- pickups ----------
    const nPick = 4 + level;
    for (let i = 0; i < nPick; i++) {
      const u = 0.12 + Math.random() * 0.74;
      const lane = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.6);
      const value = Math.random() < 0.3 ? 5 : 1;
      this._placePickup(u, lane * hw, value, hw);
    }
  }

  _makeGatePair(level, goodOnRight, bothPositive = false) {
    // good option: add or multiply; the other: a trap or a weaker decoy
    const mulChance = 0.32 + level * 0.02;
    let good;
    if (Math.random() < mulChance) {
      good = { op: "mul", val: Math.random() < 0.7 ? 2 : 3 };
    } else {
      good = { op: "add", val: [5, 8, 10, 15, 20][Math.floor(Math.random() * 5)] + level };
    }
    let other;
    if (bothPositive || Math.random() >= 0.62) {
      other = { op: "add", val: 1 + Math.floor(Math.random() * 4) }; // weaker positive decoy
    } else {
      other = Math.random() < 0.5
        ? { op: "sub", val: 8 + Math.floor(Math.random() * 18) }
        : { op: "div", val: 2 };
    }
    return goodOnRight ? { left: other, right: good } : { left: good, right: other };
  }

  _gateColor(op) { return (op === "add" || op === "mul") ? 0x2fd06b : 0xff3b3b; }
  _gateLabel(g) {
    return ({ add: "+", mul: "×", sub: "-", div: "÷" }[g.op]) + g.val;
  }

  _placeGate(u, pair, hw) {
    this.world.frameAt(u, this._c, this._t, this._r);
    const laneOff = hw / 2;
    const panelW = hw * 0.92;

    const buildSide = (sign, gate) => {
      const grp = new THREE.Group();
      const center = this._c.clone().addScaledVector(this._r, sign * laneOff);
      const color = this._gateColor(gate.op);

      // translucent panel facing the crowd
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(panelW, 3.2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })
      );
      panel.position.copy(center).addScaledVector(UPV, 1.7);
      panel.quaternion.setFromUnitVectors(ZAXIS, this._t);
      grp.add(panel);

      // posts
      const postGeo = new THREE.CylinderGeometry(0.16, 0.16, 3.6, 8);
      const postMat = new THREE.MeshLambertMaterial({ color });
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.copy(center).addScaledVector(this._r, s * panelW / 2).addScaledVector(UPV, 1.8);
        grp.add(post);
      }

      // label
      const label = makeTextSprite(this._gateLabel(gate), color);
      label.position.copy(center).addScaledVector(UPV, 3.9);
      grp.add(label);

      this.group.add(grp);
      gate.group = grp;
    };

    buildSide(-1, pair.left);   // left lane (lateral < 0)
    buildSide(+1, pair.right);  // right lane (lateral >= 0)
  }

  _placeHazard(u0, u1, side, hw) {
    this.world.frameAt((u0 + u1) / 2, this._c, this._t, this._r);
    const grp = new THREE.Group();
    const laneOff = side * hw / 2;
    const center = this._c.clone().addScaledVector(this._r, laneOff);

    // charred ground patch
    const patch = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 0.95, 7),
      new THREE.MeshBasicMaterial({ color: 0x2a1208, transparent: true, opacity: 0.85 })
    );
    patch.position.copy(center).addScaledVector(UPV, 0.05);
    const flat = new THREE.Quaternion().setFromUnitVectors(ZAXIS, this._t);
    const lay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    patch.quaternion.copy(flat).multiply(lay);
    grp.add(patch);

    // flames
    const flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a18 });
    for (let i = 0; i < 12; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 6), flameMat.clone());
      cone.position.copy(center)
        .addScaledVector(this._r, (Math.random() - 0.5) * hw * 0.8)
        .addScaledVector(this._t, (Math.random() - 0.5) * 6)
        .addScaledVector(UPV, 0.8);
      cone.userData.phase = Math.random() * Math.PI * 2;
      cone.userData.baseY = cone.position.y;
      grp.add(cone);
      flames.push(cone);
    }
    this.group.add(grp);
    this.hazards.push({ u0, u1, side, group: grp, flames });
  }

  _placePickup(u, lateral, value, hw) {
    this.world.frameAt(u, this._c, this._t, this._r);
    const center = this._c.clone().addScaledVector(this._r, THREE.MathUtils.clamp(lateral, -hw + 1, hw - 1));
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.6, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x32e0ff, emissive: 0x0a4a55 })
    );
    mesh.position.copy(center).addScaledVector(UPV, 0.9);
    grp.add(mesh);
    if (value > 1) {
      const label = makeTextSprite("+" + value, 0x32e0ff, 0.7);
      label.position.copy(center).addScaledVector(UPV, 2.2);
      grp.add(label);
    }
    this.group.add(grp);
    this.pickups.push({ u, lateral, value, group: grp, mesh, consumed: false });
  }

  // consumption visuals
  consumeGateSide(gate, sign) {
    const grp = gate.group;
    if (grp) grp.userData.fade = true;
  }
  consumePickup(p) {
    p.consumed = true;
    p.group.userData.fade = true;
  }

  update(time, dt) {
    // animate flames
    for (const h of this.hazards) {
      for (const f of h.flames) {
        const s = 0.7 + Math.abs(Math.sin(time * 9 + f.userData.phase)) * 0.8;
        f.scale.y = s;
        f.position.y = f.userData.baseY + (s - 1) * 0.5;
      }
    }
    // spin pickups
    for (const p of this.pickups) if (!p.consumed) p.mesh.rotation.y += dt * 3;

    // fade consumed groups
    for (const set of [this.gates, this.pickups]) {
      for (const item of set) {
        const grp = item.group;
        if (grp && grp.userData.fade) {
          grp.scale.multiplyScalar(1 - Math.min(1, dt * 6));
          if (grp.scale.x < 0.02) { grp.visible = false; grp.userData.fade = false; }
        }
      }
    }
  }
}

// ---- text billboard helper ----
export function makeTextSprite(text, colorHex, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const col = "#" + new THREE.Color(colorHex).getHexString();

  ctx.fillStyle = "rgba(8,20,38,0.92)";
  roundRect(ctx, 8, 24, 240, 80, 18);
  ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = col;
  roundRect(ctx, 8, 24, 240, 80, 18);
  ctx.stroke();

  ctx.font = "bold 64px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(4 * scale, 2 * scale, 1);
  return spr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

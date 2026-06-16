// boss.js — the Titan of Vantal: low-poly kaiju on a pillar at the summit.
import * as THREE from "three";
import { disposeGroup } from "./dispose.js";

export class Boss {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.u = 0.97;
    this.entryU = 0.945;          // crowd stops & charges from here
    this.maxHP = 100;
    this.hp = 100;
    this.position = new THREE.Vector3();
    this.titan = null;
    this._c = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this.shake = 0;
  }

  build(level = 1) {
    disposeGroup(this.group); // free previous pillar/titan geometries + materials
    this.maxHP = 70 + level * 70;
    this.hp = this.maxHP;

    this.world.frameAt(this.u, this._c, this._t, this._r);
    this.position.copy(this._c);

    // facing: look back down the road toward the incoming crowd
    const faceYaw = Math.atan2(-this._t.x, -this._t.z);

    // pillar / dais
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.6, 6, 24),
      new THREE.MeshLambertMaterial({ color: 0xf2f3f7 })
    );
    pillar.position.copy(this.position).add(new THREE.Vector3(0, 3, 0));
    this.group.add(pillar);

    // titan
    const titan = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f3a });
    const darker = new THREE.MeshLambertMaterial({ color: 0x1d2029 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a1e });

    const body = box(3.4, 4.4, 2.6, dark); body.position.y = 5.6; titan.add(body);
    const belly = box(2.6, 3.0, 2.0, darker); belly.position.set(0, 5.0, 0.5); titan.add(belly);
    const head = box(2.2, 2.0, 2.2, dark); head.position.y = 8.4; titan.add(head);
    const jaw = box(2.0, 0.7, 2.0, darker); jaw.position.set(0, 7.5, 0.2); titan.add(jaw);

    for (const s of [-1, 1]) {
      const eye = box(0.4, 0.4, 0.2, eyeMat); eye.position.set(s * 0.6, 8.7, 1.15); titan.add(eye);
      const arm = box(0.9, 3.0, 0.9, dark); arm.position.set(s * 2.3, 5.6, 0); arm.rotation.z = s * 0.25; titan.add(arm);
      arm.userData.isArm = s;
      const leg = box(1.2, 3.2, 1.2, dark); leg.position.set(s * 1.0, 1.8, 0); titan.add(leg);
    }
    // tail
    const tail = box(0.9, 0.9, 3.4, dark); tail.position.set(0, 4.2, -2.2); tail.rotation.x = 0.5; titan.add(tail);
    // back spikes
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 5), darker);
      sp.position.set(0, 7.4 - i * 0.9, -1.2 - i * 0.1);
      sp.rotation.x = -0.5;
      titan.add(sp);
    }

    titan.position.copy(this.position).add(new THREE.Vector3(0, 6, 0));
    titan.rotation.y = faceYaw;
    this.group.add(titan);
    this.titan = titan;
    this._arms = titan.children.filter((c) => c.userData.isArm);
    return this;
  }

  hpFraction() { return Math.max(0, this.hp / this.maxHP); }

  // a point in front of the pillar where the crowd rallies to attack
  chargeTarget(out) {
    return out.copy(this.position).addScaledVector(this._t, 4).addScaledVector(new THREE.Vector3(0, 1, 0), 0);
  }

  update(dt, time, clashing) {
    if (!this.titan) return;
    // idle sway
    this.titan.rotation.z = Math.sin(time * 1.5) * 0.03;
    const baseY = this.position.y + 6;
    this.titan.position.y = baseY + Math.sin(time * 2) * 0.15;

    if (clashing) {
      // stomp + roar
      const stomp = Math.abs(Math.sin(time * 9)) * 0.5;
      this.titan.position.y = baseY - stomp;
      for (const a of this._arms) a.rotation.x = Math.sin(time * 9 + (a.userData.isArm > 0 ? 0 : Math.PI)) * 0.8;
      this.shake = 0.18;
    } else {
      this.shake *= (1 - Math.min(1, dt * 5));
    }
  }
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

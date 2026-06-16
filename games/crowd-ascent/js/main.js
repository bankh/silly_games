// main.js — bootstrap, game-state machine, input, camera, and the boss clash.
import * as THREE from "three";
import { World } from "./world.js";
import { Crowd } from "./crowd.js";
import { Level } from "./level.js";
import { Boss } from "./boss.js";
import { UI } from "./ui.js";
import { Sound } from "./audio.js";

// ---- tuning ----
const RUN_SPEED = 24;        // forward units / sec along the road
const SOLDIER_DPS = 4;       // boss damage per soldier per sec during clash
const BOSS_DPS = 30;         // crowd attrition per sec during clash
const START_COUNT = 1;
const LAT_MARGIN = 0.6;

class Game {
  constructor() {
    const canvas = document.getElementById("game-canvas");
    this.world = new World(canvas);
    this.crowd = new Crowd(this.world.scene);
    this.level = new Level(this.world);
    this.boss = new Boss(this.world);
    this.ui = new UI();
    this.sound = new Sound();

    this.state = "menu";
    this.levelNum = 1;
    this.count = START_COUNT;

    this.u = 0;
    this.prevU = 0;
    this.lateral = 0;
    this.lateralTarget = 0;
    this.steerKey = 0;
    this.advancing = false;

    // scratch
    this.leadPos = new THREE.Vector3();
    this.tan = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.fixedTan = new THREE.Vector3();
    this.fixedRight = new THREE.Vector3();
    this.chargePos = new THREE.Vector3();
    this.clashStart = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._look2 = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this.time = 0;
    this.hazardSoundT = 0;
    this.clashT = 0;
    this.arrivalCount = 1;

    this.ui.bind({
      start: () => this.startGame(1),
      retry: () => this.startGame(this.levelNum),
      next: () => this.startGame(this.levelNum + 1),
      resume: () => this.resume(),
      quit: () => this.toMenu(),
      pause: () => this.pause(),
      mute: () => { const m = this.sound.toggle(); this.ui.setMuteIcon(m); },
    });

    this._bindInput();
    window.addEventListener("resize", () => this.world.resize());

    this.ui.setBest(this.ui.best);
    this.ui.hideLoading();
    this.ui.screen("start");

    // pre-build a path so the menu has something behind it
    this.world.buildPath(1);
    this._placeAtStart();
    this._lastT = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------- game lifecycle ----------------
  startGame(levelNum) {
    this.levelNum = Math.max(1, levelNum);
    this.count = START_COUNT;
    this.u = 0; this.prevU = 0;
    this.lateral = 0; this.lateralTarget = 0;
    this.steerKey = 0;
    this.advancing = true;
    this.clashT = 0;

    this.world.buildPath(this.levelNum);
    this.level.build(this.levelNum);
    this.boss.build(this.levelNum);
    this._placeAtStart();
    this.crowd.reset(this.count, this.leadPos);

    this.ui.screen(null);
    this.ui.setLevel(this.levelNum);
    this.ui.setBest(this.ui.best);
    this.ui.setCount(this.count, "good");
    this.ui.setProgress(0);
    this.ui.showBoss(false);
    this.ui.hint(true);
    setTimeout(() => this.ui.hint(false), 2600);

    this.sound._ensure(); // unlock audio on the user gesture
    this.state = "playing";
  }

  _placeAtStart() {
    this.world.frameAt(0, this.leadPos, this.tan, this.right);
    this.leadPos.addScaledVector(this.right, this.lateral);
    // snap camera behind
    this._updateCamera(1);
  }

  toMenu() { this.state = "menu"; this.ui.screen("start"); }
  pause() { if (this.state === "playing" || this.state === "clash") { this._resumeState = this.state; this.state = "paused"; this.ui.screen("pause"); } }
  resume() { if (this.state === "paused") { this.state = this._resumeState || "playing"; this.ui.screen(null); this._lastT = performance.now(); } }

  // ---------------- input ----------------
  _bindInput() {
    const canvas = this.world.canvas;
    let activeId = null, lastX = 0;
    const sens = () => (2 * this.world.halfWidth) / window.innerWidth * 1.5;

    // pointer capture + pointerId tracking → no "stuck steer" if the release
    // happens off-canvas/off-screen or a second finger interrupts a touch drag
    canvas.addEventListener("pointerdown", (e) => {
      activeId = e.pointerId;
      lastX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    const move = (e) => {
      if (activeId === null || e.pointerId !== activeId) return;
      if (e.pointerType === "mouse" && e.buttons === 0) { end(e); return; }
      this.lateralTarget += (e.clientX - lastX) * sens();
      lastX = e.clientX;
      this._clampLat();
    };
    const end = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("lostpointercapture", end);

    // losing focus while a key is held → clear steering so the crowd doesn't drift
    window.addEventListener("blur", () => { this.steerKey = 0; activeId = null; this._lastT = performance.now(); });

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.steerKey = -1;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.steerKey = 1;
      else if (e.key === "p" || e.key === "P") { this.state === "paused" ? this.resume() : this.pause(); }
      else if (e.key === "m" || e.key === "M") { const m = this.sound.toggle(); this.ui.setMuteIcon(m); }
      else if (e.key === " ") {
        if (this.state === "menu") this.startGame(1);
        else if (this.state === "lose") this.startGame(this.levelNum);
        else if (this.state === "win") this.startGame(this.levelNum + 1);
      }
    });
    window.addEventListener("keyup", (e) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) this.steerKey = 0;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  _clampLat() {
    const lim = this.world.halfWidth - LAT_MARGIN;
    this.lateralTarget = THREE.MathUtils.clamp(this.lateralTarget, -lim, lim);
  }

  // ---------------- main loop ----------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this._lastT) / 1000;
    this._lastT = now;
    if (dt > 0.05) dt = 0.05;
    this.time += dt;

    if (this.state === "playing") this._updatePlaying(dt);
    else if (this.state === "clash") this._updateClash(dt);
    else this._updateIdle(dt);

    this.world.render();
  }

  _updateIdle(dt) {
    // gentle camera drift on menu/end screens
    this.boss.update(dt, this.time, false);
    this.level.update(this.time, dt);
    this._updateCamera(dt);
  }

  _updatePlaying(dt) {
    // steering
    if (this.steerKey !== 0) { this.lateralTarget += this.steerKey * 9 * dt; this._clampLat(); }
    this.lateral = THREE.MathUtils.lerp(this.lateral, this.lateralTarget, 1 - Math.exp(-12 * dt));

    // advance along the road
    this.prevU = this.u;
    this.u += (RUN_SPEED * dt) / this.world.length;

    // boss entry
    if (this.u >= this.boss.entryU) { this._enterClash(); return; }

    this.world.frameAt(this.u, this.leadPos, this.tan, this.right);
    this.leadPos.addScaledVector(this.right, this.lateral);

    this._checkGates();
    this._checkPickups();
    this._checkHazards(dt);

    if (this.count < 1) { this._lose("Your crowd was wiped out."); return; }

    this.crowd.count = this.count;
    this.crowd.update(dt, this.leadPos, this.tan, this.right, this.time);
    this.level.update(this.time, dt);
    this.boss.update(dt, this.time, false);
    this.ui.setProgress(this.u / this.boss.entryU);
    this._updateCamera(dt);
  }

  _checkGates() {
    for (const g of this.gates) {
      if (g.consumed) continue;
      if (g.u > this.prevU && g.u <= this.u) {
        const sign = this.lateral < 0 ? -1 : 1;
        const gate = sign < 0 ? g.left : g.right;
        this._applyOp(gate);
        g.consumed = true;
        this.level.consumeGateSide(g, sign);
      }
    }
  }

  _applyOp(gate) {
    const before = this.count;
    switch (gate.op) {
      case "add": this.count += gate.val; break;
      case "mul": this.count = Math.floor(this.count * gate.val); break;
      case "sub": this.count = Math.max(0, this.count - gate.val); break;
      case "div": this.count = Math.floor(this.count / gate.val); break;
    }
    const good = this.count >= before;
    this.ui.setCount(this.count, good ? "good" : "hit");
    if (gate.op === "mul" && good) this.sound.big();
    else if (good) this.sound.good();
    else this.sound.bad();
  }

  _checkPickups() {
    const tol = this.world.halfWidth * 0.5;
    for (const p of this.pickups) {
      if (p.consumed) continue;
      if (p.u > this.prevU && p.u <= this.u && Math.abs(this.lateral - p.lateral) < tol) {
        this.count += p.value;
        this.level.consumePickup(p);
        this.ui.setCount(this.count, "good");
        this.sound.pickup();
      }
    }
  }

  _checkHazards(dt) {
    let inFire = false;
    for (const h of this.hazards) {
      if (this.u >= h.u0 && this.u <= h.u1) {
        const hit = h.side < 0 ? this.lateral < 0.6 : this.lateral > -0.6;
        if (hit) inFire = true;
      }
    }
    if (inFire && this.count > 0) {
      this.count -= (this.count * 0.5 + 4) * dt;
      this.count = Math.max(0, this.count);
      this.ui.countText(this.count);
      this.ui.el.countBadge.classList.add("hit");
      this.hazardSoundT -= dt;
      if (this.hazardSoundT <= 0) { this.sound.hit(); this.hazardSoundT = 0.18; }
    } else {
      this.ui.el.countBadge.classList.remove("hit");
    }
  }

  // ---------------- boss clash ----------------
  _enterClash() {
    this.state = "clash";
    this.advancing = false;
    this.clashT = 0;
    this.arrivalCount = Math.floor(this.count);
    this.world.frameAt(this.boss.entryU, this.clashStart, this.fixedTan, this.fixedRight);
    this.clashStart.addScaledVector(this.fixedRight, this.lateral);
    this.boss.chargeTarget(this.chargePos);
    this.ui.showBoss(true);
    this.ui.setBossBar(1);
    this.ui.setProgress(1);
    this.sound.clash();
  }

  _updateClash(dt) {
    this.clashT += dt;

    // crowd rushes the pillar
    const rush = Math.min(1, this.clashT / 0.6);
    this.leadPos.copy(this.clashStart).lerp(this.chargePos, easeOut(rush));

    // DPS race after a short windup
    if (this.clashT > 0.35 && this.boss.hp > 0 && this.count > 0) {
      this.boss.hp -= this.count * SOLDIER_DPS * dt;
      this.count -= BOSS_DPS * dt;
      if (this.count < 0) this.count = 0;
    }
    this.ui.setBossBar(this.boss.hpFraction());
    this.ui.countText(this.count);

    this.crowd.count = this.count;
    this.crowd.update(dt, this.leadPos, this.fixedTan, this.fixedRight, this.time);
    this.level.update(this.time, dt);
    this.boss.update(dt, this.time, true);
    this._updateCamera(dt, true);

    if (this.boss.hp <= 0) { this._win(); }
    else if (this.count <= 0) { this._lose("The Titan crushed your army."); }
  }

  _win() {
    this.state = "win";
    const score = this.arrivalCount * this.levelNum * 10 + 500;
    this.ui.recordBest(this.arrivalCount);
    this.sound.win();
    this.ui.showWin(this.arrivalCount, score);
  }

  _lose(reason) {
    this.state = "lose";
    const army = Math.max(this.arrivalCount, Math.floor(this.count));
    this.ui.recordBest(army);
    this.sound.lose();
    this.ui.showLose(army, reason);
  }

  // ---------------- camera ----------------
  _updateCamera(dt, clash = false) {
    const cam = this.world.camera;
    const lerp = (dt >= 1) ? 1 : 1 - Math.exp(-7 * dt);

    if (clash) {
      // sit behind the charging crowd, look between the crowd and the Titan
      const bp = this.boss.position;
      const dir = this._look.set(bp.x - this.clashStart.x, 0, bp.z - this.clashStart.z);
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      dir.normalize();
      this._camPos.copy(this.clashStart).addScaledVector(dir, -15);
      this._camPos.y += 11;
      cam.position.lerp(this._camPos, lerp);
      if (this.boss.shake > 0.001) {
        cam.position.x += (Math.random() - 0.5) * this.boss.shake;
        cam.position.y += (Math.random() - 0.5) * this.boss.shake;
      }
      this._look2.copy(this.leadPos).lerp(bp, 0.55);
      this._look2.y = bp.y + 6;
      cam.lookAt(this._look2);
      return;
    }

    // normal run: frame on the road centerline (stable), look slightly ahead
    this.world.frameAt(this.u, this._tmp, this.tan, this.right);
    const back = this._look.set(-this.tan.x, 0, -this.tan.z).normalize();

    this._camPos.copy(this._tmp)
      .addScaledVector(back, 12.5)
      .addScaledVector(this.right, this.lateral * 0.35);
    this._camPos.y += 7.5;
    cam.position.lerp(this._camPos, lerp);

    this._look2.copy(this._tmp)
      .addScaledVector(back, -6)
      .addScaledVector(this.right, this.lateral * 0.4);
    this._look2.y += 2;
    cam.lookAt(this._look2);
  }

  // convenience getters
  get gates() { return this.level.gates; }
  get pickups() { return this.level.pickups; }
  get hazards() { return this.level.hazards; }
}

function easeOut(t) { return 1 - (1 - t) * (1 - t); }

// boot
window.addEventListener("DOMContentLoaded", () => {
  try {
    window.__game = new Game();
  } catch (err) {
    console.error(err);
    const l = document.getElementById("loading");
    if (l) { l.textContent = "Failed to load 3D engine. Check your connection and reload."; l.classList.remove("hidden"); }
  }
});

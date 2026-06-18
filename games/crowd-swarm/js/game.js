/*
 * CrowdSwarm — a competitive browser crowd game.
 * Copyright © 2026 Atlas Bank. All rights reserved.
 */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const sizeEl = document.getElementById('size');
const timeEl = document.getElementById('time');
const panel = document.getElementById('panel');
const mathBox = document.getElementById('mathBox');
const mathPrompt = document.getElementById('mathPrompt');
const answers = document.getElementById('answers');
const endBox = document.getElementById('endBox');
const endText = document.getElementById('endText');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const mathBtn = document.getElementById('mathBtn');
const globalBoard = document.getElementById('globalBoard');
const playerName = document.getElementById('playerName');
const proofBtn = document.getElementById('proofBtn');
const submitBtn = document.getElementById('submitBtn');
const stampScore = document.getElementById('stampScore');
const stampDate = document.getElementById('stampDate');
const stampCode = document.getElementById('stampCode');

// ---- leaderboard (local-first; opt-in screenshot-gated global board) ----
const GAME_ID = 'crowd-swarm';
const GAME_TITLE = 'CrowdSwarm';

// ---- world (much larger than the screen; a camera follows the player) ----
const WORLD_W = 3600;
const WORLD_H = 2400;
const NEUTRAL_COUNT = 180;   // crowd dots scattered across the whole arena
const RIVAL_COUNT = 9;       // AI swarms competing for the crowd
const VISION = 380;          // how far a rival "sees" prey & crowd
const FLEE_RANGE = 230;      // a rival only flees a bigger blob within this range (so you can close in)
const EAT_RATIO = 1.1;       // you eat anything you engulf that is at least this many times smaller
const ROUND_TIME = 300;      // seconds
const RIVAL_NAMES = ['Vortex', 'Bubble', 'Pico', 'Nova', 'Maki', 'Orbit', 'Zuzu', 'Bingo', 'Coral', 'Pixel', 'Goo', 'Tako'];

let W = 0, H = 0, dpr = 1;
let camX = 0, camY = 0;
let running = false, over = false, last = 0;
let tLeft = ROUND_TIME, score = 0;

let globalScores = [];   // committed global board, read once (only changes on deploy)
let lastRun = null;      // { score, code, date } of the round just ended, for proof + submit
SillyLeaderboard.loadScores('scores.json').then(s => { globalScores = s; });

let keys = new Set();
// Touch / mouse steering: when active the swarm heads toward the finger/cursor.
// x,y are in CSS pixels (clientX/Y), which match screen space since the canvas
// fills the viewport at 0,0. Keyboard, when pressed, takes priority over this.
let pointer = { active: false, x: 0, y: 0, id: null };
let player, neutrals, rivals, challenge = null;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resize);

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tier(n) {
  return n < 5 ? 0 : n < 15 ? 1 : n < 30 ? 2 : n < 50 ? 3 : 4;
}

function speedFor(n) {
  // Bigger blobs move slower — smooth and continuous, with no hard cap at large
  // sizes, easing from ~4.4 (tiny) down toward a ~1.1 floor (huge) so growth
  // always trades away mobility. Applies to the player and rivals alike.
  return 1.1 + 3.3 / (1 + n / 22);
}

function radiusFor(n) {
  return 12 + n * 0.55;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function makeNeutral() {
  return {
    x: rand(20, WORLD_W - 20),
    y: rand(20, WORLD_H - 20),
    r: rand(5, 9),
    vx: rand(-1, 1),
    vy: rand(-1, 1)
  };
}

function makeRival(i) {
  return {
    x: rand(120, WORLD_W - 120),
    y: rand(120, WORLD_H - 120),
    n: Math.floor(rand(2, 6)),
    vx: rand(-1, 1),
    vy: rand(-1, 1),
    hue: Math.floor(i * 360 / RIVAL_COUNT),
    name: RIVAL_NAMES[i % RIVAL_NAMES.length],
    wander: rand(0, Math.PI * 2),
    trail: []
  };
}

function reset() {
  score = 0;
  tLeft = ROUND_TIME;
  over = false;
  running = true;
  challenge = null;
  // Start bigger than any rival (rivals spawn at 2..5) so the opening is
  // survivable: no rival can eat you yet, and you can eat the biggest of them.
  player = { x: WORLD_W / 2, y: WORLD_H / 2, n: 6, trail: [], name: 'YOU', isPlayer: true };
  neutrals = Array.from({ length: NEUTRAL_COUNT }, makeNeutral);
  rivals = Array.from({ length: RIVAL_COUNT }, (_, i) => makeRival(i));
  camX = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W));
  camY = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));
  panel.classList.add('hidden');
  endBox.classList.add('hidden');
  mathBox.classList.add('hidden');
  mathBtn.classList.remove('hidden');
}

function askMath() {
  const ops = ['+', '-', '×', '÷'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, ans;

  if (op === '+') {
    a = Math.floor(rand(2, 12));
    b = Math.floor(rand(2, 12));
    ans = a + b;
  } else if (op === '-') {
    a = Math.floor(rand(5, 18));
    b = Math.floor(rand(1, a));
    ans = a - b;
  } else if (op === '×') {
    a = Math.floor(rand(2, 9));
    b = Math.floor(rand(2, 9));
    ans = a * b;
  } else {
    b = Math.floor(rand(2, 9));
    ans = Math.floor(rand(2, 9));
    a = b * ans;
  }

  const opts = new Set([ans]);
  while (opts.size < 4) {
    const guess = ans + Math.floor(rand(-6, 7));
    opts.add(guess === ans ? ans + 1 : guess);
  }

  const list = [...opts].sort(() => Math.random() - 0.5);
  mathPrompt.textContent = `Solve: ${a} ${op} ${b}`;
  answers.innerHTML = '';

  list.forEach(v => {
    const btn = document.createElement('button');
    btn.textContent = v;
    btn.onclick = () => {
      if (!running) return;   // round already ended — ignore late answers
      if (v === ans) {
        player.n += 3;
        score += 30;
      } else {
        score += 5;
      }
      mathBox.classList.add('hidden');
      challenge = null;
    };
    answers.appendChild(btn);
  });

  mathBox.classList.remove('hidden');
  challenge = { until: performance.now() + 6000 };
}

startBtn.onclick = reset;
restartBtn.onclick = reset;

// On-screen math bonus — the touchscreen equivalent of pressing Space.
mathBtn.addEventListener('click', () => {
  if (running && !challenge) askMath();
});

// Save the stamped proof image (canvas + score/date/code banner) for the submission.
proofBtn.addEventListener('click', () => {
  if (!lastRun) return;
  SillyLeaderboard.saveProof(canvas, {
    gameTitle: GAME_TITLE, label: 'Score',
    score: lastRun.score, code: lastRun.code, date: lastRun.date,
  });
});

// Open the prefilled submission issue; the player attaches the proof image there.
submitBtn.addEventListener('click', () => {
  if (!lastRun) return;
  const name = (playerName.value || '').trim().slice(0, 24) || 'Anonymous';
  try { localStorage.setItem('silly:name', name); } catch (_) {}
  const url = SillyLeaderboard.buildIssueURL({
    gameTitle: GAME_TITLE, name,
    score: lastRun.score, code: lastRun.code, date: lastRun.date,
  });
  window.open(url, '_blank', 'noopener');
});

window.addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.key === ' ' && running && !challenge) askMath();
});

window.addEventListener('keyup', e => {
  keys.delete(e.key.toLowerCase());
});

// ---- touch / mouse steering (drag to send the swarm toward your finger) ----
// Pointer capture + pointerId tracking means a finger sliding off-canvas (or a
// second finger) can't leave the swarm stuck heading in one direction.
canvas.addEventListener('pointerdown', e => {
  pointer.active = true;
  pointer.id = e.pointerId;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', e => {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  if (e.pointerType === 'mouse' && e.buttons === 0) { endPointer(e); return; }
  pointer.x = e.clientX;
  pointer.y = e.clientY;
});
function endPointer(e) {
  if (pointer.id !== null && e.pointerId !== pointer.id) return;
  pointer.active = false;
  pointer.id = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
// Losing focus mid-drag (tab switch, etc.) shouldn't leave the swarm coasting.
window.addEventListener('blur', () => { pointer.active = false; pointer.id = null; });

// A bigger blob consumes a smaller one. Player and rivals share this rule.
function consume(win, lose) {
  win.n += Math.max(1, Math.floor(lose.n / 2));
  if (win.isPlayer) score += 20 + lose.n * 4;

  if (lose.isPlayer) {
    // Getting eaten halves you and shoves you clear so you aren't re-eaten instantly.
    lose.n = Math.max(1, Math.floor(lose.n / 2));
    const ang = Math.atan2(lose.y - win.y, lose.x - win.x);
    lose.x = clamp(lose.x + Math.cos(ang) * 220, 20, WORLD_W - 20);
    lose.y = clamp(lose.y + Math.sin(ang) * 220, 20, WORLD_H - 20);
    lose.trail.length = 0;
    score = Math.max(0, score - 15);
  } else {
    // A defeated rival respawns small somewhere far, keeping the field full.
    lose.n = Math.floor(rand(2, 5));
    lose.x = rand(120, WORLD_W - 120);
    lose.y = rand(120, WORLD_H - 120);
    if (lose.trail) lose.trail.length = 0;
  }
}

function update(dt) {
  if (!running) return;

  tLeft = Math.max(0, tLeft - dt / 1000);
  if (tLeft <= 0) {
    over = true;
    running = false;
    // Close any open math bonus so it can't linger over (or be answered after) the end screen.
    mathBox.classList.add('hidden');
    mathBtn.classList.add('hidden');
    challenge = null;
  }

  // ---- player movement ----
  const psp = speedFor(player.n) * dt / 16.666;
  let dx = 0, dy = 0;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;

  // No key held? Steer toward the finger/cursor. The player sits at screen
  // position (player - cam); a small dead-zone means a tap right on the swarm
  // (or a still finger on it) holds position instead of jittering.
  if (dx === 0 && dy === 0 && pointer.active) {
    const tx = pointer.x - (player.x - camX);
    const ty = pointer.y - (player.y - camY);
    const tlen = Math.hypot(tx, ty);
    if (tlen > 14) { dx = tx / tlen; dy = ty / tlen; }
  }

  const plen = Math.hypot(dx, dy) || 1;
  const pr = radiusFor(player.n);
  player.x = clamp(player.x + dx / plen * psp, pr, WORLD_W - pr);
  player.y = clamp(player.y + dy / plen * psp, pr, WORLD_H - pr);
  player.vx = dx / plen; player.vy = dy / plen;   // exposed so rivals can lead the player

  player.trail.push({ x: player.x, y: player.y });
  if (player.trail.length > 18 + tier(player.n) * 4) player.trail.shift();

  // ---- crowd drift ----
  for (const f of neutrals) {
    f.x += f.vx * 0.5;
    f.y += f.vy * 0.5;
    if (f.x < 10 || f.x > WORLD_W - 10) f.vx *= -1;
    if (f.y < 10 || f.y > WORLD_H - 10) f.vy *= -1;
  }

  const blobs = [player, ...rivals];

  // ---- rival AI: flee only nearby bigger blobs -> hunt the best smaller prey
  //      (leading its movement) -> chase visible crowd -> wander; with wall
  //      avoidance and smoothed heading so they read as deliberate, not twitchy. ----
  for (const e of rivals) {
    const er = radiusFor(e.n);

    let fx = 0, fy = 0, fleeing = false, prey = null, preyScore = -Infinity;
    for (const o of blobs) {
      if (o === e) continue;
      const d = dist(o, e) || 1;
      if (o.n > e.n * EAT_RATIO) {
        if (d < FLEE_RANGE) {                       // flee, weighted by closeness & how outsized
          const w = (FLEE_RANGE - d) / FLEE_RANGE * (o.n / e.n);
          fx += (e.x - o.x) / d * w;
          fy += (e.y - o.y) / d * w;
          fleeing = true;
        }
      } else if (e.n > o.n * EAT_RATIO && d < VISION) {
        const s = o.n * 4 - d * 0.05;               // prefer bigger, then closer prey
        if (s > preyScore) { preyScore = s; prey = o; }
      }
    }

    let food = null, fd = VISION;                    // only forage crowd it can actually see
    for (const f of neutrals) {
      const d = dist(f, e);
      if (d < fd) { fd = d; food = f; }
    }

    let ax, ay;
    if (fleeing) {
      ax = fx; ay = fy;
    } else if (prey) {
      ax = (prey.x + (prey.vx || 0) * 9) - e.x;      // lead the target's motion
      ay = (prey.y + (prey.vy || 0) * 9) - e.y;
    } else if (food) {
      ax = food.x - e.x; ay = food.y - e.y;
    } else {
      e.wander += rand(-0.25, 0.25);
      ax = Math.cos(e.wander); ay = Math.sin(e.wander);
    }

    // steer away from walls so a rival never gets pinned jittering on an edge
    const margin = 150;
    if (e.x < margin) ax += (1 - e.x / margin) * 2;
    else if (e.x > WORLD_W - margin) ax -= (1 - (WORLD_W - e.x) / margin) * 2;
    if (e.y < margin) ay += (1 - e.y / margin) * 2;
    else if (e.y > WORLD_H - margin) ay -= (1 - (WORLD_H - e.y) / margin) * 2;

    // smooth the heading (momentum) so movement looks intentional, not jittery
    const len = Math.hypot(ax, ay) || 1;
    e.dirx = (e.dirx == null ? ax / len : e.dirx * 0.8 + (ax / len) * 0.2);
    e.diry = (e.diry == null ? ay / len : e.diry * 0.8 + (ay / len) * 0.2);
    const dl = Math.hypot(e.dirx, e.diry) || 1;
    e.vx = e.dirx / dl; e.vy = e.diry / dl;

    const sp = speedFor(e.n) * dt / 16.666;
    e.x = clamp(e.x + e.vx * sp, er, WORLD_W - er);
    e.y = clamp(e.y + e.vy * sp, er, WORLD_H - er);

    e.trail.push({ x: e.x, y: e.y });
    if (e.trail.length > 10) e.trail.shift();
  }

  // ---- eat crowd dots (player and rivals both grow) ----
  for (let i = 0; i < neutrals.length; i++) {
    const f = neutrals[i];
    for (const b of blobs) {
      if (dist(b, f) < radiusFor(b.n) + f.r) {
        b.n += 1;
        if (b.isPlayer) score += 10;
        neutrals[i] = makeNeutral();
        break;
      }
    }
  }

  // ---- blob vs blob: the bigger one eats the other the moment it engulfs the
  //      other's center (so you no longer glide straight through smaller prey) ----
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const a = blobs[i], b = blobs[j];
      const d = dist(a, b);
      if (a.n > b.n * EAT_RATIO && d < radiusFor(a.n)) consume(a, b);
      else if (b.n > a.n * EAT_RATIO && d < radiusFor(b.n)) consume(b, a);
    }
  }

  if (challenge && performance.now() > challenge.until) {
    mathBox.classList.add('hidden');
    challenge = null;
  }

  // ---- camera follows the player, clamped to the world ----
  camX = clamp(player.x - W / 2, 0, Math.max(0, WORLD_W - W));
  camY = clamp(player.y - H / 2, 0, Math.max(0, WORLD_H - H));

  scoreEl.textContent = Math.floor(score);
  sizeEl.textContent = player.n;
  timeEl.textContent = fmtTime(tLeft);

  if (over) {
    endBox.classList.remove('hidden');
    const ranking = [player, ...rivals].slice().sort((p, q) => q.n - p.n);
    const rank = ranking.indexOf(player) + 1;
    const finalScore = Math.floor(score);

    // Finalize the round once: stamp a verification code, record the local best,
    // and render the global board. (This block runs only on the frame time hits 0,
    // since update() returns early while !running.)
    lastRun = { score: finalScore, code: SillyLeaderboard.makeCode(), date: SillyLeaderboard.today() };
    const rec = SillyLeaderboard.recordLocal(GAME_ID, finalScore, 'desc');

    endText.textContent = `You finished #${rank} of ${ranking.length} • Crowd size: ${player.n} • Score: ${finalScore}`
      + (rec.isNew ? ' 🎉 New personal best!' : '');
    stampScore.textContent = finalScore;
    stampDate.textContent = lastRun.date;
    stampCode.textContent = lastRun.code;
    try { const saved = localStorage.getItem('silly:name'); if (saved && !playerName.value) playerName.value = saved; } catch (_) {}

    SillyLeaderboard.renderBoard(globalBoard, {
      entries: globalScores, order: 'desc', label: 'Score', localBest: rec.best,
    });
  }
}

function drawBlob(x, y, n, fill) {
  const r = radiusFor(n);
  const t = performance.now() * 0.002 + n * 0.15;
  ctx.fillStyle = fill;
  ctx.beginPath();
  const pts = 10;
  for (let i = 0; i <= pts; i++) {
    const a = i / pts * Math.PI * 2;
    const wobble = Math.sin(a * 3 + t) * 4 + Math.cos(a * 5 - t) * 3;
    const rr = r + wobble;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.9;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawTrail(trail, color, width) {
  if (!trail || trail.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
}

function label(x, y, n) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${clamp(Math.round(radiusFor(n) * 0.9), 10, 22)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function onScreen(p, pad) {
  return p.x > camX - pad && p.x < camX + W + pad && p.y > camY - pad && p.y < camY + H + pad;
}

function panel9(x, y, w, h) {
  ctx.fillStyle = 'rgba(8,16,28,0.55)';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
}

function drawLeaderboard() {
  const ranking = [player, ...rivals].slice().sort((p, q) => q.n - p.n);
  const top = ranking.slice(0, 6);
  const pad = 10, lh = 22, w = 196;
  const x = W - w - 14, y = 14, h = lh * top.length + pad * 2 + 18;
  panel9(x, y, w, h);
  ctx.fillStyle = '#bfe3ff';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('LEADERBOARD', x + pad, y + pad);
  top.forEach((b, i) => {
    const yy = y + pad + 18 + i * lh;
    const me = !!b.isPlayer;
    ctx.fillStyle = me ? '#7dffb2' : `hsl(${b.hue || 140} 70% 70%)`;
    ctx.font = (me ? 'bold ' : '') + '13px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}. ${b.name}`, x + pad, yy);
    ctx.textAlign = 'right';
    ctx.fillText(String(b.n), x + w - pad, yy);
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawMinimap() {
  const mw = 190, mh = mw * WORLD_H / WORLD_W;
  const x = W - mw - 14, y = H - mh - 14;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  panel9(x, y, mw, mh);
  ctx.strokeStyle = 'rgba(120,200,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, mw, mh);

  ctx.fillStyle = 'rgba(111,211,255,0.35)';
  for (const f of neutrals) ctx.fillRect(x + f.x * sx, y + f.y * sy, 1, 1);

  for (const e of rivals) {
    ctx.fillStyle = `hsl(${e.hue} 70% 60%)`;
    ctx.beginPath();
    ctx.arc(x + e.x * sx, y + e.y * sy, Math.max(2, radiusFor(e.n) * sx * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#7dffb2';
  ctx.beginPath();
  ctx.arc(x + player.x * sx, y + player.y * sy, Math.max(3, radiusFor(player.n) * sx * 0.7), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  // Clamp the viewport box to the minimap on screens wider/taller than the world.
  ctx.strokeRect(x + camX * sx, y + camY * sy, Math.min(W * sx, mw - camX * sx), Math.min(H * sy, mh - camY * sy));
}

function render() {
  ctx.clearRect(0, 0, W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1830');
  g.addColorStop(1, '#070d18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // No round in progress yet (before "Start"): just show the backdrop.
  // Without this guard, touching neutrals/rivals/player (undefined) throws on
  // the first frame and permanently kills the requestAnimationFrame loop.
  if (!player) return;

  ctx.save();
  ctx.translate(-camX, -camY);

  // world border
  ctx.strokeStyle = 'rgba(120,200,255,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

  // grid, visible region only
  ctx.fillStyle = 'rgba(255,255,255,.04)';
  for (let x = Math.floor(camX / 80) * 80; x < camX + W; x += 80) ctx.fillRect(x, camY, 1, H);
  for (let y = Math.floor(camY / 80) * 80; y < camY + H; y += 80) ctx.fillRect(camX, y, W, 1);

  // crowd dots
  ctx.fillStyle = '#6fd3ff';
  for (const f of neutrals) {
    if (!onScreen(f, 20)) continue;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // rivals
  for (const e of rivals) {
    if (!onScreen(e, 120)) continue;
    drawTrail(e.trail, `hsla(${e.hue} 70% 60% / 0.16)`, 8 + tier(e.n) * 3);
    drawBlob(e.x, e.y, e.n, `hsl(${e.hue} 70% 58%)`);
    label(e.x, e.y, e.n);
  }

  // player
  drawTrail(player.trail, 'rgba(140,255,200,.18)', 18 + tier(player.n) * 4);
  const fill = ['#87ffd0', '#7cf5ff', '#a0ff8f', '#d8ff7a', '#ffdf7a'][tier(player.n)];
  drawBlob(player.x, player.y, player.n, fill);
  ctx.fillStyle = '#08101d';
  ctx.beginPath();
  ctx.arc(player.x, player.y, 5, 0, Math.PI * 2);
  ctx.fill();
  label(player.x, player.y, player.n);

  ctx.restore();

  // screen-space HUD
  drawLeaderboard();
  drawMinimap();
}

function loop(ts) {
  // Cap dt so a tab-switch / long frame gap can't teleport blobs or skip collisions.
  const dt = Math.min(ts - last || 16, 50);
  last = ts;
  // Schedule the next frame first and isolate the work in try/catch so a single
  // thrown frame can never permanently kill the animation loop.
  requestAnimationFrame(loop);
  try {
    update(dt);
    render();
  } catch (err) {
    console.error('crowd-swarm frame error:', err);
  }
}

resize();
requestAnimationFrame(loop);

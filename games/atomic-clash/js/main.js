// main.js — bootstrap + menu + mode router for Atomic Clash.
// Owns the screens, the HUD timer, scoring, and the local/global leaderboard glue.
// The two modes (Sort = 3D, Match = 2D) share the element data and the same lifecycle:
//   mode.build()  → start playing
//   mode.update(dt) (Sort only, driven by the Three.js loop)
//   mode.dispose() → tear down
import { Stage } from "./scene.js";
import { SortMode } from "./modes/sort.js";
import { MatchMode } from "./modes/match.js";
import { loadElements, pickSet } from "../../../shared/elements/elements.js";

const GAME_TITLE = "Atomic Clash";
const $ = (id) => document.getElementById(id);

const ui = {
  loading: $("loading"),
  canvas: $("stage-canvas"),
  matchRoot: $("match-root"),
  hud: $("hud"), hudMode: $("hud-mode"), hudTier: $("hud-tier"), hudStat: $("hud-stat"), hudTimer: $("hud-timer"),
  hint: $("hint"),
  celebrate: $("celebrate"), celebrateText: $("celebrate-text"),
  heldCard: $("held-card"), heldImg: $("held-img"), heldCap: $("held-cap"),
  menu: $("screen-menu"), tierLabel: $("tier-label"), how: $("how-text"), menuBest: $("menu-best"),
  scatterChooser: $("scatter-chooser"),
  win: $("screen-win"), winTitle: $("win-title"), winSub: $("win-sub"),
  winTime: $("win-time"), winExtra: $("win-extra"), winExtraLabel: $("win-extra-label"), winScore: $("win-score"),
  winBestLine: $("win-best-line"),
};

const HOW = {
  sort: "Tap a card to pick it up, then tap the slot where it belongs. Drag to orbit · right-drag to pan · scroll / pinch to zoom.",
  match: "Flip two cards at a time and remember where each element is. Clear every pair.",
};

const state = {
  all: [],
  mode: "sort",
  tier: 20,
  pick: "fixed",      // "fixed" = first N by number · "random" = random draw each game
  scatter: "air",     // Sort only: "air" = floating 3D cloud · "around" = spread in the table plane
  stage: null,
  active: null,
  startTime: 0,
  timer: null,
  lastWin: null,
  celebrateTimer: null,
};

const CELEBRATE_MS = 4500;  // how long the finished board stays before results auto-appear

// ---------- boot ----------
(async function boot() {
  try {
    state.all = await loadElements();
    window.__atomicReady = true;
    ui.loading.classList.add("hidden");
    wireMenu();
    wireWin();
    refreshMenuBest();
  } catch (e) {
    console.error(e);
    ui.loading.textContent = "Failed to load element data. Please reload.";
    ui.loading.classList.remove("hidden");
  }
})();

// ---------- menu ----------
function wireMenu() {
  document.querySelectorAll(".mode-opt").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode-opt").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      state.mode = b.dataset.mode;
      ui.tierLabel.textContent = state.mode === "match" ? "CARDS" : "ELEMENTS";
      ui.how.textContent = HOW[state.mode];
      ui.scatterChooser.classList.toggle("hidden", state.mode === "match"); // scatter is Sort-only
      refreshMenuBest();
    }));
  document.querySelectorAll(".tier-opt").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tier-opt").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      state.tier = Number(b.dataset.tier);
      refreshMenuBest();
    }));
  document.querySelectorAll(".pick-opt").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".pick-opt").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      state.pick = b.dataset.pick;
      refreshMenuBest();
    }));
  document.querySelectorAll(".scatter-opt").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".scatter-opt").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      state.scatter = b.dataset.scatter;
    }));
  ui.how.textContent = HOW.sort;
  $("btn-start").addEventListener("click", startGame);
  $("btn-quit").addEventListener("click", toMenu);
}

function wireWin() {
  $("btn-again").addEventListener("click", () => { ui.win.classList.add("hidden"); startGame(); });
  $("btn-menu").addEventListener("click", toMenu);
  $("btn-submit").addEventListener("click", submitScore);
  $("btn-see-results").addEventListener("click", revealResults);
}

function localKey() { return `atomic-clash:${state.mode}:${state.tier}:${state.pick}`; }

function refreshMenuBest() {
  const best = SillyLeaderboard.localBest(localKey());
  ui.menuBest.textContent = best ? `${best} pts` : "—";
}

// ---------- start / stop ----------
function startGame() {
  teardownActive();
  ui.menu.classList.add("hidden");
  ui.win.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  ui.hudMode.textContent = state.mode.toUpperCase();
  ui.hudTier.textContent = String(state.tier);
  showHint("");

  const hooks = { onTick, onHint: showHint, onWin, onHeld };

  if (state.mode === "sort") {
    ui.matchRoot.classList.add("hidden");
    ui.canvas.classList.remove("hidden");
    if (!state.stage) state.stage = new Stage(ui.canvas);
    state.stage._onResize();
    const subset = pickSet(state.all, state.tier, state.pick);
    state.active = new SortMode(state.stage, subset, { ...hooks, scatter: state.scatter });
    state.active.build();
    state.stage.start((dt) => state.active && state.active.update(dt));
  } else {
    state.stage?.stop();
    ui.canvas.classList.add("hidden");
    const pairs = Math.floor(state.tier / 2);
    const subset = pickSet(state.all, pairs, state.pick);
    state.active = new MatchMode(ui.matchRoot, subset, hooks);
    state.active.build();
  }

  startTimer();
}

function teardownActive() {
  stopTimer();
  clearTimeout(state.celebrateTimer);
  state.celebrateTimer = null;
  ui.celebrate.classList.add("hidden");
  onHeld(null);
  if (state.active) { state.active.dispose(); state.active = null; }
  state.stage?.stop();
}

function toMenu() {
  teardownActive();
  ui.hud.classList.add("hidden");
  ui.win.classList.add("hidden");
  ui.matchRoot.classList.add("hidden");
  ui.canvas.classList.remove("hidden");
  ui.menu.classList.remove("hidden");
  showHint("");
  refreshMenuBest();
}

// ---------- HUD ----------
function startTimer() {
  state.startTime = performance.now();
  stopTimer();
  state.timer = setInterval(() => { ui.hudTimer.textContent = fmtTime(elapsed()); }, 250);
  ui.hudTimer.textContent = "0:00";
}
function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
function elapsed() { return (performance.now() - state.startTime) / 1000; }

function onTick(s) {
  if ("placed" in s) ui.hudStat.textContent = `${s.placed} / ${s.total}`;
  else ui.hudStat.textContent = `${s.matched} / ${s.pairs} pairs`;
}

// Sort mode: zoom the picked-up card into the 2D left panel (null = nothing held)
function onHeld(el) {
  if (!el) { ui.heldCard.classList.remove("open"); return; }
  ui.heldImg.src = el.img;
  ui.heldImg.alt = `${el.name} card`;
  ui.heldCap.innerHTML = `<b>${el.symbol}</b> · ${el.name} · Z=${el.z}`;
  ui.heldCard.classList.add("open");
}

let hintTimer = null;
function showHint(text) {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  if (!text) { ui.hint.classList.add("hidden"); ui.hint.textContent = ""; return; }
  ui.hint.textContent = text;
  ui.hint.classList.remove("hidden");
}

// ---------- win + scoring ----------
function onWin(stats) {
  const seconds = Math.round(elapsed());
  stopTimer();
  // NOTE: do not stop the stage here — keep rendering so the player can admire (and orbit)
  // the finished board during the celebration, before the results screen appears.

  let score, extra, extraLabel, title, sub;
  if (stats.kind === "match") {
    score = Math.max(0, Math.round(stats.pairs * 200 - seconds * 2 - (stats.moves - stats.pairs) * 8));
    extra = stats.moves; extraLabel = "MOVES";
    title = "ALL MATCHED!"; sub = `${stats.pairs} pairs cleared.`;
  } else {
    // Score is time-based: faster → higher. A mistake costs a few seconds of penalty.
    // (total*1000)/time keeps bigger tables worth more while staying strictly faster-is-better.
    const penalizedTime = seconds + stats.mistakes * 5;
    score = Math.round((stats.total * 1000) / Math.max(1, penalizedTime));
    extra = stats.mistakes; extraLabel = "MISTAKES";
    title = "TABLE COMPLETE!"; sub = `You rebuilt ${stats.total} elements.`;
  }

  const { isNew } = SillyLeaderboard.recordLocal(localKey(), score, "desc");
  state.lastWin = { score, seconds, mode: state.mode, tier: state.tier, pick: state.pick };

  ui.winTitle.textContent = title;
  ui.winSub.textContent = sub;
  ui.winTime.textContent = fmtTime(seconds);
  ui.winExtra.textContent = String(extra);
  ui.winExtraLabel.textContent = extraLabel;
  ui.winScore.textContent = String(score);
  ui.winBestLine.innerHTML = isNew
    ? "🎉 New personal best on this device!"
    : `Your best here: <b>${SillyLeaderboard.localBest(localKey())}</b> pts`;

  // proof screenshot only works for the Sort (WebGL canvas) mode
  $("btn-submit").style.display = state.mode === "sort" ? "" : "none";

  // Celebrate over the finished board first; reveal the full results after a beat (or on tap).
  ui.celebrateText.innerHTML = `🎉 ${title}<span class="celebrate-sub">${fmtTime(seconds)} · ${score} pts</span>`;
  ui.celebrate.classList.remove("hidden");
  clearTimeout(state.celebrateTimer);
  state.celebrateTimer = setTimeout(revealResults, CELEBRATE_MS);
}

// Swap the celebration banner for the full results screen (auto after a delay, or via the button).
function revealResults() {
  clearTimeout(state.celebrateTimer);
  state.celebrateTimer = null;
  ui.celebrate.classList.add("hidden");
  state.stage?.stop();                 // now freeze the scene — results overlay covers it
  ui.hud.classList.add("hidden");
  ui.win.classList.remove("hidden");
}

function submitScore() {
  const w = state.lastWin;
  if (!w) return;
  const code = SillyLeaderboard.makeCode();
  const date = SillyLeaderboard.today();
  const title = `${GAME_TITLE} — ${w.mode} ${w.tier} ${w.pick}`;
  if (w.mode === "sort" && state.stage) {
    SillyLeaderboard.saveProof(state.stage.renderer.domElement, {
      gameTitle: title, label: "Score", score: w.score, code, date,
    });
  }
  const url = SillyLeaderboard.buildIssueURL({ gameTitle: title, name: "", score: w.score, code, date });
  window.open(url, "_blank", "noopener");
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

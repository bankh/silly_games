// ui.js — HUD, menus, score, and localStorage best.
const $ = (id) => document.getElementById(id);
const KEY = "crowd-ascent-best";

export class UI {
  constructor() {
    this.el = {
      hud: $("hud"),
      count: $("count-value"),
      countBadge: $("count-badge"),
      level: $("level-label"),
      best: $("best-label"),
      progress: $("progress-bar"),
      progressWrap: document.querySelector(".progress-wrap"),
      hint: $("steer-hint"),
      bossUI: $("boss-ui"),
      bossBar: $("boss-bar"),
      btnPause: $("btn-pause"),
      btnMute: $("btn-mute"),
      loading: $("loading"),
      screens: {
        start: $("screen-start"),
        win: $("screen-win"),
        lose: $("screen-lose"),
        pause: $("screen-pause"),
      },
    };
    this.best = parseInt(localStorage.getItem(KEY) || "0", 10) || 0;
    $("start-best").textContent = this.best;
  }

  hideLoading() { this.el.loading.classList.add("hidden"); }

  bind(h) {
    $("btn-start").onclick = h.start;
    $("btn-retry").onclick = h.retry;
    $("btn-next").onclick = h.next;
    $("btn-replay-win").onclick = h.retry;
    $("btn-resume").onclick = h.resume;
    $("btn-quit").onclick = h.quit;
    this.el.btnPause.onclick = h.pause;
    this.el.btnMute.onclick = h.mute;
  }

  screen(name) {
    for (const k in this.el.screens) this.el.screens[k].classList.toggle("hidden", k !== name);
    const playing = name === null;
    this.el.hud.classList.toggle("hidden", !playing);
    this.el.btnPause.classList.toggle("hidden", !playing);
    this.el.btnMute.classList.toggle("hidden", !playing);
    if (!playing) this.el.bossUI.classList.add("hidden");
  }

  setCount(n, kind) {
    this.el.count.textContent = formatNum(n);
    const b = this.el.countBadge;
    b.classList.remove("bump", "hit");
    void b.offsetWidth; // restart animation
    b.classList.add(kind === "hit" ? "hit" : "bump");
  }

  countText(n) { this.el.count.textContent = formatNum(n); }
  setLevel(l) { this.el.level.textContent = "LEVEL " + l; }
  setBest(b)  { this.el.best.textContent = "BEST " + formatNum(b); }
  setProgress(f) { this.el.progress.style.width = Math.max(0, Math.min(100, f * 100)) + "%"; }

  showBoss(show) {
    this.el.bossUI.classList.toggle("hidden", !show);
    if (this.el.progressWrap) this.el.progressWrap.style.visibility = show ? "hidden" : "visible";
  }
  setBossBar(f) { this.el.bossBar.style.width = Math.max(0, Math.min(100, f * 100)) + "%"; }

  hint(show) { this.el.hint.classList.toggle("hidden", !show); }
  setMuteIcon(muted) { this.el.btnMute.textContent = muted ? "🔇" : "🔊"; }

  recordBest(army) {
    if (army > this.best) {
      this.best = army;
      localStorage.setItem(KEY, String(army));
    }
    $("start-best").textContent = this.best;
    return this.best;
  }

  showWin(army, score) {
    $("win-army").textContent = formatNum(army);
    $("win-score").textContent = formatNum(score);
    $("win-best").textContent = formatNum(this.best);
    this.screen("win");
  }
  showLose(army, reason) {
    $("lose-army").textContent = formatNum(army);
    $("lose-best").textContent = formatNum(this.best);
    $("lose-reason").textContent = reason || "Your crowd was scattered.";
    this.screen("lose");
  }
}

function formatNum(n) {
  n = Math.max(0, Math.floor(n));
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

/*
 * shared/leaderboard.js — Silly Games leaderboard helper (local-first + opt-in global board).
 *
 * Loaded as a plain <script> so it works from both the module-based hub and the
 * plain-script games; it attaches a single global, window.SillyLeaderboard.
 *
 * Two tiers:
 *   • Local best  — instant, per-device, via localStorage. The real play-loop reward.
 *   • Global board — committed games/<id>/scores.json, populated by a human reviewing
 *                    screenshot-backed submission issues. Read-only on the client.
 *
 * Honest scope: the verification code + proof screenshot make cheating ANNOYING,
 * not impossible (a determined player can still edit the score in devtools before
 * capturing). That's the right bar for a family/community wall of fame.
 */
(function () {
  const REPO = "https://github.com/bankh/silly_games";
  // No ambiguous glyphs (no O/0/I/1) so the code stays readable on a screenshot.
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const SillyLeaderboard = {
    REPO,

    // ---- local best (per device) ----
    _key: (id) => `silly:hi:${id}`,
    localBest(id) {
      const v = Number(localStorage.getItem(this._key(id)));
      return Number.isFinite(v) ? v : 0;
    },
    /** Record a finished run; returns { best, isNew } where isNew means a new personal best. */
    recordLocal(id, score, order = "desc") {
      const prev = Number(localStorage.getItem(this._key(id)));
      const hasPrev = Number.isFinite(prev) && localStorage.getItem(this._key(id)) != null;
      const better = !hasPrev || (order === "asc" ? score < prev : score > prev);
      if (better) {
        try { localStorage.setItem(this._key(id), String(score)); } catch (_) {}
        return { best: score, isNew: hasPrev };   // isNew=false on the very first score (nothing to beat)
      }
      return { best: prev, isNew: false };
    },

    // ---- per-run verification code + date (stamped onto the proof) ----
    makeCode(len = 4) {
      let s = "";
      for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      return s;
    },
    today() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    // ---- global board (read committed scores.json) ----
    async loadScores(url) {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (_) {
        return [];   // absent / malformed → just an empty board, never a thrown error
      }
    },
    sort(entries, order = "desc") {
      return [...entries].sort((a, b) => (order === "asc" ? a.score - b.score : b.score - a.score));
    },

    // ---- submission: prefilled GitHub issue (player attaches the proof image there) ----
    buildIssueURL({ gameTitle, name, score, code, date }) {
      const q = new URLSearchParams({
        template: "global-score.yml",
        labels: "leaderboard",
        title: `[score] ${gameTitle}: ${score}`,
        game: gameTitle || "",
        playername: name || "",
        score: String(score),
        rundate: date || "",
        code: code || "",
      });
      return `${REPO}/issues/new?${q.toString()}`;
    },

    // ---- proof image: the game canvas + a stamp banner (title · score · date · code) ----
    saveProof(srcCanvas, { gameTitle, label = "Score", score, code, date, filename } = {}) {
      const w = srcCanvas.width, h = srcCanvas.height;   // device pixels
      const out = document.createElement("canvas");
      out.width = w; out.height = h;
      const c = out.getContext("2d");
      c.fillStyle = "#0b1830";
      c.fillRect(0, 0, w, h);
      try { c.drawImage(srcCanvas, 0, 0, w, h); } catch (_) { /* tainted/WebGL frame — banner still carries the proof */ }

      const bh = Math.max(64, Math.round(h * 0.16));
      c.fillStyle = "rgba(6,12,22,0.82)";
      c.fillRect(0, h - bh, w, bh);
      c.textBaseline = "middle";
      c.textAlign = "left";
      c.fillStyle = "#7dffb2";
      c.font = `800 ${Math.round(bh * 0.26)}px system-ui, sans-serif`;
      c.fillText(`${gameTitle || "Silly Games"} — proof`, Math.round(w * 0.03), h - bh + bh * 0.32);
      c.fillStyle = "#eaf2ff";
      c.font = `700 ${Math.round(bh * 0.3)}px system-ui, sans-serif`;
      c.fillText(`${label}: ${score}    ·    ${date}    ·    Code ${code}`, Math.round(w * 0.03), h - bh + bh * 0.7);

      out.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.download = filename || `proof-${(gameTitle || "game").toLowerCase().replace(/\s+/g, "-")}-${score}.png`;
        a.href = URL.createObjectURL(blob);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    },

    // ---- render a board into a container (used in-game and on the hub) ----
    renderBoard(container, { entries = [], order = "desc", label = "Score", localBest = null, you = null, empty = "No global scores yet — be the first to submit!" } = {}) {
      const rows = this.sort(entries, order);
      let html = "";
      if (localBest != null) {
        html += `<div class="lb-local">Your best (this device): <b>${escapeHtml(localBest)}</b></div>`;
      }
      if (!rows.length) {
        html += `<p class="lb-empty">${escapeHtml(empty)}</p>`;
      } else {
        html += `<ol class="lb-list">`;
        rows.forEach((s, i) => {
          const mine = you && s.name === you ? " lb-you" : "";
          html += `<li class="lb-row${mine}"><span class="lb-rank">${i + 1}</span>` +
            `<span class="lb-name">${escapeHtml(s.name)}</span>` +
            `<span class="lb-score">${escapeHtml(s.score)}</span></li>`;
        });
        html += `</ol>`;
        html += `<div class="lb-foot">${escapeHtml(label)} · top ${rows.length}</div>`;
      }
      container.innerHTML = html;
    },
  };

  window.SillyLeaderboard = SillyLeaderboard;
})();

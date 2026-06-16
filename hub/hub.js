// hub.js — renders the Netflix-style Silly Games landing page.
// Catalog = hub/registry.json (list of game ids) + games/<id>/game.json (per-game metadata).
// To add a game, see CONTRIBUTING.md — you do NOT need to edit this file.
const REPO = "https://github.com/bankh/silly_games";
const CONTRIBUTE_URL = REPO + "/blob/main/CONTRIBUTING.md";

const hub = document.getElementById("hub");

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// ---------- load catalog ----------
async function loadCatalog() {
  const reg = await fetchJSON("hub/registry.json");
  const ids = Array.isArray(reg) ? reg : (reg.games || []);
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const m = await fetchJSON(`games/${id}/game.json`);
        const path = `games/${id}/`;
        return {
          id,
          path,
          title: m.title || id,
          tagline: m.tagline || "",
          description: m.description || "",
          tags: Array.isArray(m.tags) ? m.tags : [],
          accent: m.accent || "#36c8ff",
          thumb: m.thumb ? path + m.thumb : null,
          hero: m.hero ? path + m.hero : null,
          featured: !!m.featured,
          status: m.status || "ready",
        };
      } catch (e) {
        console.warn(`Skipping game '${id}':`, e.message);
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

// ---------- pieces ----------
function tagPills(tags = [], accent) {
  return tags.map((t) => `<span class="pill" style="--pill:${accent || "#9fb8da"}">${escapeHtml(t)}</span>`).join("");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderHero(game) {
  const hero = el("section", "hero");
  hero.style.setProperty("--accent", game.accent);
  if (game.hero) hero.style.backgroundImage = `url("${game.hero}")`;

  const inner = el("div", "hero-inner");
  inner.appendChild(el("div", "hero-badge", "★ FEATURED"));
  inner.appendChild(el("h1", "hero-title", escapeHtml(game.title)));
  if (game.tagline) inner.appendChild(el("p", "hero-tagline", escapeHtml(game.tagline)));
  if (game.description) inner.appendChild(el("p", "hero-desc", escapeHtml(game.description)));
  inner.appendChild(el("div", "hero-tags", tagPills(game.tags, game.accent)));

  const play = el("a", "btn-play", "▶ PLAY");
  play.href = game.path;
  inner.appendChild(play);

  hero.appendChild(el("div", "hero-scrim"));
  hero.appendChild(inner);
  return hero;
}

function renderCard(game) {
  const ready = game.status === "ready";
  const card = el("article", "card" + (ready ? "" : " card-soon"));
  card.style.setProperty("--accent", game.accent);

  const thumb = el("div", "card-thumb");
  if (game.thumb) thumb.style.backgroundImage = `url("${game.thumb}")`;
  if (!ready) thumb.appendChild(el("div", "card-lock", "🔒"));
  card.appendChild(thumb);

  const body = el("div", "card-body");
  body.appendChild(el("h3", "card-title", escapeHtml(game.title)));
  if (game.tagline) body.appendChild(el("p", "card-tagline", escapeHtml(game.tagline)));
  body.appendChild(el("div", "card-tags", tagPills(game.tags, game.accent)));
  card.appendChild(body);

  if (ready) {
    const a = el("a", "card-link", "");
    a.href = game.path;
    a.setAttribute("aria-label", `Play ${game.title}`);
    card.appendChild(a);
  } else {
    card.appendChild(el("div", "card-soon-badge", "SOON"));
  }
  return card;
}

// a decorative "add your game" card that always closes the row
function renderContributeCard() {
  const card = el("article", "card card-contribute");
  card.style.setProperty("--accent", "#ffcc33");
  const thumb = el("div", "card-thumb");
  thumb.appendChild(el("div", "card-lock", "➕"));
  card.appendChild(thumb);
  const body = el("div", "card-body");
  body.appendChild(el("h3", "card-title", "Add your game"));
  body.appendChild(el("p", "card-tagline", "Build a game and open a pull request to feature it here."));
  card.appendChild(body);
  const a = el("a", "card-link", "");
  a.href = CONTRIBUTE_URL;
  a.target = "_blank";
  a.rel = "noopener";
  a.setAttribute("aria-label", "How to contribute a game");
  card.appendChild(a);
  return card;
}

function renderRow(title, games) {
  const row = el("section", "row");
  row.appendChild(el("h2", "row-title", title));
  const track = el("div", "row-track");
  games.forEach((g) => track.appendChild(renderCard(g)));
  track.appendChild(renderContributeCard());
  row.appendChild(track);
  return row;
}

// ---------- boot ----------
(async function () {
  try {
    const games = await loadCatalog();
    hub.innerHTML = "";
    if (!games.length) {
      hub.appendChild(renderRow("All Games", []));
      return;
    }
    const featured =
      games.find((g) => g.featured && g.status === "ready") ||
      games.find((g) => g.status === "ready") ||
      games[0];
    hub.appendChild(renderHero(featured));
    hub.appendChild(renderRow("All Games", games));
  } catch (e) {
    console.error(e);
    hub.innerHTML = '<p style="padding:48px;text-align:center;color:#9fb8da">Could not load the game catalog. Try reloading.</p>';
  }
})();

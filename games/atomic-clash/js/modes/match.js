// match.js — element memory: a grid of face-down cards, two of each element. Flip two; if
// they're the same element they lock face-up, otherwise they flip back. Solved when every
// pair is found. Pure DOM (CSS 3D flip) — fast, responsive, and great on touch.
import { cardBackURL } from "../../../../shared/elements/elements.js";

export class MatchMode {
  constructor(root, elements, opts = {}) {
    this.root = root;            // #match-root
    this.elements = elements;    // subset; each becomes a PAIR
    this.opts = opts;
    this.first = null;
    this.lock = false;
    this.moves = 0;
    this.matched = 0;
    this.pairs = elements.length;
    this._timers = [];
  }

  build() {
    const deck = shuffle(this.elements.flatMap((e) => [e, e]));
    this.count = deck.length;
    this.cols = colCount(deck.length);

    const grid = document.createElement("div");
    grid.className = "match-grid";

    for (let i = 0; i < deck.length; i++) {
      const el = deck[i];
      const card = document.createElement("button");
      card.className = "mcard";
      card.dataset.z = String(el.z);
      card.setAttribute("aria-label", "Hidden element card");
      card.innerHTML =
        `<span class="mcard-face mcard-back"><img src="${cardBackURL}" alt="" draggable="false"></span>` +
        `<span class="mcard-face mcard-front"><img src="${el.img}" alt="${el.name}" draggable="false"></span>`;
      card.addEventListener("click", () => this._flip(card));
      grid.appendChild(card);
    }

    this.root.innerHTML = "";
    this.root.appendChild(grid);
    this.root.classList.remove("hidden");
    this.grid = grid;
    this._layout();
    this._onResize = () => this._layout();
    window.addEventListener("resize", this._onResize);
    this._progress();
    this.opts.onHint?.("Flip two cards to find matching elements.");
  }

  // Size the columns (in px) so every card fits the viewport without scrolling and the
  // board stays tightly packed — fixes cards drifting far apart on wide screens.
  _layout() {
    if (!this.grid) return;
    const cols = this.cols, rows = Math.ceil(this.count / cols), gap = 8;
    const availW = window.innerWidth - 40;       // page side padding
    const availH = window.innerHeight - 96;      // HUD top + bottom breathing room
    const byWidth = (availW - (cols - 1) * gap) / cols;
    const byHeight = ((availH - (rows - 1) * gap) / rows) * (257 / 379); // keep card aspect
    const cardW = Math.floor(Math.max(38, Math.min(byWidth, byHeight, 150)));
    this.grid.style.gap = `${gap}px`;
    this.grid.style.gridTemplateColumns = `repeat(${cols}, ${cardW}px)`;
  }

  _flip(card) {
    if (this.lock) return;
    if (card.classList.contains("matched") || card.classList.contains("flipped")) return;
    card.classList.add("flipped");

    if (!this.first) { this.first = card; return; }

    this.moves++;
    this._progress();
    const a = this.first, b = card;

    if (a.dataset.z === b.dataset.z) {
      a.classList.add("matched"); b.classList.add("matched");
      this.first = null;
      this.matched++;
      this._progress();
      if (this.matched === this.pairs) this._win();
    } else {
      this.lock = true;
      a.classList.add("shake"); b.classList.add("shake");
      this._timers.push(setTimeout(() => {
        a.classList.remove("flipped", "shake");
        b.classList.remove("flipped", "shake");
        this.first = null; this.lock = false;
      }, 850));
    }
  }

  _progress() {
    this.opts.onTick?.({ matched: this.matched, pairs: this.pairs, moves: this.moves });
  }

  _win() {
    this.opts.onWin?.({ kind: "match", moves: this.moves, pairs: this.pairs });
  }

  // match mode has no per-frame work, but main calls update(dt) uniformly
  update() {}

  dispose() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    if (this._onResize) window.removeEventListener("resize", this._onResize);
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }
}

function colCount(n) {
  return Math.min(n, Math.max(4, Math.round(Math.sqrt(n * 1.6))));
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

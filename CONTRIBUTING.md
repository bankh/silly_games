# Contributing a game to Silly Games 🎮

Anyone can add a game via **pull request**. Every game is a self-contained folder under
`games/`, and the hub picks it up from a small manifest. CI validates your submission
automatically.

---

## TL;DR

```bash
# 1. fork & clone, then:
cp -r games/_template games/my-game-id      # pick a lowercase-kebab id
# 2. build your game inside games/my-game-id/ (replace the template)
# 3. fill in games/my-game-id/game.json
# 4. register it:  add "my-game-id" to the "games" list in hub/registry.json
# 5. run it locally and check the hub:
python3 -m http.server 8000                 # → http://localhost:8000
# 6. validate, commit, push, open a PR:
npm run validate
```

CI runs `npm run validate` on your PR — keep it green and a maintainer will merge & deploy.

---

## Step by step

### 1. Create your game folder
Copy the template to `games/<your-id>/`. The **id** must be lowercase letters, digits and
hyphens (`my-cool-game`), and it becomes the URL: `…/silly_games/games/<your-id>/`.

```bash
cp -r games/_template games/my-cool-game
```

### 2. Build your game
Put everything inside your folder. **Hard rules** (CI + review enforce these):

- ✅ **Static only** — plain HTML/CSS/JS (any engine is fine: Canvas, WebGL, Three.js, Phaser…).
  No backend, no server-side code, no build step required to *play* it.
- ✅ **Self-contained** — vendor your libraries inside your folder (don't rely on a CDN at
  runtime if you can avoid it). Don't import from other games.
- ✅ **Relative paths only** — e.g. `./js/game.js`, not `/js/game.js`. The site is served
  under a sub-path (`/silly_games/`), so absolute paths break.
- ✅ **An `index.html` entry point** at `games/<your-id>/index.html`.
- 🙏 Add a **“← All Games”** link back to the hub (`../../`) — see the template.
- 🚫 No trackers/analytics, no ads, keep assets a reasonable size, content suitable for all ages.

### 3. Add `game.json`
This drives your card on the hub. Place it at `games/<your-id>/game.json`:

```json
{
  "title": "My Cool Game",
  "tagline": "A one-line hook.",
  "description": "A sentence or two for the featured banner.",
  "tags": ["2D", "Puzzle"],
  "accent": "#36c8ff",
  "thumb": "docs/thumb.png",
  "hero": "docs/hero.png",
  "status": "ready",
  "author": "your-github-handle"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | ✅ | ≤ 40 chars |
| `status` | ✅ | `ready` (playable) or `soon` (locked card) |
| `tagline` | – | ≤ 90 chars |
| `description` | – | ≤ 400 chars (shown on the hero) |
| `tags` | – | up to 6 short labels |
| `accent` | – | hex color, e.g. `#36c8ff` |
| `thumb` | – | card image, **relative to your folder** (e.g. `docs/thumb.png`) |
| `hero` | – | large featured image, relative to your folder |
| `featured` | – | `true` to take the hero slot (only one game should set this) |
| `author` | – | your name / GitHub handle |

Schema: [`games/game.schema.json`](games/game.schema.json) (point your editor at it for autocomplete).
Put images under `games/<your-id>/docs/`.

### 4. Register it
Add your id to the `games` array in [`hub/registry.json`](hub/registry.json) (keep it alphabetical):

```json
{ "games": ["crowd-ascent", "my-cool-game"] }
```

### 5. Run it locally
ES modules must be served over HTTP (not `file://`):

```bash
python3 -m http.server 8000     # or:  npm start   (zero-dep Node server)
```
Open <http://localhost:8000>, find your card, click in, and play.

### 6. Validate & open a PR
```bash
npm run validate                # same check CI runs
```
Commit, push to your fork, and open a pull request. Fill in the PR checklist. ✅

---

## What reviewers/CI check
- `npm run validate` passes (registry + `game.json` are well-formed, images exist).
- The game loads and is playable from the hub.
- Static-only, relative paths, self-contained, appropriate content.

Thanks for adding to the arcade! 🙌

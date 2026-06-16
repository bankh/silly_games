# 🦖 CROWD ASCENT — Game Scenario & Design Document

> A 3D "crowd runner" in the spirit of *Count Masters* / *Crowd Runners*, built to run
> entirely in the browser (Three.js, no build step) and ship as a static GitHub Page.

---

## 1. Premise / Story

The **Titan of Vantal** — a colossal armored kaiju — has awoken at the summit of the
**Spiral Bastion**, a winding fortress-road that coils up into the clouds. It is too
large for any single soldier to face. Your only hope is **numbers**.

You command the **Vanguard**: a lone recruit at the foot of the spiral. As you charge
upward, you rally more troops by funneling your crowd through **rally gates**, swell
your ranks into a roaring army, and survive the **traps and infernos** the Titan's
minions have laid across the road. At the top, you hurl your entire crowd at the Titan
in a final clash of **army size vs. boss health**.

Rally enough soldiers and the Titan falls. Arrive too thin, and it scatters you to the
wind.

---

## 2. Core Fantasy

*"Start as one. Arrive as a thousand. Bury the giant under your own army."*

The satisfaction loop is **growth**: watching a single runner become a swarming horde,
then watching that horde decide a boss fight by sheer mass.

---

## 3. Genre & Reference

- **Genre:** Hyper-casual 3D crowd runner / endless-runner hybrid with a boss climax.
- **Visual reference:** the attached screenshot — a spiral hedge-road climbing through
  fog, blue `+1` gates, a crowd of blue soldiers, fire hazards, and a giant kaiju
  standing on a white pillar with a health bar.
- **Camera:** third-person chase cam, slightly above and behind the crowd, tilted down.

---

## 4. Core Loop (per run, ~60–120s)

1. **Auto-run** forward along the winding spiral road (you never stop moving).
2. **Steer** left/right across the road width (drag / mouse / arrow keys).
3. **Hit gates** that change your crowd count:
   - `+N` additive gates (e.g. `+1`, `+5`, `+10`).
   - `×N` multiplier gates (e.g. `×2`, `×3`) — the big swings.
   - **Trap gates** that *subtract* or *divide* (`-10`, `÷2`) — avoid these.
   - Gates usually come in **pairs** (a good one and a bad one): pick a lane.
4. **Dodge hazards** — fire pits / spike rollers / falling boulders that cull a chunk
   of your crowd on contact.
5. **Collect bonus pickups** — stray soldiers and coins on the road.
6. **Reach the summit → Boss clash:** your crowd auto-charges the Titan. Each surviving
   soldier deals damage; the Titan deals damage back over a few seconds. If your count
   outlasts its health, **you win**.

---

## 5. Mechanics in Detail

### 5.1 The Crowd
- The crowd is driven by a single **leader point** that advances along the road curve.
- Every soldier has a **formation slot** (a spiral/disc packing around the leader) and
  smoothly chases it, giving the organic "blob" motion of the genre.
- **Count** can grow large; rendering uses an **InstancedMesh** so hundreds–thousands of
  soldiers stay performant. The HUD shows the *true* count even if visuals are capped.
- Losing soldiers visibly shrinks the blob; gaining grows it.

### 5.2 Gates
| Type        | Examples         | Effect                          | Feel        |
|-------------|------------------|---------------------------------|-------------|
| Add         | `+1 +5 +10 +25`  | `count += N`                    | steady gain |
| Multiply    | `×2 ×3`          | `count *= N`                    | huge spike  |
| Subtract    | `-10 -25`        | `count -= N` (min 0)            | punish      |
| Divide      | `÷2 ÷3`          | `count = floor(count / N)`      | punish      |

- Paired gates force a **decision** (left vs right lane). Color-coded: **blue/green =
  good**, **red = bad** — but bad gates sometimes sit in the tempting lane.

### 5.3 Hazards
- **Fire pits / infernos** (matching the screenshot): rolling forward, remove a % of the
  crowd per second of contact.
- **Spike rollers / boulders:** instant flat cull (e.g. `-15`) on contact.
- Hazards teach the player to value steering, not just gate-greed.

### 5.4 The Boss (Titan of Vantal)
- Stands on a pillar at the summit with a **health bar**.
- Boss HP scales with level so it is *winnable but tense* given good play.
- On arrival, the crowd charges; resolution is a short DPS race:
  - `crowdDPS = count × perSoldierDamage`
  - `bossDPS` culls soldiers over time.
  - **Win** if boss HP hits 0 before crowd hits 0; otherwise **lose**.

### 5.5 Win / Lose
- **Win:** Titan defeated → victory screen, score, "Next Level" (harder boss + busier road).
- **Lose:** crowd reaches 0 (mid-run or in boss fight) → defeat screen, "Retry".

---

## 6. Controls

| Input              | Action                          |
|--------------------|---------------------------------|
| Mouse drag / move  | Steer crowd left ↔ right        |
| Touch drag         | Steer (mobile)                  |
| ← / → or A / D     | Steer (keyboard)                |
| Space / Click      | Start / Restart                 |
| P                  | Pause                           |

Forward motion is automatic — the player only manages **lateral position** and **gate/hazard choices**.

---

## 7. Progression & Scoring

- **Score** = final crowd size × distance bonus × boss-clear bonus.
- **Levels** ramp: longer spiral, more gates, more hazards, tougher Titan, faster run.
- **High score** persisted in `localStorage` (survives reloads, no backend needed).

---

## 8. Art / Audio Direction

- **Low-poly, flat-shaded** look (cheap, clean, fast, matches the casual genre).
- Palette: foggy blue-grey sky, light sand road, **green hedge walls**, **blue soldiers**,
  **orange/red fire**, a dark monolithic **Titan**.
- Floating **`+N` / `×N` billboards** over gates (always face camera).
- WebAudio blips for gate pickups, hazard hits, and the boss clash (procedural, no asset files).

---

## 9. Technical Plan (GitHub Pages friendly)

- **Pure static site** — no server, no build step, no npm install for the player.
- **Three.js** loaded via an ES-module **import map** from a CDN (jsDelivr).
- Files served straight from the repo root → enable **GitHub Pages → main / root**.
- Single responsive `<canvas>`, scales to any screen, works on desktop + mobile.
- Structure:
  ```
  index.html        # canvas + importmap + HUD overlay
  css/style.css      # HUD, menus, responsive layout
  js/main.js         # bootstrap + game loop + state machine
  js/path.js         # winding spiral road curve + road mesh
  js/crowd.js        # instanced crowd, formation, steering
  js/level.js        # gate/hazard/pickup spawning per level
  js/boss.js         # Titan + boss-clash resolution
  js/ui.js           # HUD, menus, score, sound
  ```

---

## 10. Stretch Goals (post-MVP)
- Multiple soldier skins; unlockables bought with coins.
- Combo meter for chaining good gates without hazard hits.
- Multiple Titan types with attack patterns.
- Daily-seed runs.

# Township — design doc

A bite-size, **isometric** homage to Playrix's *Township*: the core farm → produce →
deliver loop, distilled into a browser game that runs 100% client-side and saves to
`localStorage`. No backend, no installs.

## The loop

```
plant a crop  →  wait (real timer)  →  harvest into the barn  →  deliver to an order
        ▲                                                              │
        └──────────────  coins + XP  ←  level up unlocks more  ◀──────┘
```

1. **Farm.** Tap an empty **field** to pick a crop. Crops mature on real timers
   (wheat ~8s … grapes ~150s) — accelerated vs. the real game so a session is satisfying.
2. **Harvest.** Tap a ripe field (✅ glow) to move the crop into your **barn** (capacity-limited).
3. **Deliver.** The **helicopter board** shows orders requesting crops for **coins + XP**.
   Delivery pays ~1.7× the raw market price, so filling orders beats selling.
4. **Grow.** XP raises your **level**, unlocking new crops and buildings. **Houses** add
   **population**, which multiplies order payouts. Expand the **barn** to hold more.

## Systems

| System | Detail |
|---|---|
| **Board** | 8×8 isometric grid (2:1 diamonds), rendered on Canvas. Pan (drag), zoom (wheel / ＋－). |
| **Crops** | wheat, corn, carrot, tomato, pumpkin, grapes — tiered by unlock level. |
| **Buildings** | field, house (+population), tree & fountain (decoration / XP). Escalating prices. |
| **Currencies** | 🪙 coins, XP→level, 👪 population (order-pay multiplier). |
| **Barn** | shared storage cap; upgradeable. Full barn blocks harvesting → deliver/sell to clear. |
| **Orders** | up to 3 active; refill on a timer; dismiss for a slower refill. |
| **Save** | timestamp-based — crops keep growing across reloads. Reset from ⚙️ Town Hall. |

## Code map

```
index.html        # DOM skeleton (HUD, toolbar, panels) + <canvas>
css/style.css     # all UI chrome
js/iso.js         # grid<->screen math + pan/zoom camera
js/data.js        # tuning tables: crops, buildings, leveling curve
js/state.js       # game state, rules/mutations, save/load, event bus
js/orders.js      # helicopter order generation + fulfillment
js/render.js      # isometric canvas drawing (ground, crops, buildings, ghost)
js/ui.js          # HUD, shop, barn, orders board, crop picker, toasts
js/main.js        # boot, render loop, pointer input, order timer
```

## Ideas for later passes (not in v1)
- **Production chains** (mill → bakery): wheat → flour → bread for deeper orders.
- **Train** orders (bulk, timed) alongside the helicopter.
- **Market / T-cash** premium currency and a trading post.
- **Land expansion** gated by population; a mine / zoo for variety.
- Pinch-to-zoom on touch; sound; richer building art.

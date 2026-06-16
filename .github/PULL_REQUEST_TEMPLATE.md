<!-- Thanks for contributing to Silly Games! See CONTRIBUTING.md. -->

## What's this PR?
<!-- New game? Fix? Describe it briefly. -->

## If you're adding a game
- **Game id / folder:** `games/<your-id>/`
- **Title:**

### Checklist
- [ ] Game lives entirely in `games/<my-id>/` and has an `index.html`
- [ ] Uses **relative paths** only (works under the `/silly_games/` sub-path)
- [ ] **Static only** — no backend/build step needed to play
- [ ] Added `games/<my-id>/game.json` (valid per `games/game.schema.json`)
- [ ] Registered the id in `hub/registry.json`
- [ ] Added a card image (`thumb`) and, if featured, a `hero`
- [ ] Added a “← All Games” link back to the hub
- [ ] `npm run validate` passes locally
- [ ] Played it from the hub locally and it works

## Notes
<!-- Anything reviewers should know (controls, credits, asset licenses, etc.) -->

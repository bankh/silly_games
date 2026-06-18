#!/usr/bin/env node
/**
 * validate-games.mjs — checks that the game catalog is well-formed.
 * Runs locally (`npm run validate`) and in CI on every pull request.
 *
 * Verifies:
 *  - hub/registry.json parses and lists valid game ids
 *  - each listed game has games/<id>/index.html and a valid games/<id>/game.json
 *  - game.json fields conform to games/game.schema.json (types, enums, lengths)
 *  - referenced thumb/hero image files actually exist
 *  - at most one game is `featured`
 *  - warns about game folders that exist but aren't registered
 *
 * Exit code 0 = OK, 1 = errors found.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const STATUSES = ["ready", "soon"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;       // YYYY-MM-DD on a global-board entry
const CODE_RE = /^[A-Z0-9]{1,8}$/;           // per-run verification code stamped on the proof
const ORDERS = ["desc", "asc"];
const MAX_SCORES = 200;                       // sanity cap per game's scores.json

// ---- registry ----
let ids = [];
try {
  const reg = readJSON("hub/registry.json");
  ids = Array.isArray(reg) ? reg : reg.games;
  if (!Array.isArray(ids)) err('hub/registry.json: "games" must be an array.');
} catch (e) {
  err(`hub/registry.json: could not read/parse (${e.message}).`);
}

const seen = new Set();
let featuredCount = 0;

for (const id of ids || []) {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    err(`registry id "${id}" is invalid (use lowercase letters, digits, hyphens).`);
    continue;
  }
  if (seen.has(id)) err(`registry lists "${id}" more than once.`);
  seen.add(id);

  const dir = `games/${id}`;
  if (!exists(dir)) { err(`${dir}/ is in the registry but the folder does not exist.`); continue; }
  if (!exists(`${dir}/index.html`)) err(`${dir}/index.html is missing (every game needs an entry point).`);
  if (!exists(`${dir}/game.json`)) { err(`${dir}/game.json is missing.`); continue; }

  let m;
  try { m = readJSON(`${dir}/game.json`); }
  catch (e) { err(`${dir}/game.json: invalid JSON (${e.message}).`); continue; }

  // required
  if (!m.title || typeof m.title !== "string") err(`${dir}/game.json: "title" is required (string).`);
  else if (m.title.length > 40) err(`${dir}/game.json: "title" must be <= 40 chars.`);
  if (!STATUSES.includes(m.status)) err(`${dir}/game.json: "status" must be one of ${STATUSES.join(", ")}.`);

  // optional, typed
  if (m.tagline != null && (typeof m.tagline !== "string" || m.tagline.length > 90))
    err(`${dir}/game.json: "tagline" must be a string <= 90 chars.`);
  if (m.description != null && (typeof m.description !== "string" || m.description.length > 400))
    err(`${dir}/game.json: "description" must be a string <= 400 chars.`);
  if (m.tags != null) {
    if (!Array.isArray(m.tags) || m.tags.length > 6 || !m.tags.every((t) => typeof t === "string" && t.length <= 24))
      err(`${dir}/game.json: "tags" must be an array of <= 6 short strings.`);
  }
  if (m.accent != null && !HEX_RE.test(m.accent)) err(`${dir}/game.json: "accent" must be a hex color like #36c8ff.`);
  if (m.featured != null && typeof m.featured !== "boolean") err(`${dir}/game.json: "featured" must be true/false.`);
  if (m.featured === true) featuredCount++;

  for (const key of ["thumb", "hero"]) {
    if (m[key] != null) {
      if (typeof m[key] !== "string") { err(`${dir}/game.json: "${key}" must be a path string.`); continue; }
      if (path.isAbsolute(m[key]) || m[key].includes("..")) err(`${dir}/game.json: "${key}" must be a relative path inside the game folder.`);
      else if (!exists(`${dir}/${m[key]}`)) err(`${dir}/game.json: "${key}" → ${dir}/${m[key]} does not exist.`);
    }
  }

  // optional leaderboard config
  if (m.leaderboard != null) {
    const lb = m.leaderboard;
    if (typeof lb !== "object" || Array.isArray(lb)) err(`${dir}/game.json: "leaderboard" must be an object.`);
    else {
      if (lb.label != null && (typeof lb.label !== "string" || lb.label.length > 24)) err(`${dir}/game.json: "leaderboard.label" must be a string <= 24 chars.`);
      if (lb.order != null && !ORDERS.includes(lb.order)) err(`${dir}/game.json: "leaderboard.order" must be one of ${ORDERS.join(", ")}.`);
      if (lb.max != null && (!Number.isInteger(lb.max) || lb.max < 1 || lb.max > 100)) err(`${dir}/game.json: "leaderboard.max" must be an integer 1..100.`);
    }
  }

  // optional scores.json (the committed global board — added by reviewing submission issues)
  if (exists(`${dir}/scores.json`)) {
    if (m.leaderboard == null) warn(`${dir}/scores.json exists but game.json has no "leaderboard" block (the board won't render).`);
    let scores;
    try { scores = readJSON(`${dir}/scores.json`); }
    catch (e) { err(`${dir}/scores.json: invalid JSON (${e.message}).`); scores = null; }
    if (scores != null) {
      if (!Array.isArray(scores)) err(`${dir}/scores.json: must be an array of score entries.`);
      else {
        if (scores.length > MAX_SCORES) err(`${dir}/scores.json: ${scores.length} entries exceeds the ${MAX_SCORES} cap.`);
        scores.forEach((s, i) => {
          const at = `${dir}/scores.json[${i}]`;
          if (typeof s !== "object" || s === null || Array.isArray(s)) { err(`${at}: must be an object.`); return; }
          if (typeof s.name !== "string" || s.name.length < 1 || s.name.length > 24) err(`${at}: "name" must be a string 1..24 chars.`);
          if (typeof s.score !== "number" || !Number.isFinite(s.score)) err(`${at}: "score" must be a finite number.`);
          if (typeof s.date !== "string" || !DATE_RE.test(s.date)) err(`${at}: "date" must be "YYYY-MM-DD".`);
          if (typeof s.code !== "string" || !CODE_RE.test(s.code)) err(`${at}: "code" must be 1..8 chars of A-Z/0-9 (the run's verification code).`);
          if (s.issue != null && (!Number.isInteger(s.issue) || s.issue < 1)) err(`${at}: "issue" must be a positive integer (the submission issue #).`);
        });
      }
    }
  }
}

if (featuredCount > 1) warn(`${featuredCount} games are "featured"; the hub shows only the first. Consider featuring just one.`);

// ---- orphan folders ----
const gamesDir = path.join(ROOT, "games");
if (fs.existsSync(gamesDir)) {
  for (const entry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // templates etc.
    if (!seen.has(entry.name)) warn(`games/${entry.name}/ exists but is not in hub/registry.json (it won't show on the hub).`);
  }
}

// ---- report ----
for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.error(`❌ ${e}`);

if (errors.length) {
  console.error(`\nValidation FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`✅ Catalog OK — ${seen.size} game(s) registered${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`);

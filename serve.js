#!/usr/bin/env node
/**
 * serve.js — zero-dependency static file server for local development.
 * ES modules + <script type="importmap"> require files to be served over HTTP
 * (not opened via file://), so use this (or any static server) to run the game.
 *
 *   node serve.js            # serves ./ on http://localhost:8000
 *   PORT=3000 node serve.js  # custom port
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath === "/") urlPath = "/index.html";

    // resolve and prevent path traversal outside ROOT
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }

    serveFile(filePath, res);
  } catch (e) {
    res.writeHead(500); res.end("Server error");
  }
});

function serveFile(filePath, res) {
  fs.stat(filePath, (err, stat) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found"); return; }
    // a directory → serve its index.html (so /games/foo/ works)
    if (stat.isDirectory()) { serveFile(path.join(filePath, "index.html"), res); return; }
    if (!stat.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found"); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

server.listen(PORT, () => {
  console.log(`\n  🎮 Silly Games running at  http://localhost:${PORT}\n  (Ctrl+C to stop)\n`);
});

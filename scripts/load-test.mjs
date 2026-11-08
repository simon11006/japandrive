// Simulates many players opening the game at the same moment against one
// server, then reports failures and response times.
//     node scripts/load-test.mjs [players=60]
// Uses only stored data (no internet needed): page, scripts, map files,
// the health check, a stored route and stored road tiles.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createRequestHandler, listen } from "../server.mjs";

const players = Number(process.argv[2]) || 60;
const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const preview = JSON.parse(await readFile(new URL("data/preview-cache.json", root), "utf8"));
const training = JSON.parse(await readFile(new URL("data/training-routes.json", root), "utf8"));
const route = training.routes[0];

// Everything a browser downloads to start the game.
const assets = [
  "/",
  "/style.css",
  "/game.js",
  "/vendor/three.module.js",
  "/vendor/three.core.js",
  ...["drive-renderer", "cockpit", "cockpit-layout", "map-data", "simulation", "vehicles", "driving-rules", "graphics", "car-model", "nav-display", "driver-view", "audio", "road-surface", "terrain", "scene-features"].map((m) => `/${m}.mjs`),
  ...[
    "okinawa-main-island.geojson",
    "okinawa-pois.json",
    "okinawa-extra-pois.json",
    "places.json",
    "preview-scene.json",
    "parking-sites.json",
    "okinawa-signals.json",
    "okinawa-road-rules.json",
    "destination-sites.json",
    "aqua-scene.json",
    "terrain-atlas.json",
  ].map((f) => `/data/${f}`),
];
const api = [
  "/api/health",
  "/api/route?" + new URLSearchParams({ start: route.start.join(","), end: route.end.join(",") }),
  "/api/overpass?" + new URLSearchParams({ data: preview.query }),
];

const server = http.createServer(createRequestHandler());
const port = await listen(server, 18700, 18750);
const agent = new http.Agent({ keepAlive: true, maxSockets: 6 });
const get = (path) =>
  new Promise((resolve) => {
    const started = performance.now();
    const req = http.get({ host: "127.0.0.1", port, path, agent, headers: { "Accept-Encoding": "gzip" } }, (res) => {
      let bytes = 0;
      res.on("data", (c) => (bytes += c.length));
      res.on("end", () => resolve({ path, status: res.statusCode, ms: performance.now() - started, bytes }));
    });
    req.on("error", (e) => resolve({ path, status: 0, ms: performance.now() - started, error: e.message }));
    req.setTimeout(60000, () => req.destroy(new Error("timeout")));
  });

console.log(`${players}명이 동시에 게임을 엽니다 (포트 ${port})…`);
const started = performance.now();
const results = (
  await Promise.all(
    Array.from({ length: players }, async () => {
      const out = [];
      // A browser fetches about six files at a time.
      for (let i = 0; i < assets.length; i += 6) out.push(...(await Promise.all(assets.slice(i, i + 6).map(get))));
      for (const p of api) out.push(await get(p));
      return out;
    }),
  )
).flat();
const total = performance.now() - started;
server.close();
agent.destroy();
const failed = results.filter((r) => r.status !== 200),
  times = results.map((r) => r.ms).sort((a, b) => a - b),
  pct = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(0),
  mb = results.reduce((n, r) => n + (r.bytes || 0), 0) / 1e6;
console.log(`요청 ${results.length}건 · 실패 ${failed.length}건 · 전송 ${mb.toFixed(1)} MB · 전체 ${(total / 1000).toFixed(1)}초`);
console.log(`응답 시간 중앙값 ${pct(0.5)} ms · 95% ${pct(0.95)} ms · 최대 ${pct(1)} ms`);
if (failed.length) console.log("실패 예:", failed.slice(0, 5));
if (!html.includes("일본 드라이브")) console.log("index.html을 확인하세요.");
process.exitCode = failed.length ? 1 : 0;

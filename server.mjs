import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createMapService } from "./map-service.mjs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";

const root = fileURLToPath(new URL(".", import.meta.url));
const cache = new Map();
const maps = createMapService({ cacheDir: resolve(root, "data/service-cache") });
let queue = Promise.resolve();
// Static files: read, hashed and gzip-compressed once per change, so dozens
// of players loading the game at the same time cost little CPU and the
// browser can reuse what it already has (ETag / 304).
const files = new Map();
async function staticFile(path) {
  const info = await stat(path);
  if (!info.isFile()) return null;
  const known = files.get(path);
  if (known && known.mtime === info.mtimeMs && known.size === info.size) return known;
  const bytes = await readFile(path),
    compressible = /\.(html|css|js|mjs|json|geojson|svg)$/.test(path) && bytes.length > 1024,
    entry = {
      mtime: info.mtimeMs,
      size: info.size,
      bytes,
      gzip: compressible ? gzipSync(bytes, { level: 6 }) : null,
      etag: `"${createHash("sha1").update(bytes).digest("base64url")}"`,
    };
  files.set(path, entry);
  return entry;
}
// Bundled snapshots are read from disk once, not on every request.
const snapshots = new Map();
const snapshot = (name) => {
  if (!snapshots.has(name))
    snapshots.set(
      name,
      readFile(new URL(`./data/${name}`, import.meta.url), "utf8")
        .then(JSON.parse)
        .catch(() => null),
    );
  return snapshots.get(name);
};
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".geojson": "application/geo+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
async function remote(url, timeout = 28000, signal) {
  if (
    url.hostname === "overpass-api.de" &&
    /\[(?:highway~|amenity=parking)/.test(url.searchParams.get("data") || "")
  )
    return maps.mapQuery(url.searchParams.get("data"), signal);
  if (url.pathname.startsWith("/route/v1/driving/")) {
    const [start, end] = url.pathname.split("/").at(-1).split(";");
    return maps.route(start, end, signal);
  }
  const key = url.toString(),
    prior = cache.get(key);
  if (prior && Date.now() - prior.time < 86400000) return prior.data;
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    headers: { Accept: "application/json", "User-Agent": "JapanDrivePrototype/0.5 (local preview)" },
  });
  if (!response.ok)
    throw new Error(`지도 서비스 응답 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`);
  const data = await response.json();
  if (data.remark) throw new Error("지도 요청이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
  cache.set(key, { data, time: Date.now() });
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return data;
}

export const createRequestHandler =
  (request = remote) =>
  async (req, res) => {
    const requestAbort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) requestAbort.abort();
    });
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      if (url.pathname === "/api/overpass") {
        const query = url.searchParams.get("data");
        if (!query || query.length > 12000 || !query.startsWith("[out:json]"))
          throw new Error("잘못된 지도 요청입니다.");
        const preview = await snapshot("preview-cache.json");
        if (preview?.query === query) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(preview.roads));
          return;
        }
        if (query.includes("[highway~")) {
          const secondary = await snapshot("signal-roads.json");
          const boxes = (q) =>
            [...q.matchAll(/way\(([\d.,-]+)\)/g)].map((m) =>
              m[1]
                .split(",")
                .map((n) => Number(n).toFixed(7))
                .join(","),
            );
          const requested = boxes(query),
            sources = [preview, secondary].filter(Boolean),
            available = new Set(sources.flatMap((s) => boxes(s.query)));
          if (requested.length && requested.every((b) => available.has(b))) {
            const elements = [
              ...new Map(
                sources.flatMap((s) => s.roads.elements).map((e) => [e.type + "/" + e.id, e]),
              ).values(),
            ];
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ elements }));
            return;
          }
        }
        const upstream = new URL("https://overpass-api.de/api/interpreter");
        upstream.searchParams.set("data", query);
        // Road and parking lookups are handled by the map service, which
        // caches per tile and limits its own upstream requests, so players
        // never wait in one shared line. Other queries stay serialised.
        const handled = /\[(?:highway~|amenity=parking)/.test(query);
        let data;
        if (handled) data = await request(upstream, 28000, requestAbort.signal);
        else {
          const pending = queue.then(() => {
            requestAbort.signal.throwIfAborted();
            return request(upstream, 28000, requestAbort.signal);
          });
          queue = pending.catch(() => {});
          data = await pending;
        }
        if (res.destroyed) return;
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }
      // Lets the page confirm it is talking to this game's server, not another
      // program that happens to use the same port.
      if (url.pathname === "/api/health") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ app: "japan-drive", version: "0.6" }));
        return;
      }
      if (url.pathname === "/api/route") {
        const start = url.searchParams.get("start"),
          end = url.searchParams.get("end");
        const valid = (value) =>
          /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value || "") &&
          value.split(",").every((x) => Number.isFinite(Number(x)));
        if (!valid(start) || !valid(end)) throw new Error("출발지와 목적지 좌표를 확인해 주세요.");
        const training = await snapshot("training-routes.json");
        const same = (s, coords) => s.split(",").every((v, i) => Math.abs(Number(v) - coords[i]) < 1e-7);
        const saved = training?.routes.find((r) => same(start, r.start) && same(end, r.end));
        if (saved) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(saved.data));
          return;
        }
        const preview = await snapshot("preview-cache.json");
        if (preview?.start === start && preview?.end === end) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(preview.route));
          return;
        }
        const upstream = new URL(`https://router.project-osrm.org/route/v1/driving/${start};${end}`);
        upstream.search = "overview=full&geometries=geojson&steps=true";
        const data = await request(upstream, 28000, requestAbort.signal);
        if (res.destroyed) return;
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }
      const path = resolve(
        root,
        "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
      );
      const file = path.startsWith(root.endsWith(sep) ? root : root + sep) ? await staticFile(path) : null;
      if (!file) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const headers = {
        "Content-Type": `${types[extname(path)] || "application/octet-stream"}; charset=utf-8`,
        "Cache-Control": "no-cache",
        ETag: file.etag,
        Vary: "Accept-Encoding",
      };
      if (req.headers?.["if-none-match"] === file.etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      const gzip = file.gzip && /\bgzip\b/.test(req.headers?.["accept-encoding"] || "");
      res.writeHead(200, gzip ? { ...headers, "Content-Encoding": "gzip" } : headers);
      res.end(gzip ? file.gzip : file.bytes);
    } catch (error) {
      if (res.destroyed) return;
      if (!res.headersSent)
        res.writeHead(error.code === "ENOENT" ? 404 : 502, {
          "Content-Type": "application/json; charset=utf-8",
        });
      res.end(JSON.stringify({ error: error.message }));
    }
  };
// Start on port 8000, or the next free port if another program already uses
// it. With --open the browser is opened at the address actually in use.
export function listen(server, port = 8000, last = 8010, host = "127.0.0.1") {
  return new Promise((done, fail) => {
    const attempt = (p) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && p < last) {
          console.log(`포트 ${p}은(는) 다른 프로그램이 사용 중입니다. ${p + 1}번으로 시도합니다.`);
          attempt(p + 1);
        } else fail(error);
      };
      const onListening = () => {
        server.off("error", onError);
        done(p);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(p, host);
    };
    attempt(port);
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // HOST=0.0.0.0 shares the game with other PCs on the same network
  // (start-classroom-server.bat). The default only serves this PC.
  const host = process.env.HOST || "127.0.0.1",
    server = http.createServer(createRequestHandler());
  server.keepAliveTimeout = 5000;
  server.headersTimeout = 10000;
  const port = await listen(server, Number(process.env.PORT) || 8000, 8010, host);
  const address = `http://127.0.0.1:${port}`;
  console.log(`JAPAN DRIVE: ${address}`);
  if (host === "0.0.0.0") {
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal)
      .map((n) => `http://${n.address}:${port}`);
    console.log("같은 네트워크의 다른 PC에서는 아래 주소로 접속하세요:");
    for (const a of lan) console.log("  " + a);
    console.log("Windows 방화벽 허용 창이 뜨면 '개인 네트워크'를 허용하세요.");
  }
  console.log("이 창을 닫으면 게임 서버가 꺼집니다.");
  if (process.argv.includes("--open")) {
    const { spawn } = await import("node:child_process");
    const [command, args] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", address]]
        : process.platform === "darwin"
          ? ["open", [address]]
          : ["xdg-open", [address]];
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  }
}

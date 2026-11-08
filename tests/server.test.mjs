import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequestHandler } from "../server.mjs";
class Response extends EventEmitter {
  headersSent = false;
  destroyed = false;
  writableEnded = false;
  writes = 0;
  writeHead(status) {
    assert.equal(this.headersSent, false, "response headers may only be sent once");
    this.status = status;
    this.headersSent = true;
    this.writes++;
  }
  end(body) {
    this.body = String(body);
    this.writableEnded = true;
  }
}
test("a rejected map request returns an error once and the next page request still succeeds", async () => {
  const handler = createRequestHandler(async () => {
    throw new Error("지도 서비스 응답 오류");
  });
  const failed = new Response();
  await handler(
    { method: "GET", url: "/api/overpass?" + new URLSearchParams({ data: "[out:json];node(1);out;" }) },
    failed,
  );
  assert.equal(failed.status, 502);
  assert.equal(failed.writes, 1);
  assert.equal(JSON.parse(failed.body).error, "지도 서비스 응답 오류");
  const next = new Response();
  await handler({ method: "GET", url: "/" }, next);
  assert.equal(next.status, 200);
  assert.match(next.body, /KEEP LEFT/);
});
test("cancelling a map preparation request releases the queue for the next request", async () => {
  let started;
  const ready = new Promise((resolve) => (started = resolve));
  const handler = createRequestHandler(async (_url, _timeout, signal) => {
    started();
    await new Promise((resolve, reject) =>
      signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), {
        once: true,
      }),
    );
  });
  const cancelled = new Response(),
    pending = handler(
      { method: "GET", url: "/api/overpass?" + new URLSearchParams({ data: "[out:json];node(2);out;" }) },
      cancelled,
    );
  await ready;
  cancelled.destroyed = true;
  cancelled.emit("close");
  await pending;
  assert.equal(cancelled.writes, 0);
  const second = createRequestHandler(async () => ({ elements: [] })),
    reply = new Response();
  await second(
    { method: "GET", url: "/api/overpass?" + new URLSearchParams({ data: "[out:json];node(3);out;" }) },
    reply,
  );
  assert.equal(reply.status, 200);
});

test("the server identifies itself and moves to the next port when 8000 is taken", async () => {
  const http = await import("node:http");
  const { createRequestHandler, listen } = await import("../server.mjs");
  const blocker = http.createServer((_q, r) => r.end("<html>other app</html>"));
  const first = await listen(blocker, 18600, 18610);
  const game = http.createServer(createRequestHandler());
  const port = await listen(game, first, 18610);
  assert.equal(port, first + 1);
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(health.app, "japan-drive");
  game.closeAllConnections();
  blocker.closeAllConnections();
  await new Promise((r) => game.close(r));
  await new Promise((r) => blocker.close(r));
});

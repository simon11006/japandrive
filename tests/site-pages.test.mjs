import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  renderLanding,
  renderSitemap,
  renderRobots,
  normalizeSiteUrl,
} from "../site-pages.mjs";
import { createRequestHandler } from "../server.mjs";
import { EventEmitter } from "node:events";
const courses = JSON.parse(
  await readFile(
    new URL("../data/driving-courses.json", import.meta.url),
    "utf8",
  ),
).courses;
test("both introductions contain crawlable real course copy and language-specific play links", () => {
  for (const lang of ["ko", "en"]) {
    const html = renderLanding({ lang, courses });
    assert.ok(html.startsWith(`<!doctype html><html lang="${lang}"`));
    assert.equal(
      (html.match(/class="road-card"/g) || []).length,
      courses.length,
    );
    assert.ok(html.includes(`../?lang=${lang}`));
    assert.ok(html.includes('href="../ko/"'));
    assert.ok(html.includes('href="../en/"'));
    assert.ok(!html.includes('rel="canonical"'));
    assert.ok(!html.includes("hreflang="));
    assert.ok(!html.includes("example.com"));
    const schema = JSON.parse(html.match(/application\/ld\+json">([^<]+)</)[1]);
    assert.equal(schema["@type"], "VideoGame");
    assert.equal(schema.isAccessibleForFree, true);
    assert.ok(!schema.aggregateRating);
    if (lang === "en")
      assert.ok(
        !/[가-힣]/.test(html.replaceAll("한국어", "")),
        html.match(/[가-힣][^<]*/g)?.join("\n"),
      );
  }
});
test("one official base activates reciprocal hreflang, canonical and absolute sitemap on either hosting layout", () => {
  for (const siteUrl of [
    "https://drive.example/",
    "https://owner.github.io/drive/",
  ]) {
    const html = renderLanding({
      lang: "ko",
      courses,
      siteUrl,
      verification: "test-token",
    });
    assert.ok(html.includes(`rel="canonical" href="${siteUrl}ko/"`));
    assert.ok(html.includes(`hreflang="en" href="${siteUrl}en/"`));
    assert.ok(html.includes("google-site-verification"));
    const sitemap = renderSitemap(siteUrl);
    assert.ok(sitemap.includes(`<loc>${siteUrl}ko/</loc>`));
    assert.ok(sitemap.includes(`<loc>${siteUrl}en/</loc>`));
    assert.ok(renderRobots(siteUrl).includes(`Sitemap: ${siteUrl}sitemap.xml`));
  }
  assert.equal(renderSitemap(""), null);
  assert.ok(!renderRobots("").includes("Sitemap:"));
  assert.throws(() => normalizeSiteUrl("javascript:alert(1)"));
  assert.throws(() => normalizeSiteUrl("https://user:pass@host/"));
});
test("preview pages cannot be indexed and metadata escapes quotes", () => {
  const html = renderLanding({
    courses,
    preview: true,
    verification: '"><script>bad</script>',
  });
  assert.ok(html.includes("noindex,follow"));
  assert.ok(!html.includes("<script>bad</script>"));
  assert.ok(renderRobots("", true).includes("Disallow: /"));
});
test("local preview serves both introduction directories as HTML", async () => {
  for (const url of ["/ko/", "/en/"]) {
    const result = Object.assign(new EventEmitter(), {
      headersSent: false,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
        this.headersSent = true;
      },
      end(body) {
        this.body = String(body);
      },
    });
    await createRequestHandler()({ method: "GET", url, headers: {} }, result);
    assert.equal(result.status, 200);
    assert.ok(result.headers["Content-Type"].startsWith("text/html"));
    assert.ok(result.body.includes("KEEP LEFT"));
  }
});

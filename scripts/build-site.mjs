import { readFile, writeFile, mkdir, readdir, cp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderLanding,
  renderRobots,
  renderSitemap,
  normalizeSiteUrl,
  seoHead,
} from "../site-pages.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(join(root, "site.config.json"), "utf8"),
);
const siteUrl = normalizeSiteUrl(process.env.SITE_URL || config.siteUrl);
const verification =
  process.env.GOOGLE_SITE_VERIFICATION ||
  config.searchConsoleVerification ||
  "";
const preview = !!process.env.CONTEXT && process.env.CONTEXT !== "production";
const courses = JSON.parse(
  await readFile(join(root, "data/driving-courses.json"), "utf8"),
).courses;
const pagesOnly = process.argv.includes("--pages-only");
const out = pagesOnly ? root : join(root, "_site");
if (!pagesOnly) {
  // Only the fixed build directory can be removed. Never accept a user path.
  if (resolve(out) !== resolve(root, "_site")) throw Error("Unsafe build path");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const name = entry.name;
    const assetDir = ["data", "vendor", "references", "screenshots"].includes(
      name,
    );
    const runtime =
      !entry.isDirectory() &&
      (/\.(?:html|css|js|mjs|svg)$/.test(name) || name === "manifest.json") &&
      !["server.mjs", "site-pages.mjs"].includes(name);
    if (!assetDir && !runtime) continue;
    await cp(join(root, name), join(out, name), {
      recursive: true,
      filter: (path) =>
        !/[\\/]data[\\/](?:course-sources|service-cache)(?:[\\/]|$)/.test(path),
    });
  }
  let game = await readFile(join(out, "index.html"), "utf8");
  if (siteUrl) {
    const meta = seoHead({
      lang: "ko",
      title: "KEEP LEFT · Left-side driving game",
      description: "Short driving courses in Japan, Australia and New Zealand.",
      siteUrl,
      verification,
      preview,
      path: "",
    })
      .replace(/<link rel="alternate"[^>]*>/g, "")
      .replace(/<meta name="description"[^>]*>/, "");
    game = game.replace("</head>", meta + "\n</head>");
  } else if (preview)
    game = game.replace(
      "</head>",
      '<meta name="robots" content="noindex,follow">\n</head>',
    );
  await writeFile(join(out, "index.html"), game);
  await writeFile(join(out, ".nojekyll"), "");
}
for (const lang of ["ko", "en"]) {
  await mkdir(join(out, lang), { recursive: true });
  await writeFile(
    join(out, lang, "index.html"),
    renderLanding({ lang, courses, siteUrl, verification, preview }),
  );
}
await writeFile(join(out, "robots.txt"), renderRobots(siteUrl, preview));
const sitemap = renderSitemap(siteUrl);
if (sitemap && !preview) await writeFile(join(out, "sitemap.xml"), sitemap);
else await rm(join(out, "sitemap.xml"), { force: true });
console.log(
  `Built ${courses.length} courses + Korean/English introductions. ${siteUrl ? "Canonical host: " + siteUrl : "Official URL unset: canonical/hreflang/sitemap activation deferred."}`,
);

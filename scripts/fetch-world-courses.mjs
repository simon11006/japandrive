import { readFile, writeFile, mkdir } from "node:fs/promises";
import { coreGeometry } from "../map-core.mjs";
import { WORLD_AREAS } from "./world-course-definitions.mjs";
await mkdir("data/course-sources", { recursive: true });
for (const area of WORLD_AREAS) {
  const path = `data/course-sources/${area.id}-geometry.json`;
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    console.log(area.id, "cached", data.elements.length);
    continue;
  } catch {}
  const url =
    "https://api.openstreetmap.org/api/0.6/map.json?bbox=" +
    area.bbox.join(",");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KeepLeft/0.14 (+https://github.com/simon11006/japandrive)",
    },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw Error(`${area.id}: HTTP ${response.status}`);
  const data = await response.json();
  const source = {
    version: 0.6,
    source: "© OpenStreetMap contributors",
    elements: coreGeometry(data).elements,
    survey: { ...area, url, retrievedAt: new Date().toISOString() },
  };
  await writeFile(path, JSON.stringify(source));
  console.log(area.id, source.elements.length, "features");
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildIndex, entriesFromOsm, search, parseLocation, normalize } from "../place-search.mjs";

test("place search finds island places by Japanese, English and Korean names", async () => {
  const pois = JSON.parse(await readFile(new URL("../data/okinawa-pois.json", import.meta.url), "utf8"));
  const index = buildIndex([
    { id: "ref/churaumi", name: "츄라우미 수족관", names: ["沖縄美ら海水族館", "Okinawa Churaumi Aquarium"], kind: "aquarium", lat: 26.694, lon: 127.878, recommended: true },
    ...entriesFromOsm(pois.elements),
  ]);
  assert.ok(index.count > 1000);
  assert.equal(search(index, "츄라우미")[0].name, "츄라우미 수족관");
  assert.equal(search(index, "美ら海")[0].name, "츄라우미 수족관");
  assert.equal(search(index, "churaumi")[0].name, "츄라우미 수족관");
  // Katakana and hiragana match each other.
  assert.equal(normalize("ホテル"), normalize("ほてる"));
  // A Korean type word finds places of that kind.
  const food = search(index, "식당", { limit: 5 });
  assert.equal(food.length, 5);
  assert.ok(food.every((r) => r.kindName === "식당"));
});

test("coordinates and map-app links paste straight in", () => {
  assert.deepEqual(parseLocation("26.2124, 127.6792"), { lat: 26.2124, lon: 127.6792 });
  assert.deepEqual(parseLocation("https://www.google.com/maps/place/x/@26.3346,127.7997,17z/data=!3d26.33461!4d127.79972"), {
    lat: 26.33461,
    lon: 127.79972,
  });
  assert.deepEqual(parseLocation("https://maps.google.com/?q=26.5,127.9"), { lat: 26.5, lon: 127.9 });
  assert.deepEqual(parseLocation("https://www.google.com/maps/@26.21,127.68,15z"), { lat: 26.21, lon: 127.68 });
  assert.equal(parseLocation("나하 공항"), null);
});

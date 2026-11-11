export function decodeElevation(r, g, b) {
  const value = r * 65536 + g * 256 + b;
  return value === 8388608 ? null : (value < 8388608 ? value : value - 16777216) * 0.01;
}
export function slippyPixel(lon, lat, z) {
  const n = 2 ** z;
  return {
    x: ((lon + 180) / 360) * n * 256,
    y: ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256,
  };
}
let tilePromise;
async function loadTiles() {
  const tiles = new Map();
  let atlas = { tiles: [] };
  try {
    atlas = await fetch(new URL("./data/terrain-atlas.json", import.meta.url)).then((r) => r.json());
  } catch {}
  try {
    const courses=await fetch(new URL('./data/course-terrain.json',import.meta.url)).then(r=>r.json());
    atlas.tiles.push(...courses.tiles);
  } catch {}
  await Promise.all(
    (atlas.tiles || []).map(async (t) => {
      try {
        const image = new Image();
        image.src = new URL(t.path, import.meta.url).href;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        tiles.set(`${t.z}:${t.x}:${t.y}`, ctx.getImageData(0, 0, 256, 256).data);
      } catch {}
    }),
  );
  await Promise.all(
    [14011, 14012].map(async (x) => {
      try {
        const image = new Image();
        image.src = new URL(`references/dem-14-${x}-6931.png`, import.meta.url).href;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        tiles.set(`14:${x}:6931`, ctx.getImageData(0, 0, 256, 256).data);
      } catch {}
    }),
  );
  return tiles;
}
export async function loadTerrain(proj) {
  const tiles=await (tilePromise??=loadTiles());
  const sample = (lon, lat, z) => {
    const p = slippyPixel(lon, lat, z),
      x = Math.floor(p.x / 256),
      y = Math.floor(p.y / 256),
      data = tiles.get(`${z}:${x}:${y}`);
    if (!data) return null;
    const px = Math.max(0, Math.min(254, p.x - x * 256)),
      py = Math.max(0, Math.min(254, p.y - y * 256)),
      ix = Math.floor(px),
      iy = Math.floor(py),
      fx = px - ix,
      fy = py - iy;
    const at = (dx, dy) => {
      const i = ((iy + dy) * 256 + ix + dx) * 4;
      return decodeElevation(data[i], data[i + 1], data[i + 2]) ?? 0;
    };
    return (
      at(0, 0) * (1 - fx) * (1 - fy) +
      at(1, 0) * fx * (1 - fy) +
      at(0, 1) * (1 - fx) * fy +
      at(1, 1) * fx * fy
    );
  };
  return (point) => {
    const [lon, lat] = proj.toGeo(point),
      base = sample(lon, lat, 11) ?? 0,
      high = sample(lon, lat, 14);
    if (high == null) return base;
    return high;
  };
}

// Place search for departures and destinations, like a map app's search box.
// Sources: recommended places (with Korean names), bundled island places,
// and the island-wide places of the offline map pack (OpenStreetMap).

export const KIND_NAMES = {
  parking: "주차장",
  restaurant: "식당",
  fast_food: "패스트푸드",
  cafe: "카페",
  ice_cream: "디저트",
  food_court: "푸드코트",
  bar: "술집",
  pub: "술집",
  marketplace: "시장",
  fuel: "주유소",
  charging_station: "충전소",
  car_rental: "렌터카",
  toilets: "화장실",
  convenience: "편의점",
  supermarket: "슈퍼마켓",
  mall: "쇼핑몰",
  department_store: "백화점",
  gift: "기념품",
  seafood: "수산물",
  bakery: "빵집",
  car: "자동차 판매",
  hotel: "호텔",
  guest_house: "게스트하우스",
  hostel: "호스텔",
  motel: "모텔",
  apartment: "숙소",
  camp_site: "캠핑장",
  attraction: "관광지",
  museum: "박물관",
  viewpoint: "전망대",
  theme_park: "테마파크",
  aquarium: "수족관",
  zoo: "동물원",
  information: "안내소",
  picnic_site: "피크닉장",
  park: "공원",
  beach_resort: "해변",
  water_park: "워터파크",
  golf_course: "골프장",
  marina: "마리나",
  sports_centre: "체육시설",
  stadium: "경기장",
  beach: "해변",
  historic: "유적",
  aerodrome: "공항",
  stay: "숙소",
  food: "식당",
  sight: "관광지",
  shop: "쇼핑·휴게소",
  transport: "공항·렌터카",
};

export function kindOf(tags = {}) {
  return (
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    (tags.natural === "beach" ? "beach" : null) ||
    (tags.historic ? "historic" : null) ||
    (tags.aeroway === "aerodrome" ? "aerodrome" : null) ||
    "place"
  );
}

// Lower-case, full-width → half-width, katakana → hiragana, no spaces/punctuation.
export function normalize(text = "") {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s·・\-_.,()（）「」'"’]/g, "");
}

export function buildIndex(entries) {
  const seen = new Set(),
    items = [];
  for (const e of entries) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon) || !e.name) continue;
    const key = e.id || `${e.name}@${e.lat.toFixed(4)},${e.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const names = [...new Set([e.name, ...(e.names || [])].filter(Boolean))];
    items.push({
      ...e,
      names,
      keys: names.map(normalize),
      // A type word ("호텔", "hotel", "주차장") also finds places of that kind.
      kindKeys: [normalize(e.kind), normalize(KIND_NAMES[e.kind] || "")].filter(Boolean),
    });
  }
  return { items, count: items.length };
}

// Entries from Overpass "out center tags" elements.
export function entriesFromOsm(elements = []) {
  const out = [];
  for (const el of elements) {
    const t = el.tags || {},
      lat = el.lat ?? el.center?.lat,
      lon = el.lon ?? el.center?.lon;
    const names = [t["name:ko"], t.name, t["name:ja"], t["name:en"], t["name:ja-Latn"], t.alt_name, t.official_name, t.brand]
      .filter(Boolean);
    const kind = kindOf(t);
    // Unnamed parking lots are still useful destinations near other places,
    // but only named places are listed in search.
    if (!names.length) continue;
    out.push({
      id: `${el.type}/${el.id}`,
      name: t["name:ko"] || t.name || names[0],
      names,
      kind,
      lat,
      lon,
      source: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
  }
  return out;
}

const metres = (a, b) =>
  Math.hypot((b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180), (b.lat - a.lat) * 111320);

export function search(index, query, { near = null, limit = 8 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const words = String(query).trim().toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
  const scored = [];
  for (const item of index.items) {
    let score = 0;
    for (const k of item.keys) {
      if (k === q) score = Math.max(score, 100);
      else if (k.startsWith(q)) score = Math.max(score, 70);
      else if (k.includes(q)) score = Math.max(score, 45);
      else if (words.length > 1 && words.every((w) => k.includes(w))) score = Math.max(score, 35);
    }
    if (!score && item.kindKeys.some((k) => k === q || (q.length >= 2 && k.startsWith(q)))) score = 25;
    if (!score) continue;
    if (item.recommended) score += 30;
    if (near) score -= Math.min(20, metres(near, item) / 2500);
    scored.push([score, item]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length)
    .slice(0, limit)
    .map(([, item]) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      kindName: KIND_NAMES[item.kind] || "장소",
      lat: item.lat,
      lon: item.lon,
      source: item.source,
      recommended: !!item.recommended,
      alias: item.names.find((n) => n !== item.name) || null,
    }));
}

// Coordinates typed or pasted from a map app: "26.21, 127.68",
// ".../@26.21,127.68,17z", "?q=26.21,127.68", "!3d26.21!4d127.68".
export function parseLocation(text = "") {
  const s = String(text).trim();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (!m) continue;
    let lat = Number(m[1]),
      lon = Number(m[2]);
    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

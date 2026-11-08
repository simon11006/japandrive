import { t } from "./i18n.mjs";
// In-car navigation screen in the familiar style of a phone map app: light
// map, blue route, green turn banner on top, arrival bar at the bottom.
// The map data is OpenStreetMap; only the look follows phone navigation.

export const NAV_COLORS = {
  land: "#f1f3f4",
  building: "#e3e4e6",
  buildingEdge: "#d3d5d8",
  parking: "#dbe7f6",
  parkingEdge: "#b6cbe8",
  roadCasing: "#d0d3d8",
  road: "#ffffff",
  majorCasing: "#f2c14e",
  major: "#fde293",
  motorwayCasing: "#e8a33a",
  motorway: "#fbd07a",
  routeCasing: "#1558b0",
  route: "#4b8cf5",
  car: "#1a73e8",
  banner: "#0f7a3d",
  bannerDark: "#0b6232",
};

const MAJOR = /^(primary|secondary|trunk)(_link)?$/,
  MOTORWAY = /^motorway(_link)?$/;

// Road class order: minor first so major roads draw on top.
export function roadRank(tags = {}) {
  const h = tags.highway || "";
  return MOTORWAY.test(h) ? 3 : MAJOR.test(h) ? 2 : h === "service" ? 0 : 1;
}

export function drawNavMap(c, w, h, scale, { roads, features, route, goal, convert }) {
  c.fillStyle = NAV_COLORS.land;
  c.fillRect(0, 0, w, h);
  const path = (points) => {
    c.beginPath();
    points.forEach((p, i) => {
      const q = convert(p);
      i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
    });
  };
  for (const f of features) {
    path(f.points);
    c.closePath();
    const parking = f.tags.amenity === "parking";
    c.fillStyle = parking ? NAV_COLORS.parking : NAV_COLORS.building;
    c.strokeStyle = parking ? NAV_COLORS.parkingEdge : NAV_COLORS.buildingEdge;
    c.lineWidth = 1;
    c.fill();
    c.stroke();
    if (parking && scale > 1.5) {
      const q = convert(f.center);
      c.fillStyle = "#4a7fd0";
      c.font = "bold 18px sans-serif";
      c.textAlign = "center";
      c.fillText("P", q.x, q.y + 6);
    }
  }
  c.lineCap = "round";
  c.lineJoin = "round";
  const sorted = [...roads].sort((a, b) => roadRank(a.tags) - roadRank(b.tags));
  const widthOf = (r) => Math.max(3, scale * (roadRank(r.tags) >= 2 ? 7 : roadRank(r.tags) === 0 ? 3.2 : 5));
  for (const pass of ["casing", "fill"])
    for (const r of sorted) {
      const rank = roadRank(r.tags),
        width = widthOf(r);
      path(r.points);
      c.lineWidth = pass === "casing" ? width + 3 : width;
      c.strokeStyle =
        pass === "casing"
          ? rank === 3
            ? NAV_COLORS.motorwayCasing
            : rank === 2
              ? NAV_COLORS.majorCasing
              : NAV_COLORS.roadCasing
          : rank === 3
            ? NAV_COLORS.motorway
            : rank === 2
              ? NAV_COLORS.major
              : NAV_COLORS.road;
      c.stroke();
    }
  if (route.length > 1) {
    path(route);
    c.lineWidth = Math.max(11, scale * 5.5) + 4;
    c.strokeStyle = NAV_COLORS.routeCasing;
    c.stroke();
    c.lineWidth = Math.max(11, scale * 5.5);
    c.strokeStyle = NAV_COLORS.route;
    c.stroke();
  }
  if (goal) {
    const q = convert(goal);
    pin(c, q.x, q.y);
  }
}

function pin(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#ea4335";
  c.strokeStyle = "#b3261e";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(-4, -10, -15, -16, -15, -28);
  c.arc(0, -28, 15, Math.PI, 0);
  c.bezierCurveTo(15, -16, 4, -10, 0, 0);
  c.fill();
  c.stroke();
  c.fillStyle = "#fff";
  c.font = "bold 16px sans-serif";
  c.textAlign = "center";
  c.fillText("P", 0, -22);
  c.restore();
}

// Blue navigation chevron for the car, heading-up.
export function drawCarMarker(c, x, y, size = 18) {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#1a73e844";
  c.beginPath();
  c.arc(0, 0, size * 1.9, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = NAV_COLORS.car;
  c.strokeStyle = "#ffffff";
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(0, -size);
  c.lineTo(size * 0.78, size * 0.85);
  c.lineTo(0, size * 0.42);
  c.lineTo(-size * 0.78, size * 0.85);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

// White manoeuvre arrow: straight, left/right, slight, sharp, U-turn, arrive.
export function drawTurnIcon(c, x, y, s, maneuver = {}) {
  const m = maneuver.modifier || "",
    type = maneuver.type || "";
  c.save();
  c.translate(x, y);
  c.strokeStyle = "#fff";
  c.fillStyle = "#fff";
  c.lineWidth = s * 0.16;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (type === "arrive") {
    pin(c, 0, s * 0.55);
    c.restore();
    return;
  }
  const dir = /left/.test(m) ? -1 : /right/.test(m) ? 1 : 0;
  const head = (hx, hy, angle) => {
    c.save();
    c.translate(hx, hy);
    c.rotate(angle);
    c.beginPath();
    c.moveTo(0, -s * 0.24);
    c.lineTo(s * 0.22, s * 0.06);
    c.lineTo(-s * 0.22, s * 0.06);
    c.closePath();
    c.fill();
    c.restore();
  };
  c.beginPath();
  if (m === "uturn") {
    c.moveTo(s * 0.22, s * 0.55);
    c.lineTo(s * 0.22, -s * 0.1);
    c.arc(-s * 0.05, -s * 0.1, s * 0.27, 0, Math.PI, true);
    c.lineTo(-s * 0.32, s * 0.2);
    c.stroke();
    head(-s * 0.32, s * 0.3, Math.PI);
  } else if (!dir) {
    c.moveTo(0, s * 0.55);
    c.lineTo(0, -s * 0.3);
    c.stroke();
    head(0, -s * 0.4, 0);
  } else {
    const angle = /slight/.test(m) ? Math.PI / 4 : /sharp/.test(m) ? (Math.PI * 3) / 4 : Math.PI / 2;
    const ex = dir * Math.sin(angle) * s * 0.42,
      ey = -s * 0.05 - Math.cos(angle) * s * 0.42;
    c.moveTo(0, s * 0.55);
    c.lineTo(0, -s * 0.05);
    c.lineTo(ex, ey);
    c.stroke();
    head(ex + dir * Math.sin(angle) * s * 0.08, ey - Math.cos(angle) * s * 0.08, dir * angle);
  }
  c.restore();
}

const metres = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} km` : `${Math.max(0, Math.round(n / 10) * 10)} m`);

function fit(c, text, maxWidth, size, weight = "bold") {
  text = t(text);
  let s = size;
  do c.font = `${weight} ${s}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  while (c.measureText(text).width > maxWidth && --s > 12);
}

// Banner and arrival bar drawn over the map.
export function drawNavOverlay(c, w, h, info = {}) {
  const banner = Math.round(h * 0.25);
  c.fillStyle = NAV_COLORS.banner;
  c.fillRect(0, 0, w, banner);
  c.fillStyle = NAV_COLORS.bannerDark;
  c.fillRect(0, 0, banner, banner);
  drawTurnIcon(c, banner / 2, banner / 2, banner * 0.62, info.maneuver);
  c.fillStyle = "#fff";
  c.textAlign = "left";
  if (info.parking) {
    fit(c, "목적지 주차장", w - banner - 30, Math.round(banner * 0.36));
    c.fillText(t("목적지 주차장"), banner + 18, banner * 0.47);
    fit(c, info.instruction || "", w - banner - 30, Math.round(banner * 0.2), "normal");
    c.fillText(t(info.instruction || ""), banner + 18, banner * 0.8);
  } else {
    fit(c, metres(info.toTurn ?? 0), w * 0.5, Math.round(banner * 0.42));
    c.fillText(metres(info.toTurn ?? 0), banner + 18, banner * 0.5);
    const line = [info.action, info.street].filter(Boolean).join(" · ");
    fit(c, line, w - banner - 30, Math.round(banner * 0.21), "normal");
    c.fillText(t(line), banner + 18, banner * 0.84);
  }
  // Arrival bar.
  const bar = Math.round(h * 0.17),
    top = h - bar;
  c.fillStyle = "#ffffff";
  c.fillRect(0, top, w, bar);
  c.fillStyle = "#00000014";
  c.fillRect(0, top, w, 2);
  c.textAlign = "left";
  c.fillStyle = "#188038";
  const minutesText = t(info.minutes != null ? `${info.minutes}분` : "");
  fit(c, minutesText, w * 0.3, Math.round(bar * 0.48));
  c.fillText(minutesText, 20, top + bar * 0.62);
  const minutesWidth = c.measureText(minutesText).width;
  c.fillStyle = "#3c4043";
  const detail = [info.remainingMeters != null ? metres(info.remainingMeters) : null, info.eta ? `${info.eta} 도착` : null]
    .filter(Boolean)
    .join(" · ");
  fit(c, t(detail), w * 0.36, Math.round(bar * 0.3), "normal");
  c.fillText(t(detail), 34 + minutesWidth, top + bar * 0.6);
  c.textAlign = "right";
  c.fillStyle = "#5f6368";
  fit(c, info.destination || "", w * 0.32, Math.round(bar * 0.26), "normal");
  c.fillText(t(info.destination || ""), w - 18, top + bar * 0.6);
  // Speed limit sign, Japanese style (red ring), bottom-left above the bar.
  if (info.limit) {
    const r = Math.round(h * 0.075),
      x = 18 + r,
      y = top - 14 - r;
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#d93025";
    c.lineWidth = r * 0.2;
    c.beginPath();
    c.arc(x, y, r * 0.86, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#1a3c8c";
    c.textAlign = "center";
    c.font = `bold ${Math.round(r * 0.95)}px Arial, sans-serif`;
    c.fillText(String(info.limit), x, y + r * 0.34);
  }
  if (info.speed != null) {
    const r = Math.round(h * 0.075),
      x = 18 + r + (info.limit ? r * 2 + 10 : 0),
      y = top - 14 - r;
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#dadce0";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = info.limit && info.speed > info.limit ? "#d93025" : "#202124";
    c.textAlign = "center";
    c.font = `bold ${Math.round(r * 0.8)}px Arial, sans-serif`;
    c.fillText(String(info.speed), x, y + r * 0.2);
    c.font = `${Math.round(r * 0.36)}px Arial, sans-serif`;
    c.fillText("km/h", x, y + r * 0.62);
  }
  c.textAlign = "left";
}

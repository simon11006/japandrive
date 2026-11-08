// Posted limits take precedence. Unrecorded street signs are never invented.
export function mappedSpeedLimit(tags = {}, heading = 0, wayHeading = 0) {
  const direction = Math.cos(heading - wayHeading) >= 0 ? "forward" : "backward";
  const raw = tags["maxspeed:" + direction] ?? tags.maxspeed;
  if (raw != null && /^\d+(?:\.\d+)?(?:\s*(?:km\/h|kph))?$/.test(String(raw).trim()))
    return { value: Number.parseFloat(raw), source: "지도에 등록된 제한속도" };
  if (tags["zone:maxspeed"] === "JP:30" || tags["maxspeed:type"] === "JP:zone30")
    return { value: 30, source: "존 30" };
  // Since 2026-09-01, unmarked general roads without a centre line have a
  // 30 km/h statutory limit. Require an explicit mapping of that condition.
  if (tags.centreline === "no" && !/^(motorway|trunk)/.test(tags.highway || ""))
    return { value: 30, source: "중앙선 없는 생활도로 · 2026.09 시행" };
  return { value: null, source: "현장 제한속도 표지를 확인하세요" };
}
export const VIOLATIONS = {
  speeding: { name: "제한속도 초과", penalty: 5 },
  red: { name: "신호 위반", penalty: 15 },
  wrongWay: { name: "역주행·대향차로 주행", penalty: 10 },
  stop: { name: "일시정지 미준수", penalty: 10 },
  collision: { name: "차량·시설 접촉", penalty: 15 },
  camera: { name: "단속카메라 통과 중 속도 초과", penalty: 0 },
  blinker: { name: "방향지시등 미사용", penalty: 5 },
};
export class DrivingScore {
  constructor() {
    this.events = [];
    this.latches = new Map();
  }
  get score() {
    return Math.max(0, 100 - this.events.reduce((n, e) => n + e.penalty, 0));
  }
  add(type, time, detail = "") {
    if (!VIOLATIONS[type]) return null;
    const prior = this.events.findLast((e) => e.type === type);
    if (prior && time - prior.time < 3) return null;
    const event = { type, time, detail, ...VIOLATIONS[type] };
    this.events.push(event);
    return event;
  }
  sustained(type, condition, dt, time, seconds = 2) {
    const state = this.latches.get(type) || { held: 0, clear: 0, fired: false };
    if (condition) {
      state.held += dt;
      state.clear = 0;
    } else {
      state.clear += dt;
      state.held = 0;
      if (state.clear > 2) state.fired = false;
    }
    this.latches.set(type, state);
    if (condition && state.held >= seconds && !state.fired) {
      state.fired = true;
      return this.add(type, time);
    }
    return null;
  }
  breakdown() {
    return Object.entries(VIOLATIONS).map(([type, rule]) => ({
      type,
      name: rule.name,
      count: this.events.filter((e) => e.type === type).length,
      penalty: this.events.filter((e) => e.type === type).reduce((n, e) => n + e.penalty, 0),
    }));
  }
}

// A stop sign node applies only to traffic facing it. OSM direction=forward /
// backward is relative to the way the node lies on; signs without a direction
// apply to traffic travelling along that way (not to crossing traffic).
export function stopSignApplies(tags = {}, heading = 0, wayHeading = 0) {
  const c = Math.cos(heading - wayHeading),
    d = String(tags.direction || "").toLowerCase();
  if (d === "forward") return c > 0.5;
  if (d === "backward") return c < -0.5;
  return Math.abs(c) > 0.7;
}

// Japanese road law: signal 30 m before a turn at an intersection.
export const BLINKER_LEAD_METRES = 30;
export function turnSide(maneuver = {}) {
  if (!["turn", "end of road", "fork", "on ramp", "off ramp"].includes(maneuver.type)) return 0;
  const m = maneuver.modifier || "";
  if (/slight/.test(m) && maneuver.type === "turn") return 0;
  return /left/.test(m) ? -1 : /right/.test(m) ? 1 : 0;
}

// Contact is the player's fault when the player's car was moving toward the
// other body; being hit while stopped or by a car from behind is not.
export function playerAtFault(player, other, gear) {
  if (player.speed < 0.3) return false;
  const fx = Math.sin(player.heading) * gear,
    fy = -Math.cos(player.heading) * gear;
  return (other.x - player.x) * fx + (other.y - player.y) * fy > 0;
}

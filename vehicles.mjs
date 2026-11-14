// Dimensions and turning radii use the generation-specific manufacturer
// references below. Trim details and rental availability vary by operator.
// The camera, suspension and pedal response are estimates.
export const VEHICLES = [
  {
    id: "prius",
    name: "토요타 프리우스",
    english: "PRIUS",
    trim: "4세대형 · 2WD · 15인치 기준",
    length: 4.54,
    width: 1.76,
    height: 1.47,
    wheelbase: 2.7,
    frontTrack: 1.53,
    turningRadius: 5.1,
    eyeHeight: 1.1,
    acceleration: 2.5,
    braking: 7.5,
    dashboard: "center-meter",
    bodyType: "승용차", choiceHint: "낮은 시점 · 가벼운 차체",
    description: "낮은 운전 자세, 중앙 계기판. 골목에서 차폭 감각을 익히세요.",
    specification: "https://toyota.jp/ucar/catalog/brand-TOYOTA/car-PRIUS/201512/10101053/",
    interior: "https://global.toyota/en/prius20th/evolution/4th/",
  },
  {
    id: "alphard",
    name: "토요타 알파드",
    english: "ALPHARD",
    trim: "4세대형 · 브라운 실내 · 18인치 기준",
    length: 4.995,
    width: 1.85,
    height: 1.935,
    wheelbase: 3,
    frontTrack: 1.6,
    turningRadius: 5.9,
    eyeHeight: 1.46,
    acceleration: 2.05,
    braking: 7,
    dashboard: "wide",
    bodyType: "승합차", choiceHint: "높은 시점 · 넓은 차체",
    description: "높은 운전 자세, 넉넉한 실내. 큰 차체와 회전 반경을 익히세요.",
    specification: "https://toyota.jp/pages/contents/request/webcatalog/alphard/alphard_main_202511.pdf",
    interior: "https://toyota.jp/alphard/usability/",
  },
  {
    id: "i30", name: "현대 i30", english: "i30", brand: "HYUNDAI",
    trim: "3세대 PD · 호주형 · 17인치 기준",
    length: 4.34, width: 1.795, height: 1.455, wheelbase: 2.65,
    frontTrack: 1.553, turningRadius: 5.3, eyeHeight: 1.12,
    acceleration: 2.4, braking: 7.5, dashboard: "driver-meter",
    bodyType: "해치백", choiceHint: "호주 렌터카 · 짧고 경쾌한 차체",
    description: "짧은 차체와 운전석 계기판. 호주의 도심 골목에서 좌측통행 감각을 익혀보세요.",
    specification: "https://www.hyundai.com/content/dam/hyundai/au/en/models/i30/docs/Hyundai_i30_Hatch_Specifications.pdf",
    interior: "https://www.hyundai.com/worldwide/en/cars/i30/design",
    rentalSource: "https://images.hertz.com/pdfs/Asia_Hertz_Australia_Driving_Guide_KR.pdf",
  },
  {
    id: "cx5", name: "마쓰다 CX-5", english: "CX-5", brand: "MAZDA",
    trim: "2세대 KF · 뉴질랜드형 참고 · 17인치",
    length: 4.575, width: 1.845, height: 1.68, wheelbase: 2.7,
    frontTrack: 1.595, turningRadius: 5.5, eyeHeight: 1.33,
    acceleration: 2.55, braking: 7.2, dashboard: "driver-meter",
    bodyType: "SUV", choiceHint: "뉴질랜드 렌터카 · 높은 시점",
    description: "높은 운전 자세와 곡선형 대시보드. 뉴질랜드의 언덕과 해안길에서 SUV의 차폭을 익혀보세요.",
    specification: "https://www.mazda.co.jp/content/dam/mazda/official/mazda-co-jp/cars/cx-5/common/pdf/cx-5_specification_202207.pdf",
    interior: "https://news.mazdausa.com/vehicles-2022-cx-5",
    rentalSource: "https://christchurchcarrent.co.nz/fleet/mazda-cx-5-skyactiv/",
  },
];

// Convert the published outer-front-wheel radius to the rear-axle-centre
// radius used by the low-speed bicycle model. It is not a body-clearance radius.
export function minimumRearRadius(car) {
  return Math.sqrt(car.turningRadius ** 2 - car.wheelbase ** 2) - car.frontTrack / 2;
}
export function steeringLimit(car) {
  return Math.atan(car.wheelbase / minimumRearRadius(car));
}
// Simplified longitudinal model for automatic cars:
// - gas and brake are pedal positions 0..1 (booleans still work);
// - drive force fades with speed like a real power limit;
// - coasting drag grows with air resistance;
// - in D or R with the brake released the car creeps at walking pace, so
//   the driver must hold the brake at a stop, exactly as in a real car;
// - reverse is slow and gentle. Responses are estimates, not measured data.
export const CREEP_SPEED = 1.7; // m/s, about 6 km/h
export const REVERSE_LIMIT = 4.2; // m/s, about 15 km/h
export const TOP_SPEED = 44; // m/s, about 160 km/h
export function selectGear(state, next, brakeHeld) {
  if (Math.abs(state.speed) >= 0.2) return { ok: false, reason: 'moving' };
  if (!brakeHeld && !state.parkingBrake) return { ok: false, reason: 'brake' };
  return { ok: true, state: { ...state, speed: 0, gear: next < 0 ? -1 : 1 } };
}
export function longitudinal(speed, gear, input, car) {
  const gas = Math.max(0, Math.min(1, Number(input.gas) || 0)),
    brake = Math.max(0, Math.min(1, Number(input.brake) || 0)),
    reverse = gear < 0;
  let a = 0;
  if (gas > 0) {
    const fade = Math.min(1, 14 / (speed + 4));
    a += (reverse ? 1.3 : car.acceleration * (0.25 + 0.75 * fade)) * gas;
  } else a -= 0.65;
  a -= 0.00045 * speed * speed;
  if (input.creep && gas === 0 && speed < CREEP_SPEED) {
    // Idle creep overcomes rolling drag but yields to even light braking.
    a = Math.max(a, Math.min(0.9, (CREEP_SPEED - speed) * 1.4) * (1 - Math.min(1, brake / 0.25)));
  }
  a -= car.braking * brake;
  return a;
}
export function integrateVehicle(state, input, car, dt) {
  // Keyboard input is a steering request, not an instant wheel angle. The
  // low-speed limit follows each car's dimensions; the high-speed envelope is
  // a beginner driving aid, not a claim about measured steering feel.
  const limit = Math.min(steeringLimit(car), Math.atan((3.3 * car.wheelbase) / (state.speed ** 2 + 1)));
  const target = input.steer ? input.steer * limit : state.speed < 0.2 ? state.steer : 0;
  const rate = input.steer ? 0.3 : 0.43;
  const steer = state.steer + Math.max(-dt * rate, Math.min(dt * rate, target - state.steer));
  const cap = state.gear < 0 ? REVERSE_LIMIT : TOP_SPEED;
  const speed = Math.max(0, Math.min(cap, state.speed + longitudinal(state.speed, state.gear, input, car) * dt));
  const velocity = speed * state.gear;
  const yaw = (velocity / car.wheelbase) * Math.tan(steer);
  const angle = state.heading + (yaw * dt) / 2;
  return {
    ...state,
    speed,
    steer,
    heading: state.heading + yaw * dt,
    x: state.x + Math.sin(angle) * velocity * dt,
    y: state.y - Math.cos(angle) * velocity * dt,
  };
}

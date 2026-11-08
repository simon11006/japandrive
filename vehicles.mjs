// Dimensions and minimum outer-front-wheel turning radius: Toyota Japan
// specifications (XW50 Prius 2WD / 40-series Alphard 2WD baseline).
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
    specification: "https://toyota.jp/pages/contents/request/webcatalog/alphard/alphard_main_202511.pdf",
    interior: "https://toyota.jp/alphard/usability/",
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
export function integrateVehicle(state, input, car, dt) {
  // Keyboard input is a steering request, not an instant wheel angle. The
  // low-speed limit still follows Toyota geometry; the high-speed envelope is
  // a beginner driving aid, not a claim about measured Toyota steering feel.
  const limit = Math.min(steeringLimit(car), Math.atan((3.3 * car.wheelbase) / (state.speed ** 2 + 1)));
  const target = input.steer ? input.steer * limit : state.speed < 0.2 ? state.steer : 0;
  const rate = input.steer ? 0.3 : 0.43;
  const steer = state.steer + Math.max(-dt * rate, Math.min(dt * rate, target - state.steer));
  const speed = Math.max(
    0,
    Math.min(
      19,
      state.speed + (input.gas ? car.acceleration : -0.65) * dt - (input.brake ? car.braking * dt : 0),
    ),
  );
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

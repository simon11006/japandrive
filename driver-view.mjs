import * as THREE from "./vendor/three.module.js";

// Driver view model.
//
// Desktop driving simulators (rFactor 2, Assetto Corsa, iRacing, City Car
// Driving, Euro Truck Simulator) all put the camera at the driver's real head
// position and let the player adjust the seat and the field of view. A very
// wide field of view shrinks the cockpit and makes the car feel as if it is
// being driven from the back seat, so the default here is a moderate 86° that
// keeps the driver-side mirror, the meter and the road in a natural scale. The
// passenger-side mirror of a right-hand-drive car sits about 45° to the left;
// it is checked with a glance (Q) or the optional mirror strip, just as a real
// driver moves their eyes and head.
export const VIEW_DEFAULTS = Object.freeze({
  fov: 86,
  seatForward: 0,
  seatHeight: 0,
  mirrorStrip: true,
  lookIntoTurn: true,
});
// Q / E head turn toward a door mirror (radians).
export const GLANCE = 0.8;
export const VIEW_LIMITS = Object.freeze({
  fov: [60, 100],
  seatForward: [-0.1, 0.12],
  seatHeight: [-0.06, 0.08],
});
const clamp = (v, [lo, hi], fallback) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);

export function viewSettings(raw = {}) {
  return {
    fov: clamp(raw.fov, VIEW_LIMITS.fov, VIEW_DEFAULTS.fov),
    seatForward: clamp(raw.seatForward, VIEW_LIMITS.seatForward, VIEW_DEFAULTS.seatForward),
    seatHeight: clamp(raw.seatHeight, VIEW_LIMITS.seatHeight, VIEW_DEFAULTS.seatHeight),
    mirrorStrip: raw.mirrorStrip == null ? VIEW_DEFAULTS.mirrorStrip : Boolean(raw.mirrorStrip),
    lookIntoTurn: raw.lookIntoTurn == null ? VIEW_DEFAULTS.lookIntoTurn : Boolean(raw.lookIntoTurn),
  };
}
export function loadViewSettings() {
  try {
    return viewSettings(JSON.parse(localStorage.getItem("drive-view") || "{}"));
  } catch {
    return viewSettings();
  }
}
export function saveViewSettings(settings) {
  try {
    localStorage.setItem("drive-view", JSON.stringify(viewSettings(settings)));
  } catch {}
}

// Eye point in the vehicle rig's coordinates (x right, y up, -z forward).
export function driverEye(car, layout, settings = VIEW_DEFAULTS) {
  return new THREE.Vector3(
    layout.eyeX,
    car.eyeHeight + (settings.seatHeight || 0),
    layout.eyeZ - (settings.seatForward || 0),
  );
}

// Cap the vertical field on portrait phones: retaining a wide horizontal
// view at 9:19 would show mostly roof and footwell and shrink the road. Both
// door mirrors remain available in the portrait mirror strip.
export function horizontalFov(settings, aspect) {
  const portraitLimit = (2 * Math.atan(Math.tan(38 * Math.PI / 180) * aspect) * 180) / Math.PI;
  return aspect < 0.85 ? Math.min(settings.fov, portraitLimit) : settings.fov;
}
export function verticalFov(settings, aspect) {
  const h = (horizontalFov(settings, aspect) * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI;
}

// Gentle head turn toward the inside of a slow turn, as instructors teach:
// look where you want to go. It fades out above ~30 km/h.
export function lookIntoTurn(steer, speed, limit) {
  if (!limit) return 0;
  const fade = Math.max(0, 1 - speed / 8.5);
  return -(steer / limit) * 0.32 * fade;
}

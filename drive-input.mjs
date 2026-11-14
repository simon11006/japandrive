// Each finger owns its input. Releasing a gear/steering finger must never
// release a brake held by another finger (or a physical keyboard key).
export class DrivingInput {
  constructor() { this.keyboard = new Set(); this.pointers = new Map(); }
  add(key) { this.keyboard.add(key); }
  delete(key) { this.keyboard.delete(key); }
  has(key) { return this.keyboard.has(key) || [...this.pointers.values()].includes(key); }
  press(pointerId, key) { this.pointers.set(pointerId, key); }
  release(pointerId) { this.pointers.delete(pointerId); }
  clear() { this.keyboard.clear(); this.pointers.clear(); }
}

// Activate on contact, including non-primary touch pointers. Mobile browsers
// do not reliably send a compatibility click for the second simultaneous touch.
export function bindDriveAction(button, action) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    action();
  });
  button.addEventListener('click', event => {
    // Enter/Space and assistive technology still have a normal click path.
    if (event.detail === 0) action();
  });
}

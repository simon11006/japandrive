// Cabin sounds, synthesised with the Web Audio API (no audio files).
// A hybrid is almost silent at a standstill; the motor whine and tyre/road
// noise rise with speed. The blinker relay clicks about 85 times a minute, and
// Japanese-market cars beep inside the cabin while R is selected.
export class DriveAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.blinkClock = 0;
    this.blinkLit = false;
    this.reverseClock = 0;
  }
  // Must be called from a user gesture (browsers block audio otherwise).
  start() {
    if (this.context) {
      this.context.resume?.();
      return;
    }
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    const c = (this.context = new AudioContext());
    this.master = c.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(c.destination);
    // Motor/inverter whine.
    this.motor = c.createOscillator();
    this.motor.type = "sawtooth";
    this.motorFilter = c.createBiquadFilter();
    this.motorFilter.type = "bandpass";
    this.motorFilter.Q.value = 6;
    this.motorGain = c.createGain();
    this.motorGain.gain.value = 0;
    this.motor.connect(this.motorFilter).connect(this.motorGain).connect(this.master);
    this.motor.start();
    // Tyre and wind noise: looped pink-ish noise through a low-pass filter.
    const length = c.sampleRate * 2,
      buffer = c.createBuffer(1, length, c.sampleRate),
      data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
      data[i] = last * 6;
    }
    this.noise = c.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.noiseFilter = c.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseGain = c.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);
    this.noise.start();
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }
  tone(frequency, duration, type = "sine", volume = 0.2, delay = 0) {
    if (!this.context || !this.enabled) return;
    const c = this.context,
      t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.value = frequency;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  click(high) {
    this.tone(high ? 2600 : 1900, 0.025, "square", 0.05);
  }
  chime() {
    this.tone(880, 0.35, "sine", 0.16);
    this.tone(660, 0.45, "sine", 0.14, 0.18);
  }
  thud() {
    this.tone(70, 0.35, "sine", 0.5);
    this.tone(140, 0.15, "triangle", 0.2);
  }
  update(dt, { speed = 0, gas = 0, gear = 1, blinker = 0, running = false }) {
    if (!this.context) return;
    const t = this.context.currentTime,
      on = running && this.enabled;
    const whine = on ? Math.min(0.06, speed * 0.004 + gas * 0.025) : 0;
    this.motorGain.gain.setTargetAtTime(whine, t, 0.08);
    this.motor.frequency.setTargetAtTime(180 + speed * 42 + gas * 60, t, 0.1);
    this.motorFilter.frequency.setTargetAtTime(400 + speed * 70, t, 0.1);
    this.noiseGain.gain.setTargetAtTime(on ? Math.min(0.22, speed * 0.011) : 0, t, 0.2);
    this.noiseFilter.frequency.setTargetAtTime(250 + speed * 45, t, 0.2);
    // Blinker relay: on/off every 0.35 s, a click on each edge.
    if (on && blinker) {
      this.blinkClock += dt;
      if (this.blinkClock >= 0.35) {
        this.blinkClock -= 0.35;
        this.blinkLit = !this.blinkLit;
        this.click(this.blinkLit);
      }
    } else {
      this.blinkClock = 0.35;
      this.blinkLit = false;
    }
    // In-cabin reverse warning beep.
    if (on && gear < 0) {
      this.reverseClock += dt;
      if (this.reverseClock >= 1) {
        this.reverseClock -= 1;
        this.tone(1450, 0.18, "sine", 0.09);
      }
    } else this.reverseClock = 1;
  }
  // True during the lit half of the blink cycle (for the dashboard arrow).
  get lit() {
    return this.blinkLit;
  }
}

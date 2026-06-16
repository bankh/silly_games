// audio.js — minimal procedural sound via WebAudio (no asset files).
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  _blip(freq, dur, type = "square", gain = 0.12, slideTo = null) {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  good()  { this._blip(660, 0.12, "square", 0.10, 990); }
  big()   { this._blip(440, 0.18, "sawtooth", 0.12, 880); setTimeout(() => this._blip(880, 0.14, "square", 0.08, 1320), 60); }
  bad()   { this._blip(200, 0.22, "sawtooth", 0.14, 90); }
  hit()   { this._blip(140, 0.16, "square", 0.12, 70); }
  pickup(){ this._blip(880, 0.08, "triangle", 0.08, 1200); }
  win()   { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.18, "square", 0.10), i * 110)); }
  lose()  { [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip(f, 0.22, "sawtooth", 0.12, f * 0.7), i * 150)); }
  clash() { this._blip(120, 0.4, "sawtooth", 0.14, 60); }
  toggle() { this.muted = !this.muted; return this.muted; }
}

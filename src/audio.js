// All audio is synthesized at runtime with the Web Audio API — no asset files.
// Includes one-shot SFX and a procedural, intensity-driven music engine
// (calm exploration <-> driving combat), in the spirit of Descent.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.intensity = 0;        // smoothed 0..1
    this.targetIntensity = 0;
    this._noiseBuf = null;
    this._step = 0;
    this._nextNoteTime = 0;
    this._timer = null;
  }

  // Must be called from a user gesture (e.g. the Start button click).
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // Master buses.
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.35;
    this.sfxGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.ctx.destination);

    // Pre-render a white-noise buffer for percussion / impacts.
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;

    this.enabled = true;
    this._startMusic();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.musicGain) {
      this.musicGain.gain.linearRampToValueAtTime(on ? 0.22 : 0.0, this.ctx.currentTime + 0.5);
    }
  }

  // ---- primitives ----
  _noise(dur, when, type = 'lowpass', freq = 2000, gain = 0.5) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(when); src.stop(when + dur);
  }

  _tone(freq, dur, when, type = 'square', gain = 0.3, slideTo = null) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(when); o.stop(when + dur);
  }

  // ---- SFX ----
  shoot() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._tone(880, 0.10, t, 'square', 0.16, 220);
  }
  rocket() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._tone(180, 0.30, t, 'sawtooth', 0.22, 60);
    this._noise(0.3, t, 'lowpass', 800, 0.25);
  }
  enemyHit() {
    if (!this.enabled) return;
    this._noise(0.08, this.ctx.currentTime, 'bandpass', 2600, 0.45);
  }
  enemyKill() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._noise(0.4, t, 'lowpass', 1400, 0.6);
    this._tone(160, 0.4, t, 'sawtooth', 0.25, 40);
  }
  playerHit() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._noise(0.25, t, 'lowpass', 500, 0.5);
    this._tone(120, 0.2, t, 'square', 0.2, 60);
  }
  pickup() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._tone(660, 0.09, t, 'triangle', 0.25);
    this._tone(990, 0.12, t + 0.09, 'triangle', 0.25);
  }
  door() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._tone(300, 0.5, t, 'sawtooth', 0.2, 120);
  }
  bigExplosion() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._noise(1.2, t, 'lowpass', 900, 0.8);
    this._tone(90, 1.0, t, 'sawtooth', 0.4, 30);
  }

  setIntensity(v) { this.targetIntensity = Math.max(0, Math.min(1, v)); }

  // ---- Procedural music ----
  _startMusic() {
    // Dark natural-minor scale degrees (semitones).
    this.scale = [0, 2, 3, 5, 7, 8, 10];
    // Root progression per bar (semitone transpose), brooding and looping.
    this.prog = [0, 0, -2, 3, 0, 0, 5, 3];
    this.bar = 0;
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicGain.gain.linearRampToValueAtTime(0.22, this.ctx.currentTime + 1.5);
    const lookahead = () => {
      if (!this.ctx) return;
      // Smooth intensity toward target.
      this.intensity += (this.targetIntensity - this.intensity) * 0.08;
      const tempo = 124 + this.intensity * 36;        // BPM
      const stepDur = 60 / tempo / 4;                  // 16th notes
      while (this._nextNoteTime < this.ctx.currentTime + 0.12) {
        this._scheduleStep(this._step, this._nextNoteTime, stepDur);
        this._nextNoteTime += stepDur;
        this._step++;
        if (this._step % 16 === 0) this.bar = (this.bar + 1) % this.prog.length;
      }
    };
    this._timer = setInterval(lookahead, 25);
  }

  _midiFreq(semi) { return 55 * Math.pow(2, semi / 12); } // base A1

  _mGain(freq, dur, when, type, gain, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest || this.musicGain);
    o.start(when); o.stop(when + dur);
  }

  _kick(when) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.15);
    o.connect(g); g.connect(this.musicGain);
    o.start(when); o.stop(when + 0.16);
  }

  _hat(when, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(when); src.stop(when + 0.06);
  }

  _scheduleStep(step, when, stepDur) {
    const s = step % 16;
    const root = this.prog[this.bar];
    const I = this.intensity;

    // Bass: driving root pulses; denser when intense.
    const bassSteps = I > 0.4 ? [0, 3, 6, 8, 11, 14] : [0, 6, 8, 14];
    if (bassSteps.includes(s)) {
      this._mGain(this._midiFreq(root + 12), stepDur * 1.6, when, 'sawtooth', 0.18 + I * 0.1);
    }

    // Pad drone (always, fades with calm) on bar starts.
    if (s === 0) {
      const padGain = 0.07 + (1 - I) * 0.05;
      this._mGain(this._midiFreq(root + 24), stepDur * 14, when, 'triangle', padGain);
      this._mGain(this._midiFreq(root + 31), stepDur * 14, when, 'triangle', padGain * 0.7);
    }

    // Drums.
    if (s % 4 === 0) this._kick(when);
    if (I > 0.25) this._hat(when, 0.05 + I * 0.04);
    if (I > 0.45 && (s === 4 || s === 12)) this._noise(0.12, when, 'bandpass', 1800, 0.25 + I * 0.2);

    // Lead arpeggio only in combat.
    if (I > 0.5) {
      const arp = [0, 2, 4, 6, 4, 2];
      if (s % 2 === 0) {
        const deg = this.scale[arp[(s / 2) % arp.length] % this.scale.length];
        this._mGain(this._midiFreq(root + 48 + deg), stepDur * 1.4, when, 'square', 0.06 + I * 0.05);
      }
    }
  }

  stopMusic() {
    if (this.musicGain) this.musicGain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.4);
  }
}

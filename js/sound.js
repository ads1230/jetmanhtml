'use strict';

// Synthesized sound effects, played with the Web Audio API (port of
// SoundEngine.swift). Every effect is generated in code (no audio files) and
// played from a small pool of voices so rapid flaps can overlap.

class SoundEngine {
  constructor() {
    this._enabled = true;
    /** 0...1 */
    this._volume = 0.8;
    this.context = null;
    this.master = null;
    this.buffers = {};
    /** Six voices, reused round-robin like the app's player nodes. */
    this.voices = new Array(6).fill(null);
    this.nextVoice = 0;
  }

  get isEnabled() { return this._enabled; }
  set isEnabled(value) {
    this._enabled = !!value;
    this.applyVolume();
  }

  get volume() { return this._volume; }
  set volume(value) {
    this._volume = clamp(Number(value) || 0, 0, 1);
    this.applyVolume();
  }

  /**
   * Browsers only start audio from a user gesture, so this runs on every
   * press and key (cheap once the context is running).
   */
  unlock() {
    if (this.context) {
      if (this.context.state !== 'running') this.context.resume().catch(() => {});
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      // Ambient: respects the silent switch and mixes with the player's music (Safari).
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch (e) {
      // Not supported; ignore.
    }
    try {
      this.context = new AudioContextClass();
    } catch (e) {
      return;
    }
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.applyVolume();
    const sampleRate = 44100;
    for (const effect of SoundEngine.effects) {
      const data = SoundEngine.synthesize(effect, sampleRate);
      const buffer = this.context.createBuffer(1, data.length, sampleRate);
      buffer.getChannelData(0).set(data);
      this.buffers[effect] = buffer;
    }
    if (this.context.state !== 'running') this.context.resume().catch(() => {});
  }

  /** Plays 'flap', 'start', 'crash', 'highScore', 'powerUp', 'shieldBreak' or 'laser'. */
  play(effect) {
    if (!this._enabled || this._volume <= 0) return;
    const context = this.context;
    const buffer = this.buffers[effect];
    if (!context || !buffer) return;
    if (context.state !== 'running') context.resume().catch(() => {});
    const index = this.nextVoice;
    this.nextVoice = (this.nextVoice + 1) % this.voices.length;
    const previous = this.voices[index];
    if (previous) {
      try {
        previous.stop();
      } catch (e) {
        // Already finished.
      }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.onended = () => {
      if (this.voices[index] === source) this.voices[index] = null;
      source.disconnect();
    };
    this.voices[index] = source;
    source.start();
  }

  applyVolume() {
    if (!this.master) return;
    const gain = this._enabled ? this._volume : 0;
    this.master.gain.setValueAtTime(gain, this.context.currentTime);
  }

  // MARK: Synthesis

  static duration(effect) {
    switch (effect) {
      case 'flap': return 0.22;
      case 'start': return 0.25;
      case 'crash': return 0.8;
      case 'powerUp': return 0.32;
      case 'shieldBreak': return 0.45;
      case 'laser': return 0.12;
      default: return 0.6; // highScore
    }
  }

  static synthesize(effect, sampleRate) {
    const duration = SoundEngine.duration(effect);
    const frameCount = Math.trunc(duration * sampleRate);
    const samples = new Float32Array(frameCount);

    let lowpass = 0;
    let phase = 0;
    // One-pole lowpass filter step for white noise at a given cutoff.
    const filteredNoise = (cutoff) => {
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      lowpass += a * (random(-1, 1) - lowpass);
      return lowpass;
    };
    const sine = (frequency) => {
      phase += frequency / sampleRate;
      return Math.sin(2 * Math.PI * phase);
    };

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const progress = t / duration;
      let value;
      switch (effect) {
        case 'flap': {
          // Noise whose brightness sweeps down: a quick "fwoosh".
          const attack = Math.min(1, t / 0.015);
          value = filteredNoise(300 + 2500 * (1 - progress)) * attack * Math.exp(-t * 14) * 1.6;
          break;
        }
        case 'start': {
          // Rising chirp with a breath of noise.
          const envelope = Math.min(1, t / 0.01) * Math.exp(-t * 8);
          value = (sine(300 + 900 * progress) * 0.5 + filteredNoise(3000) * 0.15) * envelope;
          break;
        }
        case 'crash': {
          // Noise burst plus a falling low thump.
          const burst = filteredNoise(200 + 1800 * (1 - progress)) * Math.exp(-t * 5) * 1.2;
          const thump = sine(90 - 50 * progress) * Math.exp(-t * 7) * 0.8;
          value = burst + thump;
          break;
        }
        case 'powerUp': {
          // Two quick rising tones with a shimmer.
          const first = t < 0.11;
          const local = first ? t : t - 0.11;
          const tone = sine(first ? 880 : 1318.5);
          const envelope = Math.min(1, local / 0.004) * Math.exp(-local * 14);
          value = (tone + 0.35 * Math.sin(6 * Math.PI * phase)) * envelope * 0.4;
          break;
        }
        case 'shieldBreak': {
          // Bright crackle over a falling electric buzz.
          const crackle = filteredNoise(6000 - 4000 * progress) * Math.exp(-t * 9) * 0.9;
          const buzz = (sine(520 - 380 * progress) > 0 ? 1 : -1) * Math.exp(-t * 7) * 0.25;
          value = crackle + buzz;
          break;
        }
        case 'laser': {
          // Quick downward sweep, kept quiet since it repeats.
          const envelope = Math.min(1, t / 0.003) * Math.exp(-t * 28);
          value = sine(1700 - 1300 * progress) * envelope * 0.22;
          break;
        }
        default: {
          // C-E-G-C arpeggio, each note ringing out.
          const notes = [523.25, 659.25, 783.99, 1046.5];
          const noteLength = 0.12;
          const index = Math.min(notes.length - 1, Math.floor(t / noteLength));
          const local = t - index * noteLength;
          const tone = sine(notes[index]);
          const envelope = Math.min(1, local / 0.005) * Math.exp(-local * 9);
          value = (tone + 0.3 * Math.sin(4 * Math.PI * phase)) * envelope * 0.45;
        }
      }
      samples[i] = Math.max(-1, Math.min(1, value));
    }
    return samples;
  }
}

SoundEngine.effects = ['flap', 'start', 'crash', 'highScore', 'powerUp', 'shieldBreak', 'laser'];

const sound = new SoundEngine();

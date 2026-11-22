// Neon Bay — all sound is synthesised with WebAudio: no audio files, no network.
// Engine hum pitched by speed, a two-tone siren, and one-shot blips/thuds/jingles.
// The context is created lazily on the first user gesture; before that every call
// is a no-op, so the staged screenshot scenes stay silent and deterministic.
import { STEP } from './config.js';

const BASSLINE = [55, 0, 55, 65.41, 55, 0, 49, 58.27, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];
const BASS_STEP = 0.22;

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let bassTimer = 0;
  let bassIndex = 0;
  let sirenPhase = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 30;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  /** Call from a user gesture (start button / key press). */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, duration, type, volume) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* sound is best-effort */ }
  }

  function noiseBurst(duration, volume, lowpass) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 400;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* sound is best-effort */ }
  }

  return {
    unlock,
    get isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    pickup() { blip(880, 0.12, 'sine', 0.3); blip(1320, 0.1, 'sine', 0.2); },
    crash() { noiseBurst(0.25, 0.5, 300); blip(90, 0.2, 'sine', 0.4); },
    punch() { noiseBurst(0.08, 0.4, 900); },
    enterCar() { blip(220, 0.08, 'square', 0.15); blip(330, 0.1, 'square', 0.15); },
    spray() { blip(660, 0.15, 'sine', 0.25); blip(990, 0.2, 'sine', 0.25); },
    wantedUp() { blip(520, 0.12, 'square', 0.2); blip(392, 0.18, 'square', 0.2); },
    jingle() {
      if (!ctx || muted) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.22, 'triangle', 0.3), i * 110);
      });
    },
    busted() {
      if (!ctx || muted) return;
      [392, 311, 233].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.3, 'sawtooth', 0.2), i * 160);
      });
    },
    /** Per-frame: engine pitch follows speed, siren wails while wanted, bassline loops. */
    update(dt, speed, wanted, driving) {
      if (!ctx || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      const abs = Math.abs(speed);
      if (engineGain) {
        engineGain.gain.value = driving ? 0.05 + Math.min(0.09, abs / 520 * 0.09) : 0.02;
        engineOsc.frequency.value = 55 + abs * 0.28;
        engineOsc2.frequency.value = 28 + abs * 0.14;
      }
      if (sirenGain) {
        if (wanted > 0) {
          sirenPhase += dt * 2.4;
          const high = Math.floor(sirenPhase) % 2 === 0;
          sirenOsc.frequency.value = high ? 920 : 690;
          sirenGain.gain.value = 0.045;
        } else {
          sirenGain.gain.value = 0;
        }
      }
      bassTimer -= dt;
      if (bassTimer <= 0) {
        bassTimer += BASS_STEP;
        const freq = BASSLINE[bassIndex % BASSLINE.length];
        bassIndex += 1;
        if (freq > 0) blip(freq, BASS_STEP * 0.9, 'triangle', 0.12);
      }
    },
  };
}

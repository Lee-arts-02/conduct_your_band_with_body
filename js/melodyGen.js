import * as Tone from "https://esm.sh/tone@14.8.49";

export const MELODY_SCALES = [
  ["C4", "D4", "E4", "G4", "A4"],
  ["C4", "D4", "E4", "F4", "G4", "A4", "B4"],
  ["A3", "C4", "D4", "E4", "G4", "A4"],
];

function clamp(i, lo, hi) {
  return Math.max(lo, Math.min(hi, i));
}

export function pickMelodyNote(scale, lastIdx) {
  const n = scale.length;
  if (n === 0) return { idx: 0, note: "C4" };
  const r = Math.random();
  let nextIdx;
  if (r < 0.52) {
    const step = Math.random() < 0.5 ? -1 : 1;
    nextIdx = clamp(lastIdx + step, 0, n - 1);
  } else if (r < 0.78) {
    nextIdx = lastIdx;
  } else {
    const leap = Math.random() < 0.5 ? -2 : 2;
    nextIdx = clamp(lastIdx + leap, 0, n - 1);
  }
  return { idx: nextIdx, note: scale[nextIdx] };
}

export function pickMelodyDuration(intensity, waveBoost) {
  const i = Math.max(0, Math.min(1, intensity + (waveBoost || 0) * 0.35));
  const r = Math.random();
  if (i < 0.32) {
    return r < 0.5 ? "8n" : "4n";
  }
  if (i < 0.58) {
    if (r < 0.45) return "8n";
    if (r < 0.85) return "4n";
    return "16n";
  }
  if (i < 0.82) {
    return r < 0.55 ? "8n" : "16n";
  }
  return r < 0.72 ? "16n" : "8n";
}

export function createMelodyEngine(connectTo) {
  const localFilter = new Tone.Filter({
    type: "lowpass",
    frequency: 1200,
    Q: 0.85,
  });

  const synth = new Tone.PolySynth(Tone.Synth).connect(localFilter);
  synth.set({
    oscillator: { type: "triangle" },
    envelope: {
      attack: 0.015,
      decay: 0.22,
      sustain: 0.28,
      release: 0.45,
    },
  });

  localFilter.connect(connectTo);

  let acc = 0;
  let lastIdx = 2;
  let loopRunning = false;
  let prevActive = false;

  let state = {
    active: false,
    intensity: 0.5,
    leftIntensity: 0.5,
    variation: 0,
    waveBoost: 0,
  };

  const loop = new Tone.Loop((time) => {
    if (!state.active) return;

    const li = Math.max(0, Math.min(1, state.leftIntensity));
    const wb = Math.max(0, Math.min(1, state.waveBoost || 0));
    const rate = 0.1 + li * 1.05 + wb * 0.85;
    acc += rate;
    if (acc < 1) return;
    acc -= 1;

    const scale = MELODY_SCALES[state.variation % MELODY_SCALES.length];
    const pick = pickMelodyNote(scale, lastIdx);
    lastIdx = pick.idx;
    const dur = pickMelodyDuration(li, wb);
    const vel = 0.2 + li * 0.52 + wb * 0.12;
    synth.triggerAttackRelease(pick.note, dur, time, Math.min(0.85, vel));
    localFilter.frequency.rampTo(520 + li * 4800 + wb * 900, 0.08);
  }, "16n");

  return {
    setState(next) {
      state = { ...state, ...next };

      if (state.active && !prevActive) {
        const scale = MELODY_SCALES[state.variation % MELODY_SCALES.length];
        lastIdx = Math.floor(scale.length / 2);
        acc = 0;
      }

      if (state.active && !loopRunning) {
        loop.start(0);
        loopRunning = true;
      } else if (!state.active && loopRunning) {
        loop.stop();
        loopRunning = false;
        acc = 0;
        try {
          synth.releaseAll();
        } catch (_) {
          /* ignore */
        }
      }

      prevActive = state.active;
    },
  };
}

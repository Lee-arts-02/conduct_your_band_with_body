import * as Tone from "https://esm.sh/tone@14.8.49";

const COOLDOWN_MS = 820;

/**
 * Short musical gestures for waving: fills, runs, call/response, drum accents.
 */
export function createWaveEngine({ pianoVol, drumVol }) {
  const leftBus = new Tone.Volume(-100).connect(pianoVol);
  const rightBus = new Tone.Volume(-100).connect(drumVol);

  const lead = new Tone.PolySynth(Tone.Synth).connect(leftBus);
  lead.set({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.18, sustain: 0.15, release: 0.35 },
  });

  const perc = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.06 },
  }).connect(rightBus);

  let lastL = 0;
  let lastR = 0;

  function nowAudio() {
    return Tone.now();
  }

  function flashLeftDb(durationMs) {
    leftBus.volume.cancelScheduledValues(nowAudio());
    leftBus.volume.rampTo(-8, 0.04);
    leftBus.volume.rampTo(-100, durationMs / 1000);
  }

  function flashRightDb(durationMs) {
    rightBus.volume.cancelScheduledValues(nowAudio());
    rightBus.volume.rampTo(-7, 0.04);
    rightBus.volume.rampTo(-100, durationMs / 1000);
  }

  function playLeftPattern(kind, speed, size, t0) {
    const vel = 0.35 + size * 0.45;
    const step = Math.max(0.04, 0.11 - speed * 0.06);
    if (kind === 0) {
      const run = ["C4", "D4", "E4", "G4", "A4"];
      run.forEach((n, i) => {
        lead.triggerAttackRelease(n, "16n", t0 + i * step, vel);
      });
    } else if (kind === 1) {
      const pat = ["E4", "E4", "G4", "B4"];
      pat.forEach((n, i) => {
        lead.triggerAttackRelease(n, "32n", t0 + i * step * 0.65, vel * 0.95);
      });
    } else if (kind === 2) {
      lead.triggerAttackRelease("A4", "8n", t0, vel);
      lead.triggerAttackRelease("E4", "8n", t0 + step * 2.2, vel * 0.85);
      lead.triggerAttackRelease("C5", "8n", t0 + step * 4.4, vel * 0.9);
    } else {
      const arp = ["C4", "G4", "C5", "E5"];
      arp.forEach((n, i) => {
        lead.triggerAttackRelease(n, "16n", t0 + i * step * 0.9, vel);
      });
    }
  }

  function playRightPattern(kind, speed, size, t0) {
    const vel = 0.42 + size * 0.48;
    const step = Math.max(0.04, 0.1 - speed * 0.05);
    const notes = ["C2", "D2", "G1", "A1"];
    if (kind === 0) {
      for (let i = 0; i < 4; i += 1) {
        perc.triggerAttackRelease(notes[i % notes.length], "16n", t0 + i * step, vel);
      }
    } else if (kind === 1) {
      perc.triggerAttackRelease("C2", "16n", t0, vel);
      perc.triggerAttackRelease("C2", "16n", t0 + step * 1.5, vel * 0.88);
      perc.triggerAttackRelease("G1", "16n", t0 + step * 2.9, vel * 0.75);
    } else if (kind === 2) {
      for (let i = 0; i < 6; i += 1) {
        perc.triggerAttackRelease("D2", "32n", t0 + i * step * 0.55, vel * 0.55);
      }
    } else {
      perc.triggerAttackRelease("A1", "16n", t0, vel);
      perc.triggerAttackRelease("C2", "16n", t0 + step * 1.1, vel * 0.9);
      perc.triggerAttackRelease("G1", "16n", t0 + step * 2.3, vel * 0.82);
    }
  }

  return {
    maybeLeftWave(speed, size, isWaving) {
      if (!isWaving) return;
      const t = performance.now();
      if (t - lastL < COOLDOWN_MS) return;
      lastL = t;
      const kind = Math.floor(Math.random() * 4);
      const t0 = nowAudio();
      flashLeftDb(420);
      playLeftPattern(kind, speed, size, t0);
    },

    maybeRightWave(speed, size, isWaving) {
      if (!isWaving) return;
      const t = performance.now();
      if (t - lastR < COOLDOWN_MS) return;
      lastR = t;
      const kind = Math.floor(Math.random() * 4);
      const t0 = nowAudio();
      flashRightDb(380);
      playRightPattern(kind, speed, size, t0);
    },
  };
}

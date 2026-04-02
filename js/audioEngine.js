import * as Tone from "https://esm.sh/tone@14.8.49";
import {
  RAMP_TIME,
  MASTER_BUS_HEADROOM_DB,
  COMPRESSOR,
  LIMITER_CEILING,
} from "./audioConstants.js";
import { gestureToLevels } from "./audioMappings.js";
import { createPhraseController } from "./phraseController.js";
import { createMelodyEngine } from "./melodyGen.js";
import { createWaveEngine } from "./waveResponses.js";
import { softGainIntensity } from "./intensityCurve.js";

const MAIN_PHRASES = [
  { chords: ["C3", "E3", "G3", "B3"] },
  { chords: ["D3", "F#3", "A3", "C4"] },
  { chords: ["Bb2", "D3", "F3", "A3"] },
];

const MAIN_SOFT_PHRASES = [
  { chords: ["C3", "E3", "G3"] },
  { chords: ["A2", "C3", "E3", "G3"] },
  { chords: ["F2", "A2", "C3", "E3"] },
];

const STRINGS_PHRASES = [
  { note: "C5", len: "2n" },
  { note: "E5", len: "2n." },
  { note: "G5", len: "1n" },
];

const DRUM_PATTERNS = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
  [1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
];

let started = false;
let paused = false;
let master;
let energyNode;
let mainVol;
let pianoVol;
let drumVol;
let stringsVol;
let brightFilter;
let spaceDelay;
let masterComp;
let masterLim;
let mainLoop;
let drumLoop;
let stringsLoop;
let melodyEngine;
let waveEngine;

let lastGestureOutput = null;
let drumAccentBoost = 0;

const phraseCtl = createPhraseController({
  main: 3,
  piano: 3,
  drums: 3,
  strings: 3,
  soft: 3,
});

export const phraseState = {
  main: 0,
  piano: 0,
  drums: 0,
  strings: 0,
  soft: 0,
};

let drumStep = 0;
let prevMelodyActive = false;
let latchedMelodyVariation = 0;

function melodyGestureActive(o) {
  return !!(o && (o.leftUp || o.armsOpen));
}

function ramp(node, db) {
  if (!node) return;
  node.volume.rampTo(db, RAMP_TIME);
}

function buildGraph() {
  master = new Tone.Volume(MASTER_BUS_HEADROOM_DB);

  spaceDelay = new Tone.FeedbackDelay({
    delayTime: "16n",
    feedback: 0.14,
  });
  spaceDelay.wet.value = 0.06;

  brightFilter = new Tone.Filter({
    type: "lowpass",
    frequency: 900,
    Q: 0.75,
  });

  masterComp = new Tone.Compressor({
    threshold: COMPRESSOR.threshold,
    ratio: COMPRESSOR.ratio,
    attack: COMPRESSOR.attack,
    release: COMPRESSOR.release,
    knee: COMPRESSOR.knee,
  });

  masterLim = new Tone.Limiter(LIMITER_CEILING);

  master.connect(spaceDelay);
  spaceDelay.connect(brightFilter);
  brightFilter.connect(masterComp);
  masterComp.connect(masterLim);
  masterLim.toDestination();

  energyNode = new Tone.Volume(0).connect(master);

  mainVol = new Tone.Volume(-100).connect(energyNode);
  pianoVol = new Tone.Volume(-100).connect(energyNode);
  drumVol = new Tone.Volume(-100).connect(energyNode);
  stringsVol = new Tone.Volume(-100).connect(energyNode);

  const pad = new Tone.PolySynth(Tone.Synth).connect(mainVol);
  pad.set({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.08, decay: 0.4, sustain: 0.45, release: 1.2 },
  });

  melodyEngine = createMelodyEngine(pianoVol);
  waveEngine = createWaveEngine({ pianoVol, drumVol });

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 6,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.25, sustain: 0.01, release: 0.2 },
  }).connect(drumVol);

  const click = new Tone.MembraneSynth({
    pitchDecay: 0.006,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.04 },
  }).connect(drumVol);

  const strings = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.22, decay: 0.12, sustain: 0.7, release: 1.2 },
  }).connect(stringsVol);

  mainLoop = new Tone.Loop((time) => {
    const o = lastGestureOutput;
    const soft = o?.bothDown;
    const pool = soft ? MAIN_SOFT_PHRASES : MAIN_PHRASES;
    const idx = soft ? phraseState.soft % MAIN_SOFT_PHRASES.length : phraseState.main % MAIN_PHRASES.length;
    const { chords } = pool[idx];
    pad.triggerAttackRelease(chords, "2n", time);
  }, "1m");

  drumLoop = new Tone.Loop((time) => {
    const v = phraseState.drums % DRUM_PATTERNS.length;
    const pat = DRUM_PATTERNS[v];
    const i = drumStep % pat.length;
    if (pat[i]) {
      const vel = 0.38 + drumAccentBoost * 0.28;
      kick.triggerAttackRelease("C1", "16n", time, Math.min(0.85, vel));
    }
    if (v === 2 && pat[(i + 6) % pat.length]) {
      click.triggerAttackRelease("G5", "32n", time, 0.12 + drumAccentBoost * 0.2);
    }
    drumStep += 1;
  }, "16n");

  stringsLoop = new Tone.Loop((time) => {
    const ph = STRINGS_PHRASES[phraseState.strings % STRINGS_PHRASES.length];
    strings.triggerAttackRelease(ph.note, ph.len, time);
  }, "1m");

  mainLoop.start(0);
  drumLoop.start(0);
  stringsLoop.start(0);

  Tone.getTransport().bpm.value = 92;
}

export async function startAudio() {
  if (started) return;
  await Tone.start();
  buildGraph();
  phraseCtl.reset();
  Tone.getTransport().start();
  started = true;
  paused = false;
}

export function isAudioStarted() {
  return started;
}

export function isPaused() {
  return paused;
}

export function setPaused(p) {
  if (!started) return;
  paused = p;
  const T = Tone.getTransport();
  if (p) {
    T.pause();
  } else {
    T.start();
  }
}

function applyExpressiveMix(globalIntensitySoft) {
  const i = Math.max(0, Math.min(1, globalIntensitySoft));
  const freq = 380 + i * 6200;
  brightFilter.frequency.rampTo(freq, RAMP_TIME);
  const wet = 0.035 + i * 0.18;
  spaceDelay.wet.rampTo(wet, RAMP_TIME);
}

/**
 * @param {object|null} o — debounced gesture output
 * @param {number} intensity — global (avg) raw 0–1
 * @param {number} leftIntensity — left wrist height raw 0–1
 * @param {number} rightIntensity — right wrist height raw 0–1
 * @param {object} wave — { left: {...}, right: {...} }
 */
export function updateFromGestures(o, intensity, leftIntensity, rightIntensity, wave) {
  if (!started) return;
  lastGestureOutput = o ? { ...o } : null;

  const g = typeof intensity === "number" ? intensity : 0.45;
  const l = typeof leftIntensity === "number" ? leftIntensity : 0.45;
  const r = typeof rightIntensity === "number" ? rightIntensity : 0.45;
  const wl = wave?.left;
  const wr = wave?.right;

  if (!paused) {
    const { indices } = phraseCtl.update(o, performance.now());
    phraseState.main = indices.main;
    phraseState.piano = indices.piano;
    phraseState.drums = indices.drums;
    phraseState.strings = indices.strings;
    phraseState.soft = indices.soft;

    const lv = gestureToLevels(o, g, l, r);
    ramp(mainVol, lv.main);
    ramp(pianoVol, lv.piano);
    ramp(drumVol, lv.drums);
    ramp(stringsVol, lv.strings);
    ramp(energyNode, lv.energy);
    ramp(master, lv.master);

    const gSoft = softGainIntensity(g);
    applyExpressiveMix(gSoft);

    drumAccentBoost = wr?.isWaving ? wr.speed * 0.45 + wr.size * 0.35 : 0;

    const mAct = melodyGestureActive(o);
    if (mAct && !prevMelodyActive) {
      latchedMelodyVariation = phraseState.piano;
    }
    prevMelodyActive = mAct;

    const waveBoostL =
      wl?.isWaving ? Math.min(1, (wl.speed || 0) * 0.5 + (wl.size || 0) * 0.45) : 0;

    if (melodyEngine) {
      melodyEngine.setState({
        active: mAct,
        intensity: g,
        leftIntensity: l,
        variation: latchedMelodyVariation,
        waveBoost: waveBoostL,
      });
    }

    if (waveEngine && o) {
      if (mAct && wl?.isWaving) {
        waveEngine.maybeLeftWave(wl.speed, wl.size, true);
      }
      if (o.rightUp && wr?.isWaving) {
        waveEngine.maybeRightWave(wr.speed, wr.size, true);
      }
    }
  }
}

export function getDisplayVolume(intensity) {
  if (!started) return 0;
  const i = typeof intensity === "number" ? intensity : 0;
  return Math.round(softGainIntensity(i) * 100);
}

export function getLayerSummary(o) {
  if (!started || !o) return "—";
  const parts = [];
  if (o.armsOpen) parts.push("Band");
  if (o.leftUp || o.armsOpen) parts.push("Melody (L)");
  if (o.rightUp) parts.push("Rhythm (R)");
  if (o.bothUp) parts.push("Strings");
  if (o.bothDown) parts.push("Softer");
  return parts.length ? parts.join(", ") : "—";
}

export function getPhraseSummary() {
  if (!started) return "—";
  const m = phraseState.main + 1;
  const p = phraseState.piano + 1;
  const d = phraseState.drums + 1;
  const s = phraseState.strings + 1;
  const so = phraseState.soft + 1;
  return `Band ${m}/3 · Melody ${p}/3 · Drums ${d}/3 · Strings ${s}/3`;
}

import {
  LAYER_RANGES,
  ENERGY_INTENSITY_DB,
  ENERGY_BOTH_UP_DB,
  BOTH_DOWN_INTENSITY_SCALE,
  STACK_PENALTY_3,
  STACK_PENALTY_4,
} from "./audioConstants.js";
import { softGainIntensity, layerShapeIntensity } from "./intensityCurve.js";

function clamp01(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function lerpDb(range, t) {
  const tt = clamp01(t);
  return range.minDb + tt * (range.maxDb - range.minDb);
}

function countActiveLayers(parts) {
  return parts.filter((db) => db > -55).length;
}

function applyStackPenalty(db, activeCount) {
  if (db <= -55) return db;
  let pen = 0;
  if (activeCount >= 3) pen += STACK_PENALTY_3;
  if (activeCount >= 4) pen += STACK_PENALTY_4;
  return db - pen;
}

/**
 * Left wrist → melody/harmony layer; right wrist → rhythm layer; global → band/strings energy.
 * `globalI`, `leftI`, `rightI` are raw 0–1 — softened inside.
 */
export function gestureToLevels(o, globalI, leftI, rightI) {
  const g0 = typeof globalI === "number" ? globalI : 0.45;
  const l0 = typeof leftI === "number" ? leftI : 0.45;
  const r0 = typeof rightI === "number" ? rightI : 0.45;

  let g = softGainIntensity(g0);
  let l = softGainIntensity(l0);
  let r = softGainIntensity(r0);

  if (o?.bothDown) {
    g = clamp01(g * BOTH_DOWN_INTENSITY_SCALE);
    l = clamp01(l * BOTH_DOWN_INTENSITY_SCALE);
    r = clamp01(r * BOTH_DOWN_INTENSITY_SCALE);
  }

  const lShape = layerShapeIntensity(l0);
  const rShape = layerShapeIntensity(r0);
  const gShape = layerShapeIntensity(g0);

  if (!o) {
    return {
      main: -100,
      piano: -100,
      drums: -100,
      strings: -100,
      energy: 0,
      master: 0,
    };
  }

  const bothUp = o.bothUp;
  const melodyOn = o.leftUp || o.armsOpen;

  let mainDb = o.armsOpen ? lerpDb(LAYER_RANGES.main, gShape) : -100;

  let pianoDb = -100;
  if (melodyOn) {
    pianoDb = lerpDb(bothUp ? LAYER_RANGES.pianoBothUp : LAYER_RANGES.piano, lShape);
  }

  let drumDb = -100;
  if (o.rightUp) {
    drumDb = lerpDb(bothUp ? LAYER_RANGES.drumsBothUp : LAYER_RANGES.drums, rShape);
  }

  let stringsDb = bothUp ? lerpDb(LAYER_RANGES.strings, gShape) : -100;

  const parts = [mainDb, pianoDb, drumDb, stringsDb];
  const activeCount = countActiveLayers(parts);

  mainDb = applyStackPenalty(mainDb, activeCount);
  pianoDb = applyStackPenalty(pianoDb, activeCount);
  drumDb = applyStackPenalty(drumDb, activeCount);
  stringsDb = applyStackPenalty(stringsDb, activeCount);

  let energy = g * ENERGY_INTENSITY_DB;
  if (bothUp) {
    energy += ENERGY_BOTH_UP_DB * (0.35 + g * 0.55);
  }

  return {
    main: mainDb,
    piano: pianoDb,
    drums: drumDb,
    strings: stringsDb,
    energy,
    master: 0,
  };
}

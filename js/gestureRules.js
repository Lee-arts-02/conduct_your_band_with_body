import {
  DETECTION,
  SMOOTHING,
  STABLE_FRAMES,
  POSE_INDICES,
  INTENSITY_RANGE,
  INTENSITY_SMOOTHING,
  HAND_INTENSITY_SMOOTHING,
  HAND_HISTORY_LEN,
  WAVE_MIN_SPAN,
  WAVE_SCORE_ON,
  WAVE_SCORE_OFF,
} from "./config.js";

const I = POSE_INDICES;

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function ema(prev, next, alpha) {
  return prev === null ? next : prev + alpha * (next - prev);
}

function clamp01(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/**
 * Vertical height → 0–1 for one hand (higher hand = higher value).
 */
export function rawHandIntensity01(relY) {
  const { lowY, highY } = INTENSITY_RANGE;
  const span = lowY - highY;
  if (span <= 1e-6) return 0.5;
  return clamp01((lowY - relY) / span);
}

/**
 * Horizontal wrist samples → wave energy, speed, size (all roughly 0–1).
 */
export function analyzeWave(xs) {
  if (!xs || xs.length < 6) {
    return { score: 0, speed: 0, size: 0, isWaving: false };
  }
  const n = xs.length;
  let crossings = 0;
  for (let i = 2; i < n; i++) {
    const a = xs[i - 1] - xs[i - 2];
    const b = xs[i] - xs[i - 1];
    if (a * b < 0) crossings += 1;
  }
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const size = max - min;
  const speed = clamp01((crossings / Math.max(1, n - 2)) * 2.2);
  const sizeNorm = clamp01(size * 5);
  let score = clamp01(crossings * 0.11 + sizeNorm * 0.85);
  if (size < WAVE_MIN_SPAN) {
    score *= 0.35;
  }
  const isWaving = score >= WAVE_SCORE_ON;
  return { score, speed, size: sizeNorm, isWaving };
}

function pushBuf(arr, v, maxLen) {
  arr.push(v);
  if (arr.length > maxLen) {
    arr.shift();
  }
}

export function detectRaw(landmarks) {
  if (!landmarks || landmarks.length < 25) {
    return null;
  }

  const ls = landmarks[I.LEFT_SHOULDER];
  const rs = landmarks[I.RIGHT_SHOULDER];
  const lw = landmarks[I.LEFT_WRIST];
  const rw = landmarks[I.RIGHT_WRIST];

  const shoulderW = Math.max(dist2(ls, rs), 1e-4);
  const wristSpread = dist2(lw, rw);
  const spreadRatio = wristSpread / shoulderW;

  const relLeftY = lw.y - ls.y;
  const relRightY = rw.y - rs.y;

  return {
    spreadRatio,
    relLeftY,
    relRightY,
    leftX: lw.x,
    rightX: rw.x,
  };
}

export function scalarsToBooleans(s, prevHyst) {
  const p = prevHyst || {
    armsOpen: false,
    leftUp: false,
    rightUp: false,
    leftDown: false,
    rightDown: false,
  };

  let armsOpen = p.armsOpen;
  if (s.spreadRatio >= DETECTION.armsOpenSpreadRatioOn) armsOpen = true;
  else if (s.spreadRatio <= DETECTION.armsOpenSpreadRatioOff) armsOpen = false;

  let leftUp = p.leftUp;
  if (s.relLeftY < DETECTION.handUpDeltaOn) leftUp = true;
  else if (s.relLeftY > DETECTION.handUpDeltaOff) leftUp = false;

  let rightUp = p.rightUp;
  if (s.relRightY < DETECTION.handUpDeltaOn) rightUp = true;
  else if (s.relRightY > DETECTION.handUpDeltaOff) rightUp = false;

  let leftDown = p.leftDown;
  if (s.relLeftY > DETECTION.handDownDeltaOn) leftDown = true;
  else if (s.relLeftY < DETECTION.handDownDeltaOff) leftDown = false;

  let rightDown = p.rightDown;
  if (s.relRightY > DETECTION.handDownDeltaOn) rightDown = true;
  else if (s.relRightY < DETECTION.handDownDeltaOff) rightDown = false;

  return {
    armsOpen,
    leftUp,
    rightUp,
    leftDown,
    rightDown,
    bothUp: leftUp && rightUp,
    bothDown: leftDown && rightDown,
  };
}

export function smoothScalars(prevSmooth, raw) {
  if (!raw) return prevSmooth;
  const a = SMOOTHING.alpha;
  if (!prevSmooth) {
    return { ...raw };
  }
  return {
    spreadRatio: ema(prevSmooth.spreadRatio, raw.spreadRatio, a),
    relLeftY: ema(prevSmooth.relLeftY, raw.relLeftY, a),
    relRightY: ema(prevSmooth.relRightY, raw.relRightY, a),
  };
}

const BOOL_KEYS = ["armsOpen", "leftUp", "rightUp", "bothUp", "bothDown"];

export function debounceBooleans(prev, instant) {
  const out = { ...prev.output };
  const pending = { ...prev.pending };

  for (const k of BOOL_KEYS) {
    if (instant[k] === out[k]) {
      pending[k] = 0;
      continue;
    }
    pending[k] = (pending[k] || 0) + 1;
    if (pending[k] >= STABLE_FRAMES) {
      out[k] = instant[k];
      pending[k] = 0;
    }
  }

  return { output: out, pending };
}

export function gestureLabel(output) {
  if (!output) return "—";
  if (output.bothUp) return "Arms up — strings & lift";
  if (output.bothDown) return "Hands down — softer wash";
  if (output.leftUp && !output.rightUp) return "Left — melody";
  if (output.rightUp && !output.leftUp) return "Right — rhythm";
  if (output.armsOpen) return "Open — full band";
  return "Neutral";
}

export function createGestureState() {
  return {
    smooth: null,
    hysteresis: null,
    debounce: {
      output: {
        armsOpen: false,
        leftUp: false,
        rightUp: false,
        bothUp: false,
        bothDown: false,
      },
      pending: {},
    },
    intensitySmooth: null,
    leftIntensitySmooth: null,
    rightIntensitySmooth: null,
    leftXHistory: [],
    rightXHistory: [],
    waveLeftSmooth: null,
    waveRightSmooth: null,
    waveLeftActive: false,
    waveRightActive: false,
  };
}

export function updateGestureState(state, landmarks) {
  const raw = detectRaw(landmarks);
  state.smooth = smoothScalars(state.smooth, raw);
  if (!raw) {
    return {
      raw: null,
      instant: null,
      output: state.debounce.output,
      label: "—",
      intensity: state.intensitySmooth ?? 0.45,
      leftIntensity: state.leftIntensitySmooth ?? 0.45,
      rightIntensity: state.rightIntensitySmooth ?? 0.45,
      wave: {
        left: { score: 0, speed: 0, size: 0, isWaving: false },
        right: { score: 0, speed: 0, size: 0, isWaving: false },
      },
    };
  }

  pushBuf(state.leftXHistory, raw.leftX, HAND_HISTORY_LEN);
  pushBuf(state.rightXHistory, raw.rightX, HAND_HISTORY_LEN);

  const wl = analyzeWave(state.leftXHistory);
  const wr = analyzeWave(state.rightXHistory);

  const wAlpha = 0.22;
  state.waveLeftSmooth =
    state.waveLeftSmooth === null ? wl.score : ema(state.waveLeftSmooth, wl.score, wAlpha);
  state.waveRightSmooth =
    state.waveRightSmooth === null ? wr.score : ema(state.waveRightSmooth, wr.score, wAlpha);

  let leftWaving = state.waveLeftActive;
  if (state.waveLeftSmooth >= WAVE_SCORE_ON) leftWaving = true;
  else if (state.waveLeftSmooth <= WAVE_SCORE_OFF) leftWaving = false;

  let rightWaving = state.waveRightActive;
  if (state.waveRightSmooth >= WAVE_SCORE_ON) rightWaving = true;
  else if (state.waveRightSmooth <= WAVE_SCORE_OFF) rightWaving = false;

  state.waveLeftActive = leftWaving;
  state.waveRightActive = rightWaving;

  state.hysteresis = scalarsToBooleans(state.smooth, state.hysteresis);
  const instant = {
    armsOpen: state.hysteresis.armsOpen,
    leftUp: state.hysteresis.leftUp,
    rightUp: state.hysteresis.rightUp,
    bothUp: state.hysteresis.bothUp,
    bothDown: state.hysteresis.bothDown,
  };

  state.debounce = debounceBooleans(state.debounce, instant);
  const label = gestureLabel(state.debounce.output);

  const rawIL = rawHandIntensity01(state.smooth.relLeftY);
  const rawIR = rawHandIntensity01(state.smooth.relRightY);
  const aH = HAND_INTENSITY_SMOOTHING.alpha;
  state.leftIntensitySmooth =
    state.leftIntensitySmooth === null ? rawIL : ema(state.leftIntensitySmooth, rawIL, aH);
  state.rightIntensitySmooth =
    state.rightIntensitySmooth === null ? rawIR : ema(state.rightIntensitySmooth, rawIR, aH);

  const rawI =
    (state.smooth.relLeftY + state.smooth.relRightY) / 2;
  const span = INTENSITY_RANGE.lowY - INTENSITY_RANGE.highY;
  const globalRaw = span > 1e-6 ? clamp01((INTENSITY_RANGE.lowY - rawI) / span) : 0.5;
  const aI = INTENSITY_SMOOTHING.alpha;
  state.intensitySmooth =
    state.intensitySmooth === null
      ? globalRaw
      : ema(state.intensitySmooth, globalRaw, aI);

  return {
    raw: state.smooth,
    instant,
    output: state.debounce.output,
    label,
    intensity: state.intensitySmooth,
    leftIntensity: state.leftIntensitySmooth,
    rightIntensity: state.rightIntensitySmooth,
    wave: {
      left: { ...wl, isWaving: leftWaving, scoreSmooth: state.waveLeftSmooth },
      right: { ...wr, isWaving: rightWaving, scoreSmooth: state.waveRightSmooth },
    },
  };
}

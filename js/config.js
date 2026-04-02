/**
 * Tunable detection + stabilization. Edit here without touching gesture math.
 */
export const DETECTION = {
  armsOpenSpreadRatioOn: 1.55,
  armsOpenSpreadRatioOff: 1.35,
  handUpDeltaOn: -0.04,
  handUpDeltaOff: 0.0,
  handDownDeltaOn: 0.06,
  handDownDeltaOff: 0.02,
};

export const SMOOTHING = {
  alpha: 0.42,
};

export const INTENSITY_SMOOTHING = {
  alpha: 0.14,
};

/** Per-wrist vertical intensity (EMA) */
export const HAND_INTENSITY_SMOOTHING = {
  alpha: 0.16,
};

export const INTENSITY_RANGE = {
  highY: -0.14,
  lowY: 0.11,
};

export const STABLE_FRAMES = 5;

export const PHRASE_COOLDOWN_MS = 2400;

/** Samples kept for horizontal wave analysis (~0.4s at 60fps) */
export const HAND_HISTORY_LEN = 24;

/** Min horizontal span (norm) to count as meaningful wave motion */
export const WAVE_MIN_SPAN = 0.018;
/** Oscillation + size score above this ⇒ waving */
export const WAVE_SCORE_ON = 0.22;
export const WAVE_SCORE_OFF = 0.14;

export const POSE_INDICES = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

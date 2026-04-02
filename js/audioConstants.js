export const RAMP_TIME = 0.14;

/**
 * Conservative dB ranges — max levels lowered to leave headroom when layers sum.
 */
export const LAYER_RANGES = {
  main: { minDb: -38, maxDb: -12 },
  piano: { minDb: -38, maxDb: -11 },
  pianoBothUp: { minDb: -42, maxDb: -16 },
  drums: { minDb: -40, maxDb: -10 },
  drumsBothUp: { minDb: -44, maxDb: -16 },
  strings: { minDb: -38, maxDb: -12 },
};

/** Subtracted from each active layer when 3+ layers play (reduces buildup) */
export const STACK_PENALTY_3 = 2.8;
export const STACK_PENALTY_4 = 2;

export const ENERGY_INTENSITY_DB = 4;
export const ENERGY_BOTH_UP_DB = 2;

export const BOTH_DOWN_INTENSITY_SCALE = 0.52;

/** Master bus makeup (dB) after summing — keep net below 0 dBFS */
export const MASTER_BUS_HEADROOM_DB = -5;

/** Compressor (gentle) */
export const COMPRESSOR = {
  threshold: -22,
  ratio: 3,
  attack: 0.008,
  release: 0.25,
  knee: 6,
};

/** Brick-wall style ceiling (dB) */
export const LIMITER_CEILING = -1.5;

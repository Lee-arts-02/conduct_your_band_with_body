import { PHRASE_COOLDOWN_MS } from "./config.js";

const LAYERS = ["main", "piano", "drums", "strings", "soft"];

function pickVariant(count) {
  return Math.floor(Math.random() * count);
}

function activeFlags(o) {
  if (!o) {
    return { main: false, piano: false, drums: false, strings: false, soft: false };
  }
  return {
    main: o.armsOpen,
    /** Melody / generative line — left lead or open arms */
    piano: o.leftUp || o.armsOpen,
    drums: o.rightUp,
    strings: o.bothUp,
    soft: o.bothDown,
  };
}

/**
 * On rising edges + cooldown: pick random phrase indices (0..count-1) per layer.
 */
export function createPhraseController(variantCounts) {
  const counts = {
    main: variantCounts.main ?? 3,
    piano: variantCounts.piano ?? 3,
    drums: variantCounts.drums ?? 3,
    strings: variantCounts.strings ?? 3,
    soft: variantCounts.soft ?? 3,
  };

  const indices = {
    main: 0,
    piano: 0,
    drums: 0,
    strings: 0,
    soft: 0,
  };

  const cold = -PHRASE_COOLDOWN_MS;
  const lastPickTime = {
    main: cold,
    piano: cold,
    drums: cold,
    strings: cold,
    soft: cold,
  };

  let prevActive = activeFlags(null);

  function update(nextOutput, nowMs) {
    const nextA = activeFlags(nextOutput);
    const changed = [];

    for (const key of LAYERS) {
      const was = prevActive[key];
      const is = nextA[key];
      const edge = is && !was;
      const cooled = nowMs - lastPickTime[key] >= PHRASE_COOLDOWN_MS;

      if (edge && cooled) {
        indices[key] = pickVariant(counts[key]);
        lastPickTime[key] = nowMs;
        changed.push(key);
      }
    }

    prevActive = nextA;
    return { indices: { ...indices }, changed };
  }

  function reset() {
    prevActive = activeFlags(null);
    for (const key of LAYERS) {
      lastPickTime[key] = cold;
    }
  }

  return { update, indices, reset };
}

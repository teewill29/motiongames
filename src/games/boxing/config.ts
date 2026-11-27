import type { TunableSpecs } from "../../core/tuning/tunables";

/**
 * Boxing detection thresholds. Starting values come from docs/boxing.md;
 * calibration overwrites the per-player ones (see calibration/derive.ts) and
 * every value can be tuned live from the debug overlay.
 *
 * Units: extension is BodyFrame extension (0 to ~1). Distances and speeds are
 * in body scale units (robust shoulder widths) and units/s. Angles in degrees.
 */
export const boxingConfig = {
  // Straight punches. A punch fires when extension climbs from below Start to
  // above Peak within straightMaxRiseMs, with the elbow nearly straight.
  jabStartExt: 0.55,
  jabPeakExt: 0.85,
  crossStartExt: 0.55,
  crossPeakExt: 0.85,
  straightMaxRiseMs: 250,
  straightMinElbow: 140,
  /** Max sideways wrist travel away from the centerline during a straight (rules out arms swung out to the side). */
  straightMaxOutward: 0.6,

  // Hooks: bent elbow, fast sideways wrist motion toward the centerline, at or above shoulder height.
  hookMinElbow: 60,
  hookMaxElbow: 120,
  hookMinSpeed: 2.5,

  // Uppercuts: fast upward wrist motion that started below shoulder height, bent elbow.
  uppercutMinSpeed: 2.5,
  uppercutMinElbow: 50,
  uppercutMaxElbow: 120,
  /** How far back (ms) to look for the wrist having been below shoulder height. */
  uppercutLookbackMs: 300,

  // Shared punch rules.
  /** Min time between punches from the same hand. */
  cooldownMs: 200,
  /** After the first frame that matches any punch, wait this long and pick the strongest match. */
  decisionWindowMs: 66,
  /** After a punch, the hand re-arms once its speed drops below this (and it is back toward guard). */
  rearmSpeed: 3,
  /** A wrist up to this far below the shoulder line still counts as a head shot. */
  headTolerance: 0.15,
  /** Lowest body-shot target, in torso lengths below the shoulder line. Lower punches are ignored. */
  bodyMaxDrop: 0.5,

  // Guard.
  /** High guard: both wrists within this distance of the nose... */
  guardRadius: 0.7,
  /** ...and no lower than this below the shoulder line (spec: above shoulder height; calibration widens it). */
  guardMaxDrop: 0.15,
  /** Low guard: both wrists between the shoulder line and this many torso lengths below it... */
  lowGuardMaxDrop: 0.45,
  /** ...and within this distance of the body centerline. */
  lowGuardMaxSide: 0.9,

  // Slip: nose moves sideways relative to the hips.
  slipThreshold: 0.35,
  /** Slip ends when the offset falls below threshold × this. */
  slipExitRatio: 0.7,
  /** Shoulders must stay within this tilt (degrees) for a slip. */
  slipMaxTilt: 35,

  // Duck: shoulder midpoint drops below its baseline, in torso lengths.
  duckThreshold: 0.25,
  duckExitRatio: 0.7,

  /** Time constant (ms) for re-centering slip/duck baselines while the player is neutral. 0 = never. */
  baselineAdaptMs: 4000,
};

export type BoxingConfig = typeof boxingConfig;

export const boxingConfigSpecs: TunableSpecs<BoxingConfig> = {
  jabStartExt: { min: 0, max: 1.2, step: 0.01, label: "Jab start ext" },
  jabPeakExt: { min: 0, max: 1.2, step: 0.01, label: "Jab peak ext" },
  crossStartExt: { min: 0, max: 1.2, step: 0.01, label: "Cross start ext" },
  crossPeakExt: { min: 0, max: 1.2, step: 0.01, label: "Cross peak ext" },
  straightMaxRiseMs: { min: 50, max: 800, step: 10, label: "Straight max rise (ms)" },
  straightMinElbow: { min: 90, max: 180, step: 1, label: "Straight min elbow (°)" },
  straightMaxOutward: { min: 0.1, max: 2, step: 0.05, label: "Straight max outward" },
  hookMinElbow: { min: 0, max: 180, step: 1, label: "Hook min elbow (°)" },
  hookMaxElbow: { min: 0, max: 180, step: 1, label: "Hook max elbow (°)" },
  hookMinSpeed: { min: 0.5, max: 10, step: 0.1, label: "Hook min speed" },
  uppercutMinSpeed: { min: 0.5, max: 10, step: 0.1, label: "Uppercut min speed" },
  uppercutMinElbow: { min: 0, max: 180, step: 1, label: "Uppercut min elbow (°)" },
  uppercutMaxElbow: { min: 0, max: 180, step: 1, label: "Uppercut max elbow (°)" },
  uppercutLookbackMs: { min: 50, max: 800, step: 10, label: "Uppercut lookback (ms)" },
  cooldownMs: { min: 0, max: 1000, step: 10, label: "Hand cooldown (ms)" },
  decisionWindowMs: { min: 0, max: 300, step: 1, label: "Decision window (ms)" },
  rearmSpeed: { min: 0.2, max: 10, step: 0.1, label: "Re-arm speed" },
  headTolerance: { min: 0, max: 1, step: 0.01, label: "Head tolerance" },
  bodyMaxDrop: { min: 0.1, max: 1.5, step: 0.05, label: "Body max drop (torso)" },
  guardRadius: { min: 0.2, max: 2, step: 0.05, label: "Guard radius" },
  guardMaxDrop: { min: -0.5, max: 1, step: 0.01, label: "Guard max drop" },
  lowGuardMaxDrop: { min: 0.1, max: 1.5, step: 0.05, label: "Low guard max drop (torso)" },
  lowGuardMaxSide: { min: 0.2, max: 2, step: 0.05, label: "Low guard max side" },
  slipThreshold: { min: 0.05, max: 1.5, step: 0.01, label: "Slip threshold" },
  slipExitRatio: { min: 0.1, max: 1, step: 0.05, label: "Slip exit ratio" },
  slipMaxTilt: { min: 0, max: 90, step: 1, label: "Slip max tilt (°)" },
  duckThreshold: { min: 0.05, max: 1, step: 0.01, label: "Duck threshold (torso)" },
  duckExitRatio: { min: 0.1, max: 1, step: 0.05, label: "Duck exit ratio" },
  baselineAdaptMs: { min: 0, max: 20000, step: 500, label: "Baseline adapt (ms)" },
};

/** The spec's starting values, untouched by tuning or calibration. Derivation clamps against these. */
export const BOXING_SPEC_DEFAULTS: Readonly<BoxingConfig> = Object.freeze({ ...boxingConfig });

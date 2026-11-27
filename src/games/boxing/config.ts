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
  // Straight punches, read from the upper arm's on-screen length
  // (BodyFrame upperArmRatio: ~1 side-on, ~0.2 pointing at the camera). The
  // tracker's depth is too unreliable for punches thrown at the camera, so this
  // is 2D. A punch fires when the ratio drops from above Start to below Peak
  // within straightMaxRiseMs, with the elbow raised near shoulder height.
  jabStartRatio: 0.75,
  jabPeakRatio: 0.5,
  crossStartRatio: 0.75,
  crossPeakRatio: 0.5,
  straightMaxRiseMs: 250,
  /** Elbow no lower than this below the shoulder line at the punch peak, scale units. */
  straightMaxElbowDrop: 0.5,
  /** Max sideways wrist travel away from the centerline during a straight (rules out arms swung out to the side). */
  straightMaxOutward: 0.6,

  // Hooks: bent elbow, fast sideways wrist motion toward the centerline, at or above shoulder height.
  hookMinElbow: 60,
  hookMaxElbow: 120,
  hookMinSpeed: 2.5,
  /** A hook's upper arm stays side-on (ratio above this); a cross sweeping across the body points it at the camera. */
  hookMinUpperRatio: 0.55,

  // Uppercuts: fast upward wrist motion that started below shoulder height, bent elbow.
  uppercutMinSpeed: 2.5,
  uppercutMinElbow: 50,
  uppercutMaxElbow: 120,
  /** How far back (ms) to look for the wrist having been below shoulder height. */
  uppercutLookbackMs: 300,
  /** Extra wait (ms) past the decision window while an uppercut is still rising, to judge its height at the top. */
  uppercutPeakWaitMs: 150,
  /** Both hands rising together is raising the guard, not an uppercut: the other hand must rise slower than this. */
  uppercutOtherHandMaxSpeed: 1.5,

  // Shared punch rules.
  /** Min time between punches from the same hand. */
  cooldownMs: 200,
  /** Wrist speeds above this (scale units/s) are tracking glitches; such frames are ignored. */
  maxWristSpeed: 20,
  /**
   * After the first frame that matches any punch, wait this long and pick the
   * strongest match. Long enough to see a cross's upper arm turn toward the
   * camera after its hook-like start.
   */
  decisionWindowMs: 100,
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
  jabStartRatio: { min: 0, max: 1.5, step: 0.01, label: "Jab start (upper arm ratio)" },
  jabPeakRatio: { min: 0, max: 1.5, step: 0.01, label: "Jab peak (upper arm ratio)" },
  crossStartRatio: { min: 0, max: 1.5, step: 0.01, label: "Cross start (upper arm ratio)" },
  crossPeakRatio: { min: 0, max: 1.5, step: 0.01, label: "Cross peak (upper arm ratio)" },
  straightMaxRiseMs: { min: 50, max: 800, step: 10, label: "Straight max rise (ms)" },
  straightMaxElbowDrop: { min: 0, max: 1.5, step: 0.01, label: "Straight max elbow drop" },
  straightMaxOutward: { min: 0.1, max: 2, step: 0.05, label: "Straight max outward" },
  hookMinElbow: { min: 0, max: 180, step: 1, label: "Hook min elbow (°)" },
  hookMaxElbow: { min: 0, max: 180, step: 1, label: "Hook max elbow (°)" },
  hookMinSpeed: { min: 0.5, max: 10, step: 0.1, label: "Hook min speed" },
  hookMinUpperRatio: { min: 0, max: 1.5, step: 0.01, label: "Hook min upper arm ratio" },
  uppercutMinSpeed: { min: 0.5, max: 10, step: 0.1, label: "Uppercut min speed" },
  uppercutMinElbow: { min: 0, max: 180, step: 1, label: "Uppercut min elbow (°)" },
  uppercutMaxElbow: { min: 0, max: 180, step: 1, label: "Uppercut max elbow (°)" },
  uppercutLookbackMs: { min: 50, max: 800, step: 10, label: "Uppercut lookback (ms)" },
  uppercutPeakWaitMs: { min: 0, max: 400, step: 10, label: "Uppercut peak wait (ms)" },
  uppercutOtherHandMaxSpeed: { min: 0.2, max: 10, step: 0.1, label: "Uppercut other hand max" },
  cooldownMs: { min: 0, max: 1000, step: 10, label: "Hand cooldown (ms)" },
  maxWristSpeed: { min: 5, max: 60, step: 1, label: "Glitch speed" },
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

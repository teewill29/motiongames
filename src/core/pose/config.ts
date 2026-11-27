import type { TunableSpecs } from "../tuning/tunables";

/**
 * Pose smoothing and visibility thresholds. Tunable live from the debug overlay.
 * Smoothing runs on normalized image coordinates and on world meters, which
 * have similar magnitudes, so one parameter set serves both.
 */
export const poseConfig = {
  /** One Euro: cutoff at rest (Hz). */
  minCutoff: 1.2,
  /** One Euro: speed coefficient. Normalized units, so far larger than pixel-space values. */
  beta: 10,
  /** One Euro: derivative cutoff (Hz). */
  dCutoff: 1.0,
  /** Landmarks below this visibility are treated as not visible. */
  minVisibility: 0.5,
  /** A gap longer than this (ms) between poses resets smoothing and velocity. */
  resetGapMs: 500,
  /** Window (ms) for BodyFrame.scale, the max shoulder width that ignores torso turns. */
  scaleWindowMs: 1500,
};

export type PoseConfig = typeof poseConfig;

export const poseConfigSpecs: TunableSpecs<PoseConfig> = {
  minCutoff: { min: 0.05, max: 10, step: 0.05, label: "Smoothing min cutoff (Hz)" },
  beta: { min: 0, max: 60, step: 0.5, label: "Smoothing beta" },
  dCutoff: { min: 0.1, max: 5, step: 0.1, label: "Smoothing d-cutoff (Hz)" },
  minVisibility: { min: 0, max: 1, step: 0.05, label: "Min visibility" },
  resetGapMs: { min: 50, max: 2000, step: 50, label: "Reset gap (ms)" },
  scaleWindowMs: { min: 0, max: 5000, step: 100, label: "Body scale window (ms)" },
};

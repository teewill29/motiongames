import type { TunableSpecs } from "../tuning/tunables";

/** Thresholds the calibration steps use to decide the player is in position, still, etc. */
export const calibrationConfig = {
  /** Pause between steps, ms, so one movement can't spill into the next step. */
  stepRestMs: 1500,
  /** Calibration punches slower than this (ms from guard to peak) are noise, not punches. */
  punchMaxRiseMs: 500,
  /** Body scale (shoulder width / image height) range that counts as a good distance. */
  minScale: 0.1,
  maxScale: 0.35,
  /** Max horizontal offset of the shoulders from image center, as a fraction of image width. */
  centerTolerance: 0.15,
  positionHoldMs: 1000,
  /** Body movement below this (scale units/s) counts as holding still. */
  stillSpeed: 0.8,
  neutralHoldMs: 2000,
  armHoldMs: 1000,
  /** Elbow angle that counts as a straight arm during the arms-out step (side-on to the camera, so 3D is reliable). */
  straightArmElbow: 150,
  /** Arms-out step: wrists at least this far (scale units) out from the body's center. */
  armsOutMinReach: 1.2,
  /** Arms-at-camera step: upper arm ratio below this counts as pointing at the camera. */
  forwardMaxRatio: 0.55,
  guardHoldMs: 2000,
  punchesPerType: 3,
  /** A calibration punch: the upper arm ratio drops this far below its guard value. */
  punchMargin: 0.2,
  /** Smallest slip (scale units) or duck (torso lengths) that counts during calibration. */
  minSlip: 0.2,
  minDuck: 0.12,

  // How calibrated measurements become detector thresholds (games/boxing/calibration/derive.ts).
  /** Punch start threshold: guard ratio minus this fraction of the guard-to-punch gap. */
  startFraction: 0.3,
  /** Punch peak threshold: guard ratio minus this fraction of the guard-to-punch gap. */
  peakFraction: 0.6,
  /** Slip and duck thresholds: this fraction of the calibrated slip or duck. */
  slipFraction: 0.7,
  duckFraction: 0.6,
  /** Guard radius: the guard's furthest wrist-to-nose distance × this. */
  guardRadiusMargin: 1.3,
};

export type CalibrationConfig = typeof calibrationConfig;

export const calibrationConfigSpecs: TunableSpecs<CalibrationConfig> = {
  stepRestMs: { min: 0, max: 5000, step: 100, label: "Rest between steps (ms)" },
  punchMaxRiseMs: { min: 100, max: 2000, step: 50, label: "Calibration punch max rise (ms)" },
  minScale: { min: 0.02, max: 0.5, step: 0.01, label: "Min body scale" },
  maxScale: { min: 0.1, max: 1, step: 0.01, label: "Max body scale" },
  centerTolerance: { min: 0.02, max: 0.5, step: 0.01, label: "Center tolerance" },
  positionHoldMs: { min: 0, max: 5000, step: 100, label: "Position hold (ms)" },
  stillSpeed: { min: 0.1, max: 5, step: 0.1, label: "Still speed (scale/s)" },
  neutralHoldMs: { min: 500, max: 5000, step: 100, label: "Neutral hold (ms)" },
  armHoldMs: { min: 200, max: 5000, step: 100, label: "Arm hold (ms)" },
  straightArmElbow: { min: 100, max: 180, step: 1, label: "Straight arm elbow (°)" },
  armsOutMinReach: { min: 0.5, max: 3, step: 0.05, label: "Arms-out min reach" },
  forwardMaxRatio: { min: 0.1, max: 1, step: 0.01, label: "Arms-forward max ratio" },
  guardHoldMs: { min: 500, max: 5000, step: 100, label: "Guard hold (ms)" },
  punchesPerType: { min: 1, max: 10, step: 1, label: "Calibration punches" },
  punchMargin: { min: 0.05, max: 0.8, step: 0.01, label: "Punch ratio margin" },
  minSlip: { min: 0.05, max: 1, step: 0.01, label: "Min calibration slip" },
  minDuck: { min: 0.02, max: 0.6, step: 0.01, label: "Min calibration duck" },
  startFraction: { min: 0.05, max: 0.9, step: 0.05, label: "Derive: start fraction" },
  peakFraction: { min: 0.1, max: 1, step: 0.05, label: "Derive: peak fraction" },
  slipFraction: { min: 0.2, max: 1, step: 0.05, label: "Derive: slip fraction" },
  duckFraction: { min: 0.2, max: 1, step: 0.05, label: "Derive: duck fraction" },
  guardRadiusMargin: { min: 1, max: 2, step: 0.05, label: "Derive: guard margin" },
};

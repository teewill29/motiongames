import type { TunableSpecs } from "../tuning/tunables";

/** Thresholds the calibration steps use to decide the player is in position, still, etc. */
export const calibrationConfig = {
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
  /** Elbow angle that counts as a straight arm during the arm steps. */
  straightArmElbow: 150,
  guardHoldMs: 2000,
  punchesPerType: 3,
  /** A calibration punch starts this far (extension) above the guard extension. */
  punchMargin: 0.1,
  /** ...and the elbow opens this many degrees past its guard angle. */
  punchElbowMargin: 25,
  /** Smallest slip (scale units) or duck (torso lengths) that counts during calibration. */
  minSlip: 0.2,
  minDuck: 0.12,

  // How calibrated measurements become detector thresholds (games/boxing/calibration/derive.ts).
  /** Punch start threshold: guard extension + this fraction of the guard-to-peak gap. */
  startFraction: 0.3,
  /** Punch peak threshold: guard extension + this fraction of the guard-to-peak gap. */
  peakFraction: 0.7,
  /** Slip and duck thresholds: this fraction of the calibrated slip or duck. */
  slipFraction: 0.6,
  duckFraction: 0.6,
  /** Guard radius: the guard's furthest wrist-to-nose distance × this. */
  guardRadiusMargin: 1.3,
};

export type CalibrationConfig = typeof calibrationConfig;

export const calibrationConfigSpecs: TunableSpecs<CalibrationConfig> = {
  minScale: { min: 0.02, max: 0.5, step: 0.01, label: "Min body scale" },
  maxScale: { min: 0.1, max: 1, step: 0.01, label: "Max body scale" },
  centerTolerance: { min: 0.02, max: 0.5, step: 0.01, label: "Center tolerance" },
  positionHoldMs: { min: 0, max: 5000, step: 100, label: "Position hold (ms)" },
  stillSpeed: { min: 0.1, max: 5, step: 0.1, label: "Still speed (scale/s)" },
  neutralHoldMs: { min: 500, max: 5000, step: 100, label: "Neutral hold (ms)" },
  armHoldMs: { min: 200, max: 5000, step: 100, label: "Arm hold (ms)" },
  straightArmElbow: { min: 100, max: 180, step: 1, label: "Straight arm elbow (°)" },
  guardHoldMs: { min: 500, max: 5000, step: 100, label: "Guard hold (ms)" },
  punchesPerType: { min: 1, max: 10, step: 1, label: "Calibration punches" },
  punchMargin: { min: 0.02, max: 0.4, step: 0.01, label: "Punch ext margin" },
  punchElbowMargin: { min: 5, max: 80, step: 1, label: "Punch elbow margin (°)" },
  minSlip: { min: 0.05, max: 1, step: 0.01, label: "Min calibration slip" },
  minDuck: { min: 0.02, max: 0.6, step: 0.01, label: "Min calibration duck" },
  startFraction: { min: 0.05, max: 0.9, step: 0.05, label: "Derive: start fraction" },
  peakFraction: { min: 0.1, max: 1, step: 0.05, label: "Derive: peak fraction" },
  slipFraction: { min: 0.2, max: 1, step: 0.05, label: "Derive: slip fraction" },
  duckFraction: { min: 0.2, max: 1, step: 0.05, label: "Derive: duck fraction" },
  guardRadiusMargin: { min: 1, max: 2, step: 0.05, label: "Derive: guard margin" },
};

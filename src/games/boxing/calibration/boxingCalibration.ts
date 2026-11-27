import type { Storage } from "../../../core/storage/storage";
import type { Stance } from "../types";

export interface GuardArm {
  ext: number;
  elbow: number;
  /** BodyFrame upperArmRatio in guard. */
  upperRatio: number;
}

export interface PunchSample {
  /** Lowest upperArmRatio during the punch (upper arm most pointed at the camera). */
  minRatio: number;
  /** Elbow below the shoulder line at that moment, scale units. */
  elbowDrop: number;
  /** Wrist below the shoulder line at that moment, scale units: how low the player's head-height punches land. */
  wristDrop: number;
  /** Peak 3D extension, for reference. */
  peakExt: number;
  /** ms from leaving guard to peak. */
  riseMs: number;
  /** Peak wrist speed, scale units/s. */
  peakSpeed: number;
}

/** Boxing-specific calibration results, stored next to the shared profile. */
export interface BoxingCalibration {
  version: 2;
  createdAt: string;
  stance: Stance;
  guard: {
    left: GuardArm;
    right: GuardArm;
    /** Furthest wrist-to-nose distance in guard, scale units. */
    maxWristNose: number;
    /** Lowest wrist in guard, scale units below the shoulder line (negative = above). */
    maxWristDrop: number;
    /** Head lean in guard ((nose.x - hipMid.x) / scale): the slip baseline. */
    lean: number;
    /** Shoulder midpoint y in guard: the duck baseline. */
    shoulderY: number;
  };
  punches: { jab: PunchSample[]; cross: PunchSample[] };
  /** Largest calibrated slip each way, scale units; null if skipped. */
  slip: { left: number | null; right: number | null };
  /** Deepest calibrated duck, torso lengths; null if skipped. */
  duck: number | null;
}

const KEY = "boxing.calibration";

export function loadBoxingCalibration(storage: Storage): BoxingCalibration | null {
  const c = storage.get<BoxingCalibration>(KEY);
  return c && c.version === 2 && c.guard && c.punches ? c : null;
}

export function saveBoxingCalibration(storage: Storage, c: BoxingCalibration): void {
  storage.set(KEY, c);
}

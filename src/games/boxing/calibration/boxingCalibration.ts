import type { Storage } from "../../../core/storage/storage";
import type { Stance } from "../types";

export interface GuardArm {
  ext: number;
  elbow: number;
}

export interface PunchSample {
  peakExt: number;
  peakElbow: number;
  /** ms from leaving guard to peak. */
  riseMs: number;
  /** Peak wrist speed, scale units/s. */
  peakSpeed: number;
}

/** Boxing-specific calibration results, stored next to the shared profile. */
export interface BoxingCalibration {
  version: 1;
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
  return c && c.version === 1 && c.guard && c.punches ? c : null;
}

export function saveBoxingCalibration(storage: Storage, c: BoxingCalibration): void {
  storage.set(KEY, c);
}

import type { Vec2 } from "../body/geometry";
import type { Storage } from "../storage/storage";

/**
 * Body measurements from the shared calibration flow. Positions are in
 * BodyFrame view space; lengths in view units unless noted.
 */
export interface CalibrationProfile {
  version: 1;
  createdAt: string;
  /** BodyFrame.scale (robust shoulder width) at neutral stance. */
  shoulderWidth: number;
  /** Neutral shoulder midpoint. */
  shoulderMid: Vec2;
  /** Neutral nose position. */
  nose: Vec2;
  /** Neutral hip midpoint. */
  hipMid: Vec2;
  /** Neutral shoulderMid-to-hipMid length. */
  torsoLength: number;
  /** Max shoulder-to-wrist distance per arm, world meters (arms out to the sides). */
  armLength: { left: number; right: number };
  /** Extension reached with each arm pointed straight at the camera. Depth is hard for the tracker, so this is often below 1. */
  forwardExtension: { left: number; right: number };
}

const KEY = "calibration.profile";

export function loadProfile(storage: Storage): CalibrationProfile | null {
  const p = storage.get<CalibrationProfile>(KEY);
  return p && p.version === 1 && p.armLength && p.shoulderMid ? p : null;
}

export function saveProfile(storage: Storage, profile: CalibrationProfile): void {
  storage.set(KEY, profile);
}

/**
 * Current distance relative to calibration: 1 = same, 1.2 = 20% closer.
 * The architecture asks for a recalibration prompt beyond ±15%.
 */
export function distanceRatio(profile: CalibrationProfile, currentScale: number): number {
  return profile.shoulderWidth > 0 ? currentScale / profile.shoulderWidth : 1;
}

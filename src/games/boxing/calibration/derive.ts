import { median } from "../../../core/calibration/hold";
import type { CalibrationConfig } from "../../../core/calibration/config";
import type { CalibrationProfile } from "../../../core/calibration/profile";
import type { BoxingConfig } from "../config";
import { baselineFromProfile, type DefenseBaseline } from "../input/defenseDetector";
import { leadSide } from "../types";
import type { BoxingCalibration, PunchSample } from "./boxingCalibration";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Smallest guard-to-punch upper arm ratio gap that still gives usable thresholds. Below it, defaults stay. */
const MIN_RATIO_GAP = 0.15;
/** Extra room (scale units) below the calibrated punches' lowest elbow. */
const ELBOW_DROP_ROOM = 0.15;
/** Extra room (scale units) below the calibrated punches' lowest wrist that still counts as a head shot. */
const HEAD_ROOM = 0.15;
/** Floor for the slip threshold: punches move the head this much on their own. */
const MIN_SLIP_THRESHOLD = 0.25;
/** Extra room (scale units) below the calibrated guard's lowest wrist. */
const GUARD_DROP_ROOM = 0.15;

/**
 * Turns calibration measurements into detector thresholds. Returns only the
 * values it could derive; everything else keeps its default.
 */
export function deriveBoxingConfig(
  cal: BoxingCalibration,
  base: Readonly<BoxingConfig>,
  dc: Readonly<CalibrationConfig>,
): Partial<BoxingConfig> {
  const out: Partial<BoxingConfig> = {};
  const lead = leadSide(cal.stance);
  const rear = lead === "left" ? "right" : "left";

  // Straights: thresholds sit between the hand's guard ratio and its calibrated punches.
  const straight = (guardRatio: number, samples: PunchSample[]) => {
    if (samples.length === 0) return null;
    const punch = median(samples.map((s) => s.minRatio));
    const gap = guardRatio - punch;
    if (gap < MIN_RATIO_GAP) return null;
    return { start: guardRatio - dc.startFraction * gap, peak: guardRatio - dc.peakFraction * gap };
  };
  const jab = straight(cal.guard[lead].upperRatio, cal.punches.jab);
  if (jab) {
    out.jabStartRatio = jab.start;
    out.jabPeakRatio = jab.peak;
  }
  const cross = straight(cal.guard[rear].upperRatio, cal.punches.cross);
  if (cross) {
    out.crossStartRatio = cross.start;
    out.crossPeakRatio = cross.peak;
  }

  const all = [...cal.punches.jab, ...cal.punches.cross];
  if (all.length > 0) {
    out.straightMaxElbowDrop = clamp(Math.max(...all.map((s) => s.elbowDrop)) + ELBOW_DROP_ROOM, base.straightMaxElbowDrop, 1);
    out.straightMaxRiseMs = clamp(median(all.map((s) => s.riseMs)) * 2, base.straightMaxRiseMs, 500);
    // Head shots land where the player's calibration punches (aimed at the camera) landed.
    out.headTolerance = clamp(Math.max(...all.map((s) => s.wristDrop)) + HEAD_ROOM, base.headTolerance, 1);
  }

  out.guardRadius = clamp(cal.guard.maxWristNose * dc.guardRadiusMargin, base.guardRadius, 1.5);
  // Let the guard sit as low as the player's own guard, plus a little room.
  out.guardMaxDrop = clamp(cal.guard.maxWristDrop + GUARD_DROP_ROOM, base.guardMaxDrop, 0.8);

  if (cal.slip.left !== null && cal.slip.right !== null) {
    out.slipThreshold = clamp(dc.slipFraction * Math.min(cal.slip.left, cal.slip.right), MIN_SLIP_THRESHOLD, 0.6);
  }
  if (cal.duck !== null) out.duckThreshold = clamp(dc.duckFraction * cal.duck, 0.08, 0.4);
  return out;
}

export function defenseBaseline(profile: CalibrationProfile, cal: BoxingCalibration | null): DefenseBaseline {
  return baselineFromProfile(profile, cal ? { lean: cal.guard.lean, shoulderY: cal.guard.shoulderY } : undefined);
}

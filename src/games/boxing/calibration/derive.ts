import { median } from "../../../core/calibration/hold";
import type { CalibrationConfig } from "../../../core/calibration/config";
import type { CalibrationProfile } from "../../../core/calibration/profile";
import type { BoxingConfig } from "../config";
import { baselineFromProfile, type DefenseBaseline } from "../input/defenseDetector";
import { leadSide } from "../types";
import type { BoxingCalibration, PunchSample } from "./boxingCalibration";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Smallest guard-to-peak gap that still gives usable thresholds. Below it, defaults stay. */
const MIN_EXTENSION_GAP = 0.05;
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

  const straight = (guardExt: number, samples: PunchSample[]) => {
    if (samples.length === 0) return null;
    const peak = median(samples.map((s) => s.peakExt));
    const gap = peak - guardExt;
    if (gap < MIN_EXTENSION_GAP) return null;
    return { start: guardExt + dc.startFraction * gap, peak: guardExt + dc.peakFraction * gap };
  };
  const jab = straight(cal.guard[lead].ext, cal.punches.jab);
  if (jab) {
    out.jabStartExt = jab.start;
    out.jabPeakExt = jab.peak;
  }
  const cross = straight(cal.guard[rear].ext, cal.punches.cross);
  if (cross) {
    out.crossStartExt = cross.start;
    out.crossPeakExt = cross.peak;
  }

  const all = [...cal.punches.jab, ...cal.punches.cross];
  if (all.length > 0) {
    out.straightMinElbow = clamp(Math.min(...all.map((s) => s.peakElbow)) - 10, 110, base.straightMinElbow);
    out.straightMaxRiseMs = clamp(Math.max(...all.map((s) => s.riseMs)) * 1.5, base.straightMaxRiseMs, 500);
  }

  out.guardRadius = clamp(cal.guard.maxWristNose * dc.guardRadiusMargin, base.guardRadius, 1.5);
  // Let the guard sit as low as the player's own guard, plus a little room.
  out.guardMaxDrop = clamp(cal.guard.maxWristDrop + GUARD_DROP_ROOM, base.guardMaxDrop, 0.8);

  if (cal.slip.left !== null && cal.slip.right !== null) {
    out.slipThreshold = clamp(dc.slipFraction * Math.min(cal.slip.left, cal.slip.right), 0.12, 0.6);
  }
  if (cal.duck !== null) out.duckThreshold = clamp(dc.duckFraction * cal.duck, 0.08, 0.4);
  return out;
}

export function defenseBaseline(profile: CalibrationProfile, cal: BoxingCalibration | null): DefenseBaseline {
  return baselineFromProfile(profile, cal ? { lean: cal.guard.lean, shoulderY: cal.guard.shoulderY } : undefined);
}

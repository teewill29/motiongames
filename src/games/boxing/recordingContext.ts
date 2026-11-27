import type { CalibrationProfile } from "../../core/calibration/profile";
import type { PoseRecording } from "../../core/recorder/format";
import type { BoxingCalibration } from "./calibration/boxingCalibration";
import type { Stance } from "./types";

/** Stored in PoseRecording.context by boxing screens. */
export interface BoxingRecordingContext {
  game: "boxing";
  stance: Stance;
  profile: CalibrationProfile | null;
  calibration: BoxingCalibration | null;
}

export function boxingContextOf(rec: PoseRecording): BoxingRecordingContext | null {
  const c = rec.context;
  if (!c || c.game !== "boxing") return null;
  const stance = c.stance === "southpaw" ? "southpaw" : "orthodox";
  return {
    game: "boxing",
    stance,
    profile: (c.profile as CalibrationProfile | null) ?? null,
    calibration: (c.calibration as BoxingCalibration | null) ?? null,
  };
}

/**
 * Labels for recordings meant as test fixtures. The label sets the file name
 * and the expected counts in tests/fixtures/manifest.json.
 */
export const RECORDING_LABELS = [
  { label: "free", hint: "Anything (not a fixture)" },
  { label: "jab-x10", hint: "10 jabs" },
  { label: "cross-x10", hint: "10 crosses" },
  { label: "hook-lead-x10", hint: "10 lead hooks" },
  { label: "hook-rear-x10", hint: "10 rear hooks" },
  { label: "uppercut-lead-x10", hint: "10 lead uppercuts" },
  { label: "uppercut-rear-x10", hint: "10 rear uppercuts" },
  { label: "jab-body-x10", hint: "10 jabs to the body" },
  { label: "slip-left-x5", hint: "5 slips left" },
  { label: "slip-right-x5", hint: "5 slips right" },
  { label: "duck-x5", hint: "5 ducks" },
  { label: "guard-idle", hint: "30 s guard, small moves, no punches" },
] as const;

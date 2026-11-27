import type { ArmProfile } from "../../../core/body/buildBodyFrame";
import type { CalibrationConfig } from "../../../core/calibration/config";
import { saveProfile, type CalibrationProfile } from "../../../core/calibration/profile";
import type { CalibrationStep } from "../../../core/calibration/runner";
import {
  armsForwardStep,
  armsSideStep,
  completeProfile,
  neutralStep,
  positionStep,
  type ProfileDraft,
} from "../../../core/calibration/steps";
import type { Storage } from "../../../core/storage/storage";
import type { TunableRegistry } from "../../../core/tuning/tunables";
import { BOXING_SPEC_DEFAULTS, type BoxingConfig } from "../config";
import { saveBoxingSettings } from "../settings";
import type { Stance } from "../types";
import { saveBoxingCalibration, type BoxingCalibration } from "./boxingCalibration";
import { deriveBoxingConfig } from "./derive";
import {
  completeBoxingCalibration,
  duckStep,
  guardStep,
  newBoxingDraft,
  punchStep,
  slipStep,
  stanceStep,
} from "./steps";

export interface BoxingCalibrationFlow {
  steps: CalibrationStep[];
  /** Builds the results. Call once every step has finished. */
  complete(): { profile: CalibrationProfile; calibration: BoxingCalibration };
}

/**
 * The full boxing calibration: stance first (the player is still at the
 * laptop), then the shared body steps, then boxing's guard, punches, slips and duck.
 * `onArmLength` lets the caller give the pose pipeline the measured arm length
 * so later steps see calibrated extension.
 */
export function boxingCalibrationFlow(
  cfg: CalibrationConfig,
  stance: Stance,
  hooks: { onArmLength(arm: ArmProfile): void; onStance?(s: Stance): void },
): BoxingCalibrationFlow {
  const profile: ProfileDraft = {};
  const boxing = newBoxingDraft(stance);
  const steps: CalibrationStep[] = [
    stanceStep(boxing, (s) => hooks.onStance?.(s)),
    positionStep(cfg),
    neutralStep(cfg, profile),
    armsSideStep(cfg, profile, () =>
      hooks.onArmLength({ armLength: profile.armLength, upperArm2D: profile.upperArm2D, shoulderTorsoRatio: profile.shoulderTorsoRatio }),
    ),
    armsForwardStep(cfg, profile),
    guardStep(cfg, boxing),
    punchStep(cfg, boxing, "jab"),
    punchStep(cfg, boxing, "cross"),
    slipStep(cfg, boxing, "left"),
    slipStep(cfg, boxing, "right"),
    duckStep(cfg, boxing, profile),
  ];
  return {
    steps,
    complete: () => ({ profile: completeProfile(profile), calibration: completeBoxingCalibration(boxing) }),
  };
}

/**
 * Saves calibration and makes its derived thresholds the boxing tunables'
 * defaults (so slider Reset returns to them) and current values.
 */
export function saveBoxingCalibrationResults(
  storage: Storage,
  tunables: TunableRegistry,
  cfg: CalibrationConfig,
  profile: CalibrationProfile,
  calibration: BoxingCalibration,
): Partial<BoxingConfig> {
  saveProfile(storage, profile);
  saveBoxingCalibration(storage, calibration);
  saveBoxingSettings(storage, { stance: calibration.stance });
  const derived = deriveBoxingConfig(calibration, BOXING_SPEC_DEFAULTS, cfg);
  tunables.setDefaults("boxing", derived, true);
  return derived;
}

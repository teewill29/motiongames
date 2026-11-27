import type { BodyFrame } from "../../src/core/body/bodyFrame";
import { calibrationConfig } from "../../src/core/calibration/config";
import type { CalibrationProfile } from "../../src/core/calibration/profile";
import { CalibrationRunner } from "../../src/core/calibration/runner";
import { poseConfig } from "../../src/core/pose/config";
import { PosePipeline } from "../../src/core/pose/pipeline";
import type { RawPoseFrame } from "../../src/core/pose/types";
import type { BoxingCalibration } from "../../src/games/boxing/calibration/boxingCalibration";
import { defenseBaseline, deriveBoxingConfig } from "../../src/games/boxing/calibration/derive";
import { boxingCalibrationFlow } from "../../src/games/boxing/calibration/flow";
import { BOXING_SPEC_DEFAULTS, type BoxingConfig } from "../../src/games/boxing/config";
import { BoxingInput, type BoxingInputResult } from "../../src/games/boxing/input/boxingInput";
import type { Stance } from "../../src/games/boxing/types";
import { animate, punchSeries, type Keyframe } from "./syntheticPose";

/** A synthetic player doing every calibration step in order. */
export function calibrationSession(stance: Stance): RawPoseFrame[] {
  const lead = stance === "orthodox" ? "left" : "right";
  const rear = lead === "left" ? "right" : "left";
  // Each segment leaves room for the runner's rest between steps.
  const k: Keyframe[] = [
    { t: 0, left: "down", right: "down" },
    { t: 5200 },
    { t: 5500, left: "sideways", right: "sideways" },
    { t: 8500 },
    { t: 8800, left: "straight", right: "straight" },
    { t: 11800 },
    { t: 12100, left: "guard", right: "guard" },
    { t: 16500 },
  ];
  const append = (keys: Keyframe[]) => {
    const offset = k[k.length - 1]!.t;
    for (const key of keys.slice(1)) k.push({ ...key, t: key.t + offset });
  };
  append(punchSeries({ side: lead, path: ["straight"], count: 3, stepMs: [150], leadInMs: 300 }));
  append([{ t: 0 }, { t: 1600 }]);
  append(punchSeries({ side: rear, path: ["straight"], count: 3, stepMs: [150], leadInMs: 300 }));
  append([{ t: 0 }, { t: 1600 }, { t: 1900, upper: [0.2, 0, 0] }, { t: 2200 }, { t: 2500, upper: [0, 0, 0] }, { t: 2800 }]);
  append([{ t: 0 }, { t: 1600 }, { t: 1900, upper: [-0.2, 0, 0] }, { t: 2200 }, { t: 2500, upper: [0, 0, 0] }, { t: 2800 }]);
  append([{ t: 0 }, { t: 1600 }, { t: 1900, upper: [0, 0.2, 0] }, { t: 2200 }, { t: 2500, upper: [0, 0, 0] }, { t: 3000 }]);
  return animate(k);
}

export interface Calibrated {
  stance: Stance;
  profile: CalibrationProfile;
  boxing: BoxingCalibration;
  config: BoxingConfig;
}

/** Runs the calibration flow over frames. Throws if it doesn't finish. */
export function runCalibration(frames: RawPoseFrame[], stance: Stance): Calibrated & { finishedAt: number } {
  const pipeline = new PosePipeline({ ...poseConfig });
  const cfg = { ...calibrationConfig };
  const flow = boxingCalibrationFlow(cfg, stance, { onArmLength: (arm) => pipeline.setProfile(arm) });
  const runner = new CalibrationRunner(flow.steps, undefined, cfg.stepRestMs);
  runner.choose(stance);
  let finishedAt = -1;
  for (const raw of frames) {
    const f = pipeline.push(raw);
    runner.update(f);
    if (runner.finished) {
      finishedAt = raw.timestamp;
      break;
    }
  }
  if (!runner.finished) throw new Error(`Calibration stuck at step "${runner.current?.id}": ${runner.status.hint}`);
  const { profile: p, calibration: b } = flow.complete();
  const config = { ...BOXING_SPEC_DEFAULTS, ...deriveBoxingConfig(b, BOXING_SPEC_DEFAULTS, cfg) };
  return { stance, profile: p, boxing: b, config, finishedAt };
}

let cached: Calibrated | null = null;
/** Calibration for the default synthetic orthodox player. */
export function syntheticCalibration(): Calibrated {
  cached ??= runCalibration(calibrationSession("orthodox"), "orthodox");
  return cached;
}

export interface DetectionRun {
  frames: BodyFrame[];
  results: BoxingInputResult[];
  punches: BoxingInputResult["punches"];
  defense: BoxingInputResult["defense"];
}

/** Runs raw frames through pipeline + boxing input with a calibration. */
export function detect(raws: RawPoseFrame[], cal: Calibrated, configOverride: Partial<BoxingConfig> = {}): DetectionRun {
  const pipeline = new PosePipeline({ ...poseConfig }, cal.profile);
  const input = new BoxingInput({ ...cal.config, ...configOverride }, cal.stance, defenseBaseline(cal.profile, cal.boxing));
  const frames: BodyFrame[] = [];
  const results = raws.map((r) => {
    const f = pipeline.push(r);
    frames.push(f);
    return input.update(f);
  });
  return {
    frames,
    results,
    punches: results.flatMap((r) => r.punches),
    defense: results.flatMap((r) => r.defense),
  };
}

/** Counts punch events by "type" or "type:target". */
export function countPunches(run: DetectionRun): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of run.punches) out[p.type] = (out[p.type] ?? 0) + 1;
  return out;
}

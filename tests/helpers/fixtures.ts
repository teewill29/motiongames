import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BodyFrame } from "../../src/core/body/bodyFrame";
import { calibrationConfig } from "../../src/core/calibration/config";
import { poseConfig, type PoseConfig } from "../../src/core/pose/config";
import { PosePipeline } from "../../src/core/pose/pipeline";
import { parseRecording, recordingToFrames, type PoseRecording } from "../../src/core/recorder/format";
import { deriveBoxingConfig } from "../../src/games/boxing/calibration/derive";
import { BOXING_SPEC_DEFAULTS } from "../../src/games/boxing/config";
import { boxingContextOf } from "../../src/games/boxing/recordingContext";
import { detect, type DetectionRun } from "./boxingSetup";

export const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export function loadFixture(name: string): PoseRecording {
  return parseRecording(readFileSync(join(FIXTURES, name), "utf8"));
}

/** Runs a recorded session through the real pipeline and returns every BodyFrame. */
export function replayFixture(name: string, config: PoseConfig = { ...poseConfig }): BodyFrame[] {
  const pipeline = new PosePipeline(config);
  return recordingToFrames(loadFixture(name)).map((raw) => pipeline.push(raw));
}

/**
 * Runs a boxing recording through pipeline + detectors using the calibration
 * stored in the file, with current default thresholds derived from it.
 */
export function detectFixture(name: string): DetectionRun {
  const rec = loadFixture(name);
  const ctx = boxingContextOf(rec);
  if (!ctx?.profile || !ctx.calibration) throw new Error(`${name} has no boxing calibration in its context`);
  const config = { ...BOXING_SPEC_DEFAULTS, ...deriveBoxingConfig(ctx.calibration, BOXING_SPEC_DEFAULTS, calibrationConfig) };
  return detect(recordingToFrames(rec), { stance: ctx.stance, profile: ctx.profile, boxing: ctx.calibration, config });
}

export interface ManifestEntry {
  file: string;
  /** Expected counts: punch types ("jab", "hook", "jab:body") and defense entries ("slip:left", "duck"). */
  expect: Record<string, number>;
  /** Allowed miss/extra per count. 9 of 10 means tolerance 1. */
  tolerance: number;
  source: "synthetic" | "owner";
  note?: string;
}

export function loadManifest(): ManifestEntry[] {
  return (JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8")) as { fixtures: ManifestEntry[] }).fixtures;
}

/** Counts by punch type, punch type:target, and defense entry event. */
export function countEvents(run: DetectionRun): Record<string, number> {
  const out: Record<string, number> = {};
  const inc = (k: string) => (out[k] = (out[k] ?? 0) + 1);
  for (const p of run.punches) {
    inc(p.type);
    inc(`${p.type}:${p.target}`);
  }
  for (const d of run.defense) if (d.type === "slip:left" || d.type === "slip:right" || d.type === "duck") inc(d.type);
  return out;
}

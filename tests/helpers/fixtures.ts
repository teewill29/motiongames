import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BodyFrame } from "../../src/core/body/bodyFrame";
import { poseConfig, type PoseConfig } from "../../src/core/pose/config";
import { PosePipeline } from "../../src/core/pose/pipeline";
import { parseRecording, recordingToFrames, type PoseRecording } from "../../src/core/recorder/format";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export function loadFixture(name: string): PoseRecording {
  return parseRecording(readFileSync(join(FIXTURES, name), "utf8"));
}

/** Runs a recorded session through the real pipeline and returns every BodyFrame. */
export function replayFixture(name: string, config: PoseConfig = { ...poseConfig }): BodyFrame[] {
  const pipeline = new PosePipeline(config);
  return recordingToFrames(loadFixture(name)).map((raw) => pipeline.push(raw));
}

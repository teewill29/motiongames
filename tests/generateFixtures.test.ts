import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { PoseRecorder } from "../src/core/recorder/recorder";
import { serializeRecording } from "../src/core/recorder/format";
import type { BoxingRecordingContext } from "../src/games/boxing/recordingContext";
import { syntheticCalibration } from "./helpers/boxingSetup";
import { FIXTURES } from "./helpers/fixtures";
import { animate, punchSeries, type Keyframe } from "./helpers/syntheticPose";

/**
 * Regenerates the synthetic fixtures in tests/fixtures/. Skipped in normal
 * test runs; run with `npm run fixtures:synthetic`.
 */
it.runIf(process.env.WRITE_FIXTURES)("writes synthetic fixtures", () => {
  const cal = syntheticCalibration();
  const context: BoxingRecordingContext = { game: "boxing", stance: cal.stance, profile: cal.profile, calibration: cal.boxing };
  const write = (label: string, keys: Keyframe[]) => {
    const rec = new PoseRecorder();
    rec.start({ model: "synthetic", delegate: "none", imageWidth: 1280, imageHeight: 720 }, { ...context });
    for (const f of animate(keys)) rec.add(f);
    const out = rec.stop(label)!;
    out.createdAt = "2026-01-01T00:00:00.000Z";
    writeFileSync(join(FIXTURES, `synthetic-${label}.json`), serializeRecording(out));
  };
  write("jab-x5", punchSeries({ side: "left", path: ["straight"], count: 5, stepMs: [150] }));
  write("cross-x5", punchSeries({ side: "right", path: ["straight"], count: 5, stepMs: [150] }));
  write("hook-lead-x5", punchSeries({ side: "left", path: ["hookWind", "hookFinish"], count: 5, stepMs: [200, 150] }));
  write("hook-rear-x5", punchSeries({ side: "right", path: ["hookWind", "hookFinish"], count: 5, stepMs: [200, 150] }));
  write("uppercut-lead-x5", punchSeries({ side: "left", path: ["uppercutDip", "uppercutFinish"], count: 5, stepMs: [200, 150] }));
  write("uppercut-rear-x5", punchSeries({ side: "right", path: ["uppercutDip", "uppercutFinish"], count: 5, stepMs: [200, 150] }));
  const defense: Keyframe[] = [{ t: 0 }, { t: 600 }];
  let t = 600;
  for (const shift of [[0.2, 0, 0], [-0.2, 0, 0], [0, 0.2, 0], [0.2, 0, 0], [-0.2, 0, 0], [0, 0.2, 0]] as const) {
    defense.push({ t: (t += 250), upper: [...shift] }, { t: (t += 300) }, { t: (t += 250), upper: [0, 0, 0] }, { t: (t += 500) });
  }
  write("defense-x2", defense);
});

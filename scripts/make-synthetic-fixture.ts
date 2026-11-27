// Writes tests/fixtures/synthetic-jab-left-x3.json: three geometrically perfect
// left-arm jabs. Real fixtures come from the recorder (R key); this one exists so
// the fixture replay path has a test before real recordings arrive.
// Run: node scripts/make-synthetic-fixture.ts
import { writeFileSync } from "node:fs";
import { syntheticJabs } from "../tests/helpers/syntheticPose.ts";

const r = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;
const tuple = (l: { x: number; y: number; z: number; visibility: number }) => [r(l.x, 5), r(l.y, 5), r(l.z, 5), r(l.visibility, 3)];

const frames = syntheticJabs({ side: "left", count: 3 }).map((f) => ({
  t: f.timestamp,
  lm: f.pose ? f.pose.image.map(tuple) : null,
  wl: f.pose ? f.pose.world.map(tuple) : null,
}));

const rec = {
  format: "motiongames.pose-session",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  label: "synthetic-jab-left-x3",
  meta: { model: "synthetic", delegate: "none", imageWidth: 1280, imageHeight: 720 },
  frames,
};

const out = new URL("../tests/fixtures/synthetic-jab-left-x3.json", import.meta.url);
writeFileSync(out, JSON.stringify(rec));
console.log(`wrote ${frames.length} frames to ${out.pathname}`);

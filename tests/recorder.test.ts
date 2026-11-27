import { describe, expect, it } from "vitest";
import { parseRecording, recordingToFrames, RecordingFormatError, serializeRecording } from "../src/core/recorder/format";
import { PoseRecorder } from "../src/core/recorder/recorder";
import { frameAt, syntheticPose } from "./helpers/syntheticPose";

const meta = { model: "full", delegate: "GPU", imageWidth: 1280, imageHeight: 720 };

describe("PoseRecorder", () => {
  it("records frames with times relative to the first frame", () => {
    const r = new PoseRecorder();
    expect(r.recording).toBe(false);
    r.add(frameAt(5, syntheticPose())); // ignored: not recording
    r.start(meta);
    r.add(frameAt(1000, syntheticPose()));
    r.add(frameAt(1033.3, null));
    r.add(frameAt(1066.7, syntheticPose()));
    expect(r.frameCount).toBe(3);
    expect(r.durationMs).toBeCloseTo(66.7, 1);
    const rec = r.stop("test")!;
    expect(r.recording).toBe(false);
    expect(rec.frames.map((f) => f.t)).toEqual([0, 33.3, 66.7]);
    expect(rec.frames[1]!.lm).toBeNull();
    expect(rec.label).toBe("test");
  });

  it("returns null when stopped with nothing captured", () => {
    const r = new PoseRecorder();
    r.start(meta);
    expect(r.stop()).toBeNull();
  });

  it("round-trips through JSON within rounding precision", () => {
    const r = new PoseRecorder();
    r.start(meta);
    const pose = syntheticPose();
    r.add(frameAt(0, pose));
    r.add(frameAt(33, null));
    const json = serializeRecording(r.stop()!);
    const frames = recordingToFrames(parseRecording(json));
    expect(frames).toHaveLength(2);
    expect(frames[0]!.imageAspect).toBeCloseTo(16 / 9, 10);
    expect(frames[1]!.pose).toBeNull();
    const back = frames[0]!.pose!;
    pose.image.forEach((l, i) => {
      expect(back.image[i]!.x).toBeCloseTo(l.x, 4);
      expect(back.image[i]!.y).toBeCloseTo(l.y, 4);
      expect(back.world[i]!.z).toBeCloseTo(pose.world[i]!.z, 4);
    });
  });
});

describe("parseRecording", () => {
  const valid = () => ({
    format: "motiongames.pose-session",
    version: 1,
    createdAt: "",
    label: "",
    meta,
    frames: [{ t: 0, lm: null, wl: null }],
  });

  it("accepts a minimal valid file", () => {
    expect(parseRecording(JSON.stringify(valid())).frames).toHaveLength(1);
  });

  it.each([
    ["not json", "{"],
    ["wrong format", JSON.stringify({ ...valid(), format: "other" })],
    ["wrong version", JSON.stringify({ ...valid(), version: 99 })],
    ["no frames", JSON.stringify({ ...valid(), frames: [] })],
    ["no image size", JSON.stringify({ ...valid(), meta: { model: "full" } })],
    ["timestamps going back", JSON.stringify({ ...valid(), frames: [{ t: 10, lm: null, wl: null }, { t: 5, lm: null, wl: null }] })],
    ["malformed landmarks", JSON.stringify({ ...valid(), frames: [{ t: 0, lm: [[1, 2]], wl: [] }] })],
  ])("rejects %s", (_name, json) => {
    expect(() => parseRecording(json)).toThrow(RecordingFormatError);
  });
});

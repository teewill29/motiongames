import type { RawPoseFrame } from "../pose/types";
import { RECORDING_FORMAT, RECORDING_VERSION, toTuple, type PoseRecording, type RecordingMeta } from "./format";

/** Collects RawPoseFrames into a PoseRecording. */
export class PoseRecorder {
  private frames: PoseRecording["frames"] = [];
  private startT: number | null = null;
  private meta: RecordingMeta | null = null;
  private startedAt = "";
  private context: Record<string, unknown> | undefined;

  get recording(): boolean {
    return this.meta !== null;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** ms covered so far. */
  get durationMs(): number {
    return this.frames.length ? this.frames[this.frames.length - 1]!.t : 0;
  }

  start(meta: RecordingMeta, context?: Record<string, unknown>): void {
    this.frames = [];
    this.startT = null;
    this.meta = meta;
    this.context = context;
    this.startedAt = new Date().toISOString();
  }

  add(raw: RawPoseFrame): void {
    if (!this.meta) return;
    if (this.startT === null) this.startT = raw.timestamp;
    this.frames.push({
      t: Math.round((raw.timestamp - this.startT) * 10) / 10,
      lm: raw.pose ? raw.pose.image.map(toTuple) : null,
      wl: raw.pose ? raw.pose.world.map(toTuple) : null,
    });
  }

  /** Stops and returns the recording, or null if nothing was captured. */
  stop(label = ""): PoseRecording | null {
    const meta = this.meta;
    this.meta = null;
    if (!meta || this.frames.length === 0) return null;
    const rec: PoseRecording = {
      format: RECORDING_FORMAT,
      version: RECORDING_VERSION,
      createdAt: this.startedAt,
      label,
      meta,
      ...(this.context ? { context: this.context } : {}),
      frames: this.frames,
    };
    this.frames = [];
    return rec;
  }
}

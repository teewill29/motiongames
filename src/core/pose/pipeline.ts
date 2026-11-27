import type { BodyFrame } from "../body/bodyFrame";
import { BodyFrameBuilder } from "../body/buildBodyFrame";
import type { CalibrationProfile } from "../calibration/profile";
import type { PoseConfig } from "./config";
import type { RawPoseFrame } from "./types";

type Listener = (frame: BodyFrame, raw: RawPoseFrame) => void;

/**
 * RawPoseFrame in, BodyFrame out. Live camera and replay both push into this,
 * so everything downstream (detectors, recorder, debug) can't tell them apart.
 */
export class PosePipeline {
  private readonly builder: BodyFrameBuilder;
  private readonly listeners = new Set<Listener>();
  latest: BodyFrame | null = null;

  constructor(config: PoseConfig, profile: CalibrationProfile | null = null) {
    this.builder = new BodyFrameBuilder(config, profile);
  }

  push(raw: RawPoseFrame): BodyFrame {
    const frame = this.builder.build(raw);
    this.latest = frame;
    for (const l of this.listeners) l(frame, raw);
    return frame;
  }

  /** Runs frames through the builder without notifying listeners (rebuilds filter state after a seek). */
  warm(raws: readonly RawPoseFrame[]): void {
    for (const raw of raws) this.latest = this.builder.build(raw);
  }

  reset(): void {
    this.builder.reset();
    this.latest = null;
  }

  setProfile(profile: CalibrationProfile | null): void {
    this.builder.setProfile(profile);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

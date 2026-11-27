import type { PoseTracker } from "./poseTracker";
import type { RawPoseFrame } from "./types";

export interface LiveSourceStats {
  /** Last inference time in ms. */
  inferenceMs: number;
}

/**
 * Runs the tracker once per new camera frame and emits RawPoseFrames.
 * Uses requestVideoFrameCallback so each camera frame is processed exactly once.
 */
export class LivePoseSource {
  private running = false;
  private handle = 0;
  readonly stats: LiveSourceStats = { inferenceMs: 0 };

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly tracker: PoseTracker,
    private readonly onFrame: (frame: RawPoseFrame) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if ("cancelVideoFrameCallback" in this.video) this.video.cancelVideoFrameCallback(this.handle);
    cancelAnimationFrame(this.handle);
  }

  private schedule(): void {
    if (!this.running) return;
    if ("requestVideoFrameCallback" in this.video) {
      this.handle = this.video.requestVideoFrameCallback(() => this.tick());
    } else {
      this.handle = requestAnimationFrame(() => this.tick());
    }
  }

  private lastVideoTime = -1;

  private tick(): void {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth > 0 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const t0 = performance.now();
      const pose = this.tracker.detect(v, t0);
      this.stats.inferenceMs = performance.now() - t0;
      this.onFrame({ timestamp: t0, pose, imageAspect: v.videoWidth / v.videoHeight });
    }
    this.schedule();
  }
}

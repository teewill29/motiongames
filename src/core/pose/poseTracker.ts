import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseModel } from "../settings/settings";
import { resolvePoseAssets } from "./assets";
import type { Landmark, RawPose } from "./types";

export type Delegate = "GPU" | "CPU";

export interface PoseTrackerInfo {
  model: PoseModel;
  delegate: Delegate;
  assetSource: "local" | "cdn";
}

/** Thin wrapper over MediaPipe PoseLandmarker. Nothing outside core/pose imports MediaPipe. */
export class PoseTracker {
  private lastTimestamp = -1;

  private constructor(
    private readonly landmarker: PoseLandmarker,
    readonly info: PoseTrackerInfo,
  ) {}

  /** Loads the runtime and model. Tries the GPU delegate first, then CPU. */
  static async create(model: PoseModel): Promise<PoseTracker> {
    const assets = await resolvePoseAssets(model);
    const fileset = await FilesetResolver.forVisionTasks(assets.wasmBase);
    let lastError: unknown;
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: assets.modelUrl, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        return new PoseTracker(landmarker, { model, delegate, assetSource: assets.source });
      } catch (err) {
        console.warn(`[pose] ${delegate} delegate failed`, err);
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not start pose tracking");
  }

  /** Runs detection on the current video frame. Timestamps must increase; this enforces it. */
  detect(video: HTMLVideoElement, timestampMs: number): RawPose | null {
    const ts = Math.max(timestampMs, this.lastTimestamp + 0.001);
    this.lastTimestamp = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    const image = result.landmarks[0];
    const world = result.worldLandmarks[0];
    if (!image || !world) return null;
    return { image: image.map(copyLandmark), world: world.map(copyLandmark) };
  }

  close(): void {
    this.landmarker.close();
  }
}

function copyLandmark(l: { x: number; y: number; z: number; visibility: number }): Landmark {
  return { x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 };
}

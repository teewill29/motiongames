import type { CalibrationProfile } from "../calibration/profile";
import type { PoseConfig } from "../pose/config";
import { KEY_LANDMARK_NAMES, LANDMARK_COUNT, LM, REQUIRED_FOR_TRACKING, type KeyLandmarkName } from "../pose/landmarks";
import { OneEuroFilter } from "../pose/oneEuro";
import type { Landmark, RawPoseFrame } from "../pose/types";
import type { ArmState, BodyFrame, BodyPoint, Side } from "./bodyFrame";
import { angle3, dist2, dist3, mid2, type Vec2 } from "./geometry";

const ARM_LANDMARKS: Record<Side, { shoulder: number; elbow: number; wrist: number }> = {
  left: { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist },
  right: { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist },
};

/** Smooths every coordinate of every landmark with its own One Euro filter. */
class LandmarkSmoother {
  private readonly filters: OneEuroFilter[];

  constructor(config: PoseConfig) {
    this.filters = Array.from({ length: LANDMARK_COUNT * 3 }, () => new OneEuroFilter(config));
  }

  smooth(points: BodyPoint[], t: number): BodyPoint[] {
    return points.map((p, i) => ({
      x: this.filters[i * 3]!.filter(p.x, t),
      y: this.filters[i * 3 + 1]!.filter(p.y, t),
      z: this.filters[i * 3 + 2]!.filter(p.z, t),
      visibility: p.visibility,
    }));
  }

  reset(): void {
    for (const f of this.filters) f.reset();
  }
}

/** Image coordinates -> mirrored, aspect-corrected view space. */
function toView(l: Landmark, aspect: number): BodyPoint {
  return { x: (1 - l.x) * aspect, y: l.y, z: l.z * aspect, visibility: l.visibility };
}

/** World coordinates with x mirrored to match view space. */
function toWorld(l: Landmark): BodyPoint {
  return { x: -l.x, y: l.y, z: l.z, visibility: l.visibility };
}

const ZERO: Vec2 = { x: 0, y: 0 };

function emptyArm(): ArmState {
  return {
    visible: false,
    extension: 0,
    elbowAngle: 180,
    reach: 0,
    wrist: ZERO,
    wristVelocity: ZERO,
    wristVelocityZ: 0,
  };
}

function untrackedFrame(raw: RawPoseFrame): BodyFrame {
  return {
    timestamp: raw.timestamp,
    tracked: false,
    imageAspect: raw.imageAspect,
    landmarks: [],
    world: [],
    visible: Object.fromEntries(KEY_LANDMARK_NAMES.map((n) => [n, false])) as Record<KeyLandmarkName, boolean>,
    shoulderWidth: 0,
    shoulderMid: ZERO,
    hipMid: ZERO,
    torsoLength: 0,
    nose: ZERO,
    arms: { left: emptyArm(), right: emptyArm() },
  };
}

/**
 * Turns RawPoseFrames into BodyFrames. Stateful: holds the smoothing filters and
 * the previous frame for velocities, so feed frames in order and call reset()
 * when jumping in time (replay seeks).
 */
export class BodyFrameBuilder {
  private readonly imageSmoother: LandmarkSmoother;
  private readonly worldSmoother: LandmarkSmoother;
  private prev: BodyFrame | null = null;

  constructor(
    private readonly config: PoseConfig,
    private profile: CalibrationProfile | null = null,
  ) {
    this.imageSmoother = new LandmarkSmoother(config);
    this.worldSmoother = new LandmarkSmoother(config);
  }

  setProfile(profile: CalibrationProfile | null): void {
    this.profile = profile;
  }

  reset(): void {
    this.imageSmoother.reset();
    this.worldSmoother.reset();
    this.prev = null;
  }

  build(raw: RawPoseFrame): BodyFrame {
    const t = raw.timestamp;
    if (!raw.pose || raw.pose.image.length < LANDMARK_COUNT || raw.pose.world.length < LANDMARK_COUNT) {
      this.reset();
      return untrackedFrame(raw);
    }
    if (this.prev && t - this.prev.timestamp > this.config.resetGapMs) this.reset();

    const aspect = raw.imageAspect;
    const landmarks = this.imageSmoother.smooth(raw.pose.image.map((l) => toView(l, aspect)), t);
    const world = this.worldSmoother.smooth(raw.pose.world.map(toWorld), t);

    const minVis = this.config.minVisibility;
    const visible = Object.fromEntries(
      KEY_LANDMARK_NAMES.map((n) => [n, landmarks[LM[n]]!.visibility >= minVis]),
    ) as Record<KeyLandmarkName, boolean>;
    const tracked = REQUIRED_FOR_TRACKING.every((n) => visible[n]);

    const at = (i: number) => landmarks[i]!;
    const shoulderWidth = dist2(at(LM.leftShoulder), at(LM.rightShoulder));
    const shoulderMid = mid2(at(LM.leftShoulder), at(LM.rightShoulder));
    const hipMid = mid2(at(LM.leftHip), at(LM.rightHip));
    const torsoLength = dist2(shoulderMid, hipMid);
    const nose = { x: at(LM.nose).x, y: at(LM.nose).y };

    const prev = this.prev && this.prev.tracked ? this.prev : null;
    const dt = prev ? (t - prev.timestamp) / 1000 : 0;

    const arm = (side: Side): ArmState => {
      const ids = ARM_LANDMARKS[side];
      const s = landmarks[ids.shoulder]!, w = landmarks[ids.wrist]!;
      const ws = world[ids.shoulder]!, we = world[ids.elbow]!, ww = world[ids.wrist]!;
      const armLength = this.profile?.armLength[side] ?? dist3(ws, we) + dist3(we, ww);
      const wrist = { x: w.x, y: w.y };
      let wristVelocity = ZERO;
      let wristVelocityZ = 0;
      if (prev && dt > 0 && shoulderWidth > 0) {
        const pw = prev.arms[side].wrist;
        wristVelocity = { x: (wrist.x - pw.x) / dt / shoulderWidth, y: (wrist.y - pw.y) / dt / shoulderWidth };
        wristVelocityZ = (ww.z - prev.world[ids.wrist]!.z) / dt;
      }
      return {
        visible: [ids.shoulder, ids.elbow, ids.wrist].every((i) => landmarks[i]!.visibility >= minVis),
        extension: armLength > 0 ? dist3(ws, ww) / armLength : 0,
        elbowAngle: angle3(ws, we, ww),
        reach: shoulderWidth > 0 ? dist2(s, w) / shoulderWidth : 0,
        wrist,
        wristVelocity,
        wristVelocityZ,
      };
    };

    const frame: BodyFrame = {
      timestamp: t,
      tracked,
      imageAspect: aspect,
      landmarks,
      world,
      visible,
      shoulderWidth,
      shoulderMid,
      hipMid,
      torsoLength,
      nose,
      arms: { left: arm("left"), right: arm("right") },
    };
    this.prev = frame;
    return frame;
  }
}

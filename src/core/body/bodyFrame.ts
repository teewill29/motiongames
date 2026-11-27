import type { KeyLandmarkName } from "../pose/landmarks";
import type { Vec2 } from "./geometry";

export type Side = "left" | "right";

/** A smoothed landmark. */
export interface BodyPoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface ArmState {
  /** Shoulder, elbow and wrist are all visible. */
  visible: boolean;
  /**
   * Shoulder-to-wrist 3D distance / arm length. 0 = fist at shoulder, 1 = arm straight.
   * Uses the calibrated arm length when a profile exists, otherwise the frame's own
   * upper-arm + forearm length (which measures straightness without calibration).
   */
  extension: number;
  /** Elbow angle in degrees from world landmarks (180 = straight). */
  elbowAngle: number;
  /** 2D shoulder-to-wrist distance on screen, in body scale units (see BodyFrame.scale). */
  reach: number;
  /** Wrist position in view space. */
  wrist: Vec2;
  /** Wrist velocity in view space, body scale units per second. +x = player's right, +y = down. */
  wristVelocity: Vec2;
  /**
   * Wrist velocity relative to the shoulder midpoint, scale units/s. Moving the
   * whole upper body (slipping, ducking, stepping) leaves this near zero, so
   * detectors use it to tell hand motion from body motion.
   */
  wristVelocityBody: Vec2;
  /** Wrist depth velocity from world landmarks, m/s. Negative = toward the camera. */
  wristVelocityZ: number;
}

/**
 * One normalized, smoothed body measurement. Games read these, never raw MediaPipe output.
 *
 * View space: what the player sees on the mirrored screen. x in [0, imageAspect],
 * y in [0, 1], y down, so one unit is the image height on both axes and distances
 * are not skewed by aspect ratio. Moving your right hand to your right moves +x.
 *
 * World space: MediaPipe world landmarks in meters, hip-centered, x mirrored to
 * match view space.
 */
export interface BodyFrame {
  timestamp: number;
  /** False when no pose was found or a required landmark (nose, shoulders) has low visibility. */
  tracked: boolean;
  imageAspect: number;
  /** All 33 smoothed landmarks in view space. Empty when no pose was found. */
  landmarks: BodyPoint[];
  /** All 33 smoothed world landmarks. Empty when no pose was found. */
  world: BodyPoint[];
  visible: Record<KeyLandmarkName, boolean>;
  /** This frame's 2D shoulder width, in view units. Shrinks when the torso turns. */
  shoulderWidth: number;
  /**
   * Base unit of distance, in view units: the widest shoulder width seen over the
   * last `poseConfig.scaleWindowMs`. Turning the torso to punch shrinks the 2D
   * shoulder width for a moment; the window max ignores that, while still
   * following the player when they step closer or farther.
   */
  scale: number;
  /** Shoulder line angle from horizontal, degrees. Positive = player's right shoulder lower. */
  shoulderTilt: number;
  shoulderMid: Vec2;
  hipMid: Vec2;
  /** shoulderMid to hipMid, in view units. */
  torsoLength: number;
  nose: Vec2;
  arms: Record<Side, ArmState>;
}

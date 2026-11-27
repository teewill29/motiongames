/** One landmark as MediaPipe reports it. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/**
 * One detected pose, straight from the tracker (unsmoothed, unmirrored).
 * - `image`: normalized image coordinates, x and y in [0, 1], y down, as the camera sees it.
 * - `world`: meters, origin at the hip center, as MediaPipe reports it.
 */
export interface RawPose {
  image: Landmark[];
  world: Landmark[];
}

/** One tracker result. `pose` is null when no person was found. */
export interface RawPoseFrame {
  /** ms. Live: performance.now(). Replay: ms since the recording started. */
  timestamp: number;
  pose: RawPose | null;
  /** Camera image width / height. */
  imageAspect: number;
}

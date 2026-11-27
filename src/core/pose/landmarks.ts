/** MediaPipe pose landmark indices. "Left" and "right" are the person's own. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

export type KeyLandmarkName = keyof typeof LM;
export const KEY_LANDMARK_NAMES = Object.keys(LM) as KeyLandmarkName[];

export const LANDMARK_COUNT = 33;

/** Landmarks that must be visible for the body to count as tracked. */
export const REQUIRED_FOR_TRACKING: readonly KeyLandmarkName[] = ["nose", "leftShoulder", "rightShoulder"];

/** Bones drawn by the debug skeleton (upper body plus legs when visible). */
export const SKELETON_CONNECTIONS: readonly [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [15, 17], [15, 19], [17, 19], [15, 21], // left hand
  [16, 18], [16, 20], [18, 20], [16, 22], // right hand
  [11, 23], [12, 24], [23, 24], // torso
  [23, 25], [25, 27], [24, 26], [26, 28], // legs
  [0, 2], [0, 5], [2, 7], [5, 8], [9, 10], // face
];

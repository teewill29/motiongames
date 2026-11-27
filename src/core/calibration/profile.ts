/**
 * Saved calibration. Phase 0 only defines the parts BodyFrame reads; the
 * calibration flow (Phase 1) fills it in.
 */
export interface CalibrationProfile {
  version: 1;
  createdAt: string;
  /** Neutral-stance shoulder width in view units (see BodyFrame). */
  shoulderWidth: number;
  /** Max shoulder-to-wrist distance per arm, in world meters. */
  armLength: { left: number; right: number };
}

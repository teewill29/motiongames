import type { BodyFrame } from "../body/bodyFrame";
import { LM } from "../pose/landmarks";

/**
 * Tracks how long a condition has held, resetting when it breaks.
 * Shared by steps that say "hold still for 2 seconds".
 */
export class HoldTimer {
  private since: number | null = null;

  update(ok: boolean, t: number): number {
    if (!ok) {
      this.since = null;
      return 0;
    }
    if (this.since === null) this.since = t;
    return t - this.since;
  }

  reset(): void {
    this.since = null;
  }
}

/** Speed (scale units/s) of the fastest of nose and wrists since the previous frame. */
export class MotionMeter {
  private prev: BodyFrame | null = null;

  update(frame: BodyFrame): number {
    const prev = this.prev;
    this.prev = frame.tracked ? frame : null;
    if (!prev || !frame.tracked || frame.scale <= 0) return Infinity;
    const dt = (frame.timestamp - prev.timestamp) / 1000;
    if (dt <= 0) return 0;
    let max = 0;
    for (const i of [LM.nose, LM.leftWrist, LM.rightWrist, LM.leftShoulder, LM.rightShoulder]) {
      const a = frame.landmarks[i]!, b = prev.landmarks[i]!;
      max = Math.max(max, Math.hypot(a.x - b.x, a.y - b.y) / dt / frame.scale);
    }
    return max;
  }

  reset(): void {
    this.prev = null;
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

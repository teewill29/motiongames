/**
 * One Euro filter (Casiez et al. 2012): an adaptive low-pass filter.
 * Slow movement gets heavy smoothing (kills jitter); fast movement raises the
 * cutoff so the signal follows with little lag (keeps punches snappy).
 */
export interface OneEuroParams {
  /** Hz. Cutoff at rest. Lower = smoother but laggier when still. */
  minCutoff: number;
  /** How fast the cutoff rises with speed. Higher = less lag on fast moves. */
  beta: number;
  /** Hz. Cutoff for the derivative estimate. */
  dCutoff: number;
}

function alpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  /** `params` is read on every call, so live tuning takes effect immediately. */
  constructor(private readonly params: OneEuroParams) {}

  /** @param timestampMs must increase between calls; equal timestamps return the last value. */
  filter(value: number, timestampMs: number): number {
    if (this.x === null || this.lastT === null) {
      this.x = value;
      this.dx = 0;
      this.lastT = timestampMs;
      return value;
    }
    const dt = (timestampMs - this.lastT) / 1000;
    if (dt <= 0) return this.x;
    this.lastT = timestampMs;

    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.params.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
    this.lastT = null;
  }
}

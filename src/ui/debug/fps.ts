/** Counts events over a sliding one-second window. */
export class FpsMeter {
  private readonly times: number[] = [];

  tick(now: number): void {
    this.times.push(now);
    while (this.times.length && now - this.times[0]! > 1000) this.times.shift();
  }

  /** Events per second over the last second. */
  value(now: number): number {
    while (this.times.length && now - this.times[0]! > 1000) this.times.shift();
    return this.times.length;
  }
}

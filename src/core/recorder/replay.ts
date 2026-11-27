import type { RawPoseFrame } from "../pose/types";

export interface ReplayCallbacks {
  /** A frame reached during normal playback or a forward step. */
  onFrame(frame: RawPoseFrame, index: number): void;
  /**
   * Playback jumped (seek, backward step, restart, loop). `history` holds every
   * frame before `index`, so the consumer can rebuild filter state, then `frame`
   * is the frame now showing.
   */
  onSeek(frame: RawPoseFrame, index: number, history: readonly RawPoseFrame[]): void;
}

/**
 * Plays recorded frames at real speed (scaled by `rate`) or steps through them.
 * Time is driven from outside with update(nowMs), so tests can use a fake clock.
 */
export class ReplayPlayer {
  private index = -1;
  private playing = false;
  /** Recording time (ms) at `anchorNow`. */
  private anchorT = 0;
  private anchorNow = 0;
  rate = 1;
  loop = false;

  constructor(
    private readonly frames: readonly RawPoseFrame[],
    private readonly cb: ReplayCallbacks,
  ) {
    if (frames.length === 0) throw new Error("Replay needs at least one frame");
  }

  get length(): number {
    return this.frames.length;
  }
  get currentIndex(): number {
    return this.index;
  }
  get isPlaying(): boolean {
    return this.playing;
  }
  get startT(): number {
    return this.frames[0]!.timestamp;
  }
  get durationMs(): number {
    return this.frames[this.frames.length - 1]!.timestamp - this.startT;
  }
  /** ms from the start of the recording to the current frame. */
  get positionMs(): number {
    return this.index < 0 ? 0 : this.frames[this.index]!.timestamp - this.startT;
  }

  play(nowMs: number): void {
    if (this.playing) return;
    if (this.index >= this.frames.length - 1) this.seek(0, nowMs);
    this.playing = true;
    this.anchorNow = nowMs;
    this.anchorT = this.index < 0 ? this.startT : this.frames[this.index]!.timestamp;
  }

  pause(): void {
    this.playing = false;
  }

  toggle(nowMs: number): void {
    if (this.playing) this.pause();
    else this.play(nowMs);
  }

  setRate(rate: number, nowMs: number): void {
    if (this.playing) {
      this.anchorT = this.timeAt(nowMs);
      this.anchorNow = nowMs;
    }
    this.rate = rate;
  }

  /** Advance playback to wall-clock time nowMs, emitting every frame passed. */
  update(nowMs: number): void {
    if (!this.playing) return;
    const t = this.timeAt(nowMs);
    while (this.index + 1 < this.frames.length && this.frames[this.index + 1]!.timestamp <= t) {
      this.index++;
      this.cb.onFrame(this.frames[this.index]!, this.index);
    }
    if (this.index >= this.frames.length - 1) {
      if (this.loop) {
        this.seek(0, nowMs);
      } else {
        this.playing = false;
      }
    }
  }

  /** Step forward (+1) or back (-1). Pauses playback. */
  step(delta: number): void {
    this.pause();
    const target = Math.min(this.frames.length - 1, Math.max(0, this.index + delta));
    if (delta === 1 && target === this.index + 1) {
      this.index = target;
      this.cb.onFrame(this.frames[target]!, target);
    } else if (target !== this.index) {
      this.seek(target);
    }
  }

  seek(index: number, nowMs: number = performance.now()): void {
    const i = Math.min(this.frames.length - 1, Math.max(0, index));
    this.index = i;
    if (this.playing) {
      this.anchorT = this.frames[i]!.timestamp;
      this.anchorNow = nowMs;
    }
    this.cb.onSeek(this.frames[i]!, i, this.frames.slice(0, i));
  }

  private timeAt(nowMs: number): number {
    return this.anchorT + (nowMs - this.anchorNow) * this.rate;
  }
}

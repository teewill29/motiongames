import type { BodyFrame } from "../body/bodyFrame";

export interface StepStatus {
  /** 0 to 1. */
  progress: number;
  done: boolean;
  /** Short live feedback, e.g. "Step back" or "2 of 3". */
  hint?: string;
}

/** A calibration step driven by BodyFrames. */
export interface FrameStep {
  kind: "frames";
  id: string;
  title: string;
  instruction: string;
  /** Whether the player may skip it (defaults are used instead). */
  skippable: boolean;
  /** Called once when the step becomes active. */
  begin?(): void;
  update(frame: BodyFrame): StepStatus;
  /** Called when the step finishes (done) so it can write its results. */
  finish(): void;
  /** Called instead of finish() when skipped. */
  skip?(): void;
}

/** A calibration step answered with mouse or keyboard. */
export interface ChoiceStep {
  kind: "choice";
  id: string;
  title: string;
  instruction: string;
  choices: { key: string; label: string; value: string }[];
  choose(value: string): void;
}

export type CalibrationStep = FrameStep | ChoiceStep;

/**
 * Runs steps in order. The UI reads `current` and `status`.
 * After each step finishes, frames are ignored for `restMs` so the tail of one
 * movement (the last cross, say) can't count toward the next step.
 */
export class CalibrationRunner {
  private index = 0;
  status: StepStatus = { progress: 0, done: false };
  /** Frame time when the rest after the last step ends; null when not resting. */
  private restUntil: number | null = null;
  private restPending = false;

  constructor(
    readonly steps: readonly CalibrationStep[],
    private readonly onStepDone?: (step: CalibrationStep) => void,
    private readonly restMs = 0,
  ) {
    this.beginCurrent();
  }

  /** True while pausing between steps. */
  get resting(): boolean {
    return this.restPending || this.restUntil !== null;
  }

  get current(): CalibrationStep | null {
    return this.steps[this.index] ?? null;
  }
  get currentIndex(): number {
    return this.index;
  }
  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  update(frame: BodyFrame): void {
    if (this.restPending) {
      this.restPending = false;
      this.restUntil = frame.timestamp + this.restMs;
    }
    if (this.restUntil !== null) {
      if (frame.timestamp < this.restUntil) return;
      this.restUntil = null;
    }
    const step = this.current;
    if (!step || step.kind !== "frames") return;
    this.status = step.update(frame);
    if (this.status.done) {
      step.finish();
      this.advance(step);
    }
  }

  choose(value: string): void {
    const step = this.current;
    if (!step || step.kind !== "choice") return;
    step.choose(value);
    this.advance(step);
  }

  /** Skips the current step if it allows it. Returns whether it skipped. */
  skip(): boolean {
    const step = this.current;
    if (!step || step.kind !== "frames" || !step.skippable) return false;
    step.skip?.();
    this.advance(step);
    return true;
  }

  /** Restarts the current step. */
  restart(): void {
    this.beginCurrent();
  }

  private advance(step: CalibrationStep): void {
    this.onStepDone?.(step);
    this.index++;
    this.beginCurrent();
    if (this.restMs > 0 && step.kind === "frames") this.restPending = true;
  }

  private beginCurrent(): void {
    this.status = { progress: 0, done: false };
    const step = this.current;
    if (step?.kind === "frames") step.begin?.();
  }
}

import { calibrationConfig } from "../../../core/calibration/config";
import { CalibrationRunner, type CalibrationStep } from "../../../core/calibration/runner";
import { boxingCalibrationFlow, saveBoxingCalibrationResults } from "../calibration/flow";
import { loadBoxingSettings } from "../settings";
import { leadSide } from "../types";
import { h } from "../../../ui/dom";
import { PoseStage } from "../../../ui/pose/poseStage";
import type { AppContext, Screen } from "../../../ui/screen";

/**
 * Walks the player through calibration with large, TV-readable instructions.
 * Keys: S skip (where allowed), Space restart step, D debug, Esc cancel.
 */
export class BoxingCalibrationScreen implements Screen {
  private root!: HTMLElement;
  private stage!: PoseStage;
  private runner!: CalibrationRunner;
  private complete!: ReturnType<typeof boxingCalibrationFlow>["complete"];
  private panel!: HTMLElement;
  private stepLabel!: HTMLElement;
  private title!: HTMLElement;
  private instruction!: HTMLElement;
  private hint!: HTMLElement;
  private bar!: HTMLElement;
  private choices!: HTMLElement;
  private list!: HTMLElement;
  private shownStep: CalibrationStep | null = null;
  private done = false;

  constructor(private readonly app: AppContext) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.stage = new PoseStage(this.app, {
      mode: { kind: "live" },
      dim: 0.35,
      onFrame: (frame) => {
        if (this.done) return;
        this.runner.update(frame);
        this.sync();
      },
      draw: (ctx, rect) => {
        if (this.runner.current?.id !== "position") return;
        // Centering guide: stand between the lines.
        const tol = calibrationConfig.centerTolerance;
        ctx.save();
        ctx.strokeStyle = "rgba(62,224,122,0.6)";
        ctx.setLineDash([12, 10]);
        ctx.lineWidth = 3;
        for (const f of [0.5 - tol, 0.5 + tol]) {
          ctx.beginPath();
          ctx.moveTo(rect.x + f * rect.w, rect.y);
          ctx.lineTo(rect.x + f * rect.w, rect.y + rect.h);
          ctx.stroke();
        }
        ctx.restore();
      },
      keysHint: "S skip · Space restart step",
    });
    this.stage.debug.visible = false;

    const flow = boxingCalibrationFlow(calibrationConfig, loadBoxingSettings(this.app.storage).stance, {
      onArmLength: (armLength) => this.stage.pipeline.setProfile({ armLength }),
    });
    this.complete = flow.complete;
    this.runner = new CalibrationRunner(flow.steps);

    this.stepLabel = h("div", { class: "cal-step" });
    this.title = h("h2", { class: "cal-title" });
    this.instruction = h("p", { class: "cal-instruction" });
    this.hint = h("div", { class: "cal-hint" });
    this.bar = h("div", { class: "cal-bar-fill" });
    this.choices = h("div", { class: "cal-choices" });
    this.panel = h(
      "section",
      { class: "cal-panel" },
      this.stepLabel,
      this.title,
      this.instruction,
      this.choices,
      this.hint,
      h("div", { class: "cal-bar" }, this.bar),
    );
    this.list = h("ol", { class: "cal-list" }, ...flow.steps.map((s) => h("li", {}, s.title)));
    const cancel = h("button", { class: "corner-button", type: "button" }, "Cancel (Esc)");
    cancel.addEventListener("click", () => this.app.navigate({ name: "hub" }));

    this.stage.mount(root);
    root.append(this.panel, this.list, cancel);
    this.sync();
  }

  unmount(): void {
    this.stage.unmount();
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.code === "Escape") {
      this.app.navigate({ name: "hub" });
      return true;
    }
    if (this.done) {
      if (e.code === "Enter") {
        this.app.navigate({ name: "boxingDetection", mode: { kind: "live" } });
        return true;
      }
      return this.stage.onKey(e);
    }
    const step = this.runner.current;
    if (step?.kind === "choice") {
      const c = step.choices.find((c) => c.key === e.key);
      if (c) {
        this.runner.choose(c.value);
        this.sync();
        return true;
      }
    }
    if (e.code === "KeyS") {
      if (this.runner.skip()) this.sync();
      return true;
    }
    if (e.code === "Space") {
      this.runner.restart();
      this.sync();
      return true;
    }
    return this.stage.onKey(e);
  }

  private sync(): void {
    if (this.runner.finished) {
      if (!this.done) this.finish();
      return;
    }
    const step = this.runner.current!;
    const i = this.runner.currentIndex;
    const status = this.runner.status;
    if (step !== this.shownStep) {
      this.shownStep = step;
      this.stepLabel.textContent = `Step ${i + 1} of ${this.runner.steps.length}`;
      this.title.textContent = step.title;
      this.instruction.textContent = step.instruction;
      this.choices.replaceChildren(
        ...(step.kind === "choice"
          ? step.choices.map((c) => {
              const b = h("button", { type: "button", class: "cal-choice" }, h("kbd", {}, c.key), " ", c.label);
              b.addEventListener("click", () => {
                this.runner.choose(c.value);
                this.sync();
              });
              return b;
            })
          : []),
      );
      [...this.list.children].forEach((li, n) => {
        li.className = n < i ? "done" : n === i ? "current" : "";
      });
    }
    this.hint.textContent =
      step.kind === "choice" ? "Click or press a number" : (status.hint ?? "") + (step.skippable ? "   ·   S to skip" : "");
    this.bar.style.width = `${Math.round(status.progress * 100)}%`;
  }

  private finish(): void {
    this.done = true;
    const { profile, calibration } = this.complete();
    const derived = saveBoxingCalibrationResults(this.app.storage, this.app.tunables, calibrationConfig, profile, calibration);
    const lead = leadSide(calibration.stance);
    const rear = lead === "left" ? "right" : "left";
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const f2 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "-" : v.toFixed(2));
    const rows: [string, string][] = [
      ["Stance", calibration.stance],
      ["Arm length (m)", `L ${f2(profile.armLength.left)} · R ${f2(profile.armLength.right)}`],
      ["Guard extension", `lead ${f2(calibration.guard[lead].ext)} · rear ${f2(calibration.guard[rear].ext)}`],
      ["Jab peaks", calibration.punches.jab.map((p) => f2(p.peakExt)).join(", ")],
      ["Cross peaks", calibration.punches.cross.map((p) => f2(p.peakExt)).join(", ")],
      ["Jab start → peak", `${f2(derived.jabStartExt)} → ${f2(derived.jabPeakExt)}`],
      ["Cross start → peak", `${f2(derived.crossStartExt)} → ${f2(derived.crossPeakExt)}`],
      ["Avg rise (ms)", f2(avg([...calibration.punches.jab, ...calibration.punches.cross].map((p) => p.riseMs)))],
      ["Slip L / R", `${f2(calibration.slip.left)} / ${f2(calibration.slip.right)} → threshold ${f2(derived.slipThreshold)}`],
      ["Duck", `${f2(calibration.duck)} → threshold ${f2(derived.duckThreshold)}`],
    ];
    const go = h("button", { type: "button", class: "primary" }, "Detection test (Enter)");
    go.addEventListener("click", () => this.app.navigate({ name: "boxingDetection", mode: { kind: "live" } }));
    const hub = h("button", { type: "button" }, "Hub (Esc)");
    hub.addEventListener("click", () => this.app.navigate({ name: "hub" }));
    this.panel.replaceChildren(
      h("h2", { class: "cal-title" }, "Calibration saved"),
      h("div", { class: "cal-summary" }, ...rows.map(([k, v]) => h("div", { class: "debug-row" }, h("span", {}, k), h("b", {}, v)))),
      h("div", { class: "cal-actions" }, go, hub),
    );
    [...this.list.children].forEach((li) => (li.className = "done"));
  }
}

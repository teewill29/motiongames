import type { BodyFrame } from "../../../core/body/bodyFrame";
import { loadProfile, distanceRatio, type CalibrationProfile } from "../../../core/calibration/profile";
import { h } from "../../../ui/dom";
import { PoseStage, type StageMode } from "../../../ui/pose/poseStage";
import type { AppContext, Screen } from "../../../ui/screen";
import { loadBoxingCalibration, type BoxingCalibration } from "../calibration/boxingCalibration";
import { calibrationConfig } from "../../../core/calibration/config";
import { defenseBaseline, deriveBoxingConfig } from "../calibration/derive";
import { BOXING_SPEC_DEFAULTS, boxingConfig } from "../config";
import { BoxingInput, toInputEvents } from "../input/boxingInput";
import { boxingContextOf, RECORDING_LABELS, type BoxingRecordingContext } from "../recordingContext";
import { loadBoxingSettings } from "../settings";
import type { PunchEvent, Stance } from "../types";

const COUNTERS = [
  ["jab", "Jab"],
  ["cross", "Cross"],
  ["hook-left", "Hook L"],
  ["hook-right", "Hook R"],
  ["uppercut-left", "Upper L"],
  ["uppercut-right", "Upper R"],
  ["body", "To body"],
  ["slip-left", "Slip L"],
  ["slip-right", "Slip R"],
  ["duck", "Duck"],
] as const;
type CounterKey = (typeof COUNTERS)[number][0];

/** Beyond this change in distance since calibration, prompt to recalibrate (architecture: 15%). */
const DISTANCE_TOLERANCE = 0.15;
/** How long the distance must stay off before the prompt shows, ms. */
const DISTANCE_PROMPT_MS = 1000;
const LABEL_MS = 900;

/**
 * Phase 1 screen: labels every detected punch and defense in large text, with
 * counters per type and the thresholds live on the debug overlay (D).
 * Keys: R record (labeled), C reset counters, K recalibrate, D debug, Esc hub.
 */
export class DetectionTestScreen implements Screen {
  private root!: HTMLElement;
  private stage: PoseStage | null = null;
  private input: BoxingInput | null = null;
  private profile: CalibrationProfile | null = null;
  private calibration: BoxingCalibration | null = null;
  private stance: Stance = "orthodox";
  private readonly counts = new Map<CounterKey, number>();
  private counterEls = new Map<CounterKey, HTMLElement>();
  private label!: HTMLElement;
  private labelSub!: HTMLElement;
  private labelTimer = 0;
  private pills!: Record<"guard" | "slipLeft" | "slipRight" | "duck", HTMLElement>;
  private banner!: HTMLElement;
  private labelSelect!: HTMLSelectElement;
  private offDistanceSince: number | null = null;
  /** Live thresholds to put back after replaying with a recording's calibration. */
  private savedThresholds: Record<string, number> | null = null;

  constructor(
    private readonly app: AppContext,
    private readonly mode: StageMode,
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
    const ctx = this.mode.kind === "replay" ? boxingContextOf(this.mode.recording) : null;
    this.profile = ctx?.profile ?? loadProfile(this.app.storage);
    this.calibration = ctx?.calibration ?? loadBoxingCalibration(this.app.storage);
    this.stance = ctx?.stance ?? this.calibration?.stance ?? loadBoxingSettings(this.app.storage).stance;

    if (!this.profile || !this.calibration) {
      const go = h("button", { type: "button", class: "primary" }, "Calibrate (K)");
      go.addEventListener("click", () => this.app.navigate({ name: "boxingCalibration" }));
      const back = h("button", { type: "button" }, "Hub (Esc)");
      back.addEventListener("click", () => this.app.navigate({ name: "hub" }));
      root.append(
        h(
          "main",
          { class: "settings" },
          h("h1", {}, "Calibrate first"),
          h("p", { class: "hint" }, "Detection thresholds come from your calibration. It takes about two minutes."),
          h("div", { class: "cal-actions" }, go, back),
        ),
      );
      return;
    }

    if (ctx?.calibration) {
      // Replay with the thresholds this recording's calibration gives; restore the live ones on exit.
      this.savedThresholds = { ...boxingConfig };
      const derived = deriveBoxingConfig(ctx.calibration, BOXING_SPEC_DEFAULTS, calibrationConfig);
      for (const [k, v] of Object.entries(derived)) this.app.tunables.set("boxing", k, v);
    }
    this.input = new BoxingInput(boxingConfig, this.stance, defenseBaseline(this.profile, this.calibration));
    this.stage = new PoseStage(this.app, {
      mode: this.mode,
      profile: this.profile,
      dim: 0.25,
      onFrame: (f) => this.onFrame(f),
      onSeek: () => this.input?.reset(),
      draw: (c, rect, f, debug) => debug && f && this.drawZones(c, rect, f),
      stats: () => this.stats(),
      recordingContext: () => this.recordingContext(),
      recordingLabel: () => this.labelSelect.value,
      onRecordingChange: (on) => on && this.resetCounters(),
      keysHint: "C clear · K calibrate",
    });
    // HUD first: a replay starts emitting frames as soon as the stage mounts.
    const hud = this.buildHud();
    this.stage.mount(root);
    root.append(...hud);
  }

  unmount(): void {
    clearTimeout(this.labelTimer);
    this.stage?.unmount();
    if (this.savedThresholds) for (const [k, v] of Object.entries(this.savedThresholds)) this.app.tunables.set("boxing", k, v);
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    switch (e.code) {
      case "Escape":
        this.app.navigate({ name: "hub" });
        return true;
      case "KeyK":
        this.app.navigate({ name: "boxingCalibration" });
        return true;
      case "KeyC":
        this.resetCounters();
        return true;
    }
    return this.stage?.onKey(e) ?? false;
  }

  // ---- HUD ----

  private buildHud(): HTMLElement[] {
    this.label = h("div", { class: "det-label" });
    this.labelSub = h("div", { class: "det-label-sub" });
    const pill = (text: string) => h("div", { class: "det-pill" }, text);
    this.pills = { slipLeft: pill("◀ SLIP"), guard: pill("GUARD"), duck: pill("DUCK"), slipRight: pill("SLIP ▶") };
    const counters = h(
      "div",
      { class: "det-counters" },
      ...COUNTERS.map(([key, name]) => {
        const value = h("b", {}, "0");
        this.counterEls.set(key, value);
        return h("div", { class: "det-counter" }, h("span", {}, name), value);
      }),
    );
    this.banner = h("div", { class: "det-banner", hidden: true });

    this.labelSelect = h("select", { title: "Label for the next recording" }, ...RECORDING_LABELS.map((l) => h("option", { value: l.label }, `${l.label}: ${l.hint}`)));
    this.labelSelect.addEventListener("change", () => this.labelSelect.blur());
    const recPanel = h("div", { class: "det-rec", hidden: this.mode.kind !== "live" }, h("span", {}, "Next recording (R):"), this.labelSelect);

    const back = h("button", { class: "corner-button", type: "button" }, "← Hub (Esc)");
    back.addEventListener("click", () => this.app.navigate({ name: "hub" }));

    this.renderCounters();
    return [
      h("div", { class: "det-center" }, this.label, this.labelSub),
      h("div", { class: "det-pills" }, this.pills.slipLeft, this.pills.guard, this.pills.duck, this.pills.slipRight),
      counters,
      this.banner,
      recPanel,
      back,
    ];
  }

  private calibrationSource(): string {
    return this.mode.kind === "replay" && boxingContextOf(this.mode.recording)?.calibration
      ? "from recording"
      : "saved";
  }

  private showLabel(text: string, sub: string, kind: string): void {
    this.label.textContent = text;
    this.labelSub.textContent = sub;
    this.label.className = `det-label show ${kind}`;
    this.labelSub.className = "det-label-sub show";
    // Restart the fade animation.
    void this.label.offsetWidth;
    clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => {
      this.label.classList.remove("show");
      this.labelSub.classList.remove("show");
    }, LABEL_MS);
  }

  private bump(key: CounterKey): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.renderCounters();
  }

  private resetCounters(): void {
    this.counts.clear();
    this.renderCounters();
  }

  private renderCounters(): void {
    for (const [key, el] of this.counterEls) el.textContent = String(this.counts.get(key) ?? 0);
  }

  // ---- per frame ----

  private onFrame(f: BodyFrame): void {
    const input = this.input!;
    const r = input.update(f);
    for (const e of toInputEvents(r)) this.app.events.emit(e);
    for (const p of r.punches) this.onPunch(p);
    for (const d of r.defense) {
      if (d.type === "slip:left") {
        this.bump("slip-left");
        this.showLabel("SLIP LEFT", "", "defense");
      } else if (d.type === "slip:right") {
        this.bump("slip-right");
        this.showLabel("SLIP RIGHT", "", "defense");
      } else if (d.type === "duck") {
        this.bump("duck");
        this.showLabel("DUCK", "", "defense");
      }
    }
    const s = r.signals;
    this.pills.guard.textContent = s.guard === "low" ? "LOW GUARD" : "GUARD";
    this.pills.guard.classList.toggle("on", s.guard !== "none");
    this.pills.slipLeft.classList.toggle("on", s.slip === "left");
    this.pills.slipRight.classList.toggle("on", s.slip === "right");
    this.pills.duck.classList.toggle("on", s.duck);
    this.checkDistance(f);
  }

  private onPunch(p: PunchEvent): void {
    if (p.type === "jab" || p.type === "cross") this.bump(p.type);
    else this.bump(`${p.type}-${p.hand}`);
    if (p.target === "body") this.bump("body");
    const name = p.type === "uppercut" ? "UPPERCUT" : p.type.toUpperCase();
    this.showLabel(name, `${p.hand} · ${p.target} · ${p.snapMs} ms`, p.type);
  }

  private checkDistance(f: BodyFrame): void {
    if (!this.profile || !f.tracked || this.mode.kind !== "live") return;
    const ratio = distanceRatio(this.profile, f.scale);
    const off = Math.abs(ratio - 1) > DISTANCE_TOLERANCE;
    if (!off) this.offDistanceSince = null;
    else this.offDistanceSince ??= f.timestamp;
    const show = this.offDistanceSince !== null && f.timestamp - this.offDistanceSince > DISTANCE_PROMPT_MS;
    this.banner.hidden = !show;
    if (show) {
      this.banner.textContent = `You're ${ratio > 1 ? "closer than" : "farther back than"} when you calibrated. Move back to your spot, or press K to recalibrate.`;
    }
  }

  private recordingContext(): Record<string, unknown> {
    const ctx: BoxingRecordingContext = {
      game: "boxing",
      stance: this.stance,
      profile: this.profile,
      calibration: this.calibration,
    };
    return { ...ctx };
  }

  private stats(): [string, string][] {
    const input = this.input;
    if (!input) return [];
    const s = input.signals;
    return [
      ["Calibration", this.calibrationSource()],
      ["Stance", this.stance],
      ["Lean / drop", `${s.lean.toFixed(2)} / ${s.drop.toFixed(2)}`],
      ["Armed L / R", `${input.armed("left") ? "yes" : "no"} / ${input.armed("right") ? "yes" : "no"}`],
    ];
  }

  /** Debug view of the guard zone and slip thresholds. */
  private drawZones(c: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, f: BodyFrame): void {
    if (!f.tracked) return;
    const px = (x: number) => rect.x + (x / f.imageAspect) * rect.w;
    const py = (y: number) => rect.y + y * rect.h;
    const unit = (f.scale / f.imageAspect) * rect.w; // one scale unit in canvas px
    const cfg = boxingConfig;
    c.save();
    c.lineWidth = 2;
    // Guard zone around the nose, cut off below the guard's lowest allowed wrist height.
    c.strokeStyle = "rgba(120,190,255,0.7)";
    c.beginPath();
    c.arc(px(f.nose.x), py(f.nose.y), cfg.guardRadius * unit, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([8, 8]);
    const guardFloor = py(f.shoulderMid.y + cfg.guardMaxDrop * f.scale);
    c.beginPath();
    c.moveTo(px(f.nose.x) - 1.5 * unit, guardFloor);
    c.lineTo(px(f.nose.x) + 1.5 * unit, guardFloor);
    c.stroke();
    // Slip thresholds relative to the hips.
    const b = this.input?.baseline;
    if (b && f.visible.leftHip && f.visible.rightHip) {
      c.strokeStyle = "rgba(255,200,80,0.7)";
      const center = f.hipMid.x + b.lean * f.scale;
      for (const dir of [-1, 1]) {
        const x = px(center + dir * cfg.slipThreshold * f.scale);
        c.beginPath();
        c.moveTo(x, py(f.nose.y) - unit);
        c.lineTo(x, py(f.nose.y) + unit);
        c.stroke();
      }
      // Duck line.
      c.strokeStyle = "rgba(255,120,200,0.7)";
      const duckY = py(b.shoulderY + cfg.duckThreshold * b.torsoRatio * f.scale);
      c.beginPath();
      c.moveTo(px(f.shoulderMid.x) - 1.5 * unit, duckY);
      c.lineTo(px(f.shoulderMid.x) + 1.5 * unit, duckY);
      c.stroke();
    }
    c.restore();
  }
}

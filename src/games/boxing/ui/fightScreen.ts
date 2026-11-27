import type { BodyFrame } from "../../../core/body/bodyFrame";
import { loadProfile, type CalibrationProfile } from "../../../core/calibration/profile";
import { h } from "../../../ui/dom";
import { PoseStage } from "../../../ui/pose/poseStage";
import type { AppContext, Screen } from "../../../ui/screen";
import { loadBoxingCalibration, type BoxingCalibration } from "../calibration/boxingCalibration";
import { defenseBaseline } from "../calibration/derive";
import { boxingConfig } from "../config";
import type { FighterData } from "../data/fighter";
import { BoxingInput, toInputEvents } from "../input/boxingInput";
import { FightLogic, STEP_MS, type PlayerDefense } from "../logic/fight";
import { fightConfig } from "../logic/fightConfig";
import { seededRng } from "../logic/rng";
import { CanvasBoxingRenderer } from "../render/canvas2d/canvasRenderer";
import type { GloveView, PlayerView } from "../render/renderer";
import type { PunchEvent } from "../types";

/** Max logic steps per animation frame, so a long hitch doesn't fast-forward the fight. */
const MAX_STEPS_PER_FRAME = 10;
/** Delay before the results panel, so the KO plays out. */
const RESULTS_DELAY_MS = 2500;
/** Tracked again for this long resumes a fight paused by lost tracking. */
const RESUME_AFTER_MS = 1000;

/**
 * A fight: camera input -> BoxingInput -> FightLogic (60 Hz) -> renderer.
 * Keys: Esc pause, D debug, R record (in the fight), F fullscreen.
 */
export class FightScreen implements Screen {
  private root!: HTMLElement;
  private stage: PoseStage | null = null;
  private input!: BoxingInput;
  private logic!: FightLogic;
  private renderer!: CanvasBoxingRenderer;
  private readonly canvas = h("canvas", { class: "stage" });
  private punches: PunchEvent[] = [];
  private defense: PlayerDefense = { guard: "none", slip: null, duck: false };
  private frame: BodyFrame | null = null;
  private profile: CalibrationProfile | null = null;
  private calibration: BoxingCalibration | null = null;
  private raf = 0;
  private lastNow = 0;
  private acc = 0;
  private paused: "menu" | "tracking" | null = null;
  private lostSince: number | null = null;
  private foundSince: number | null = null;
  private overAt: number | null = null;
  private overlay!: HTMLElement;

  constructor(
    private readonly app: AppContext,
    private readonly fighter: FighterData,
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.profile = loadProfile(this.app.storage);
    this.calibration = loadBoxingCalibration(this.app.storage);
    if (!this.profile || !this.calibration) {
      const go = h("button", { type: "button", class: "primary" }, "Calibrate (K)");
      go.addEventListener("click", () => this.app.navigate({ name: "boxingCalibration" }));
      root.append(h("main", { class: "settings" }, h("h1", {}, "Calibrate first"), h("p", { class: "hint" }, "The fight reads your punches and defense from your calibration."), go));
      return;
    }

    this.overlay = h("div", { class: "fight-overlay", hidden: true });
    this.renderer = new CanvasBoxingRenderer(this.canvas, this.fighter);
    this.input = new BoxingInput(boxingConfig, this.calibration.stance, defenseBaseline(this.profile, this.calibration));
    this.newFight();

    this.stage = new PoseStage(this.app, {
      mode: { kind: "live" },
      profile: this.profile,
      layout: "pip",
      onFrame: (f) => this.onFrame(f),
      stats: () => this.stats(),
      recordingContext: () => ({ game: "boxing", stance: this.calibration!.stance, profile: this.profile, calibration: this.calibration }),
      recordingLabel: () => `fight-${this.fighter.id}`,
      keysHint: "Esc pause",
    });
    this.stage.debug.visible = false;
    root.append(this.canvas);
    this.stage.mount(root);
    root.append(this.overlay);

    const loop = (now: number) => {
      this.tick(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    this.stage?.unmount();
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    if (!this.stage) {
      if (e.code === "KeyK") this.app.navigate({ name: "boxingCalibration" });
      else if (e.code === "Escape") this.app.navigate({ name: "hub" });
      return true;
    }
    if (this.overAt !== null && this.logic.state.phase === "over") {
      if (e.code === "Enter") return this.restart(), true;
      if (e.code === "Escape") return this.app.navigate({ name: "hub" }), true;
    }
    if (this.paused === "menu") {
      if (e.code === "Escape" || e.code === "Enter") return this.resume(), true;
      if (e.code === "KeyR") return this.restart(), true;
      if (e.code === "KeyQ") return this.app.navigate({ name: "hub" }), true;
      return true;
    }
    if (e.code === "Escape") {
      this.pause("menu");
      return true;
    }
    return this.stage.onKey(e);
  }

  // ---- fight lifecycle ----

  private newFight(): void {
    this.logic = new FightLogic(this.fighter, fightConfig, seededRng(Date.now() & 0xffffffff));
    this.punches = [];
    this.acc = 0;
    this.overAt = null;
    this.paused = null;
    this.overlay.hidden = true;
  }

  private restart(): void {
    this.newFight();
  }

  private pause(kind: "menu" | "tracking"): void {
    if (this.logic.state.phase === "over") return;
    this.paused = kind;
    this.overlay.hidden = false;
    this.overlay.replaceChildren(
      kind === "menu"
        ? h(
            "div",
            { class: "fight-panel" },
            h("h2", {}, "Paused"),
            h("p", {}, h("kbd", {}, "Esc"), " resume   ", h("kbd", {}, "R"), " restart   ", h("kbd", {}, "Q"), " quit to hub"),
          )
        : h("div", { class: "fight-panel" }, h("h2", {}, "Step back into view"), h("p", {}, "The fight resumes when the camera sees you again.")),
    );
  }

  private resume(): void {
    this.paused = null;
    this.overlay.hidden = true;
    this.lastNow = performance.now();
  }

  // ---- input ----

  private onFrame(f: BodyFrame): void {
    this.frame = f;
    const r = this.input.update(f);
    for (const e of toInputEvents(r)) this.app.events.emit(e);
    // Punches thrown while paused or before the bell don't count.
    if (!this.paused && this.logic.state.phase === "fighting") this.punches.push(...r.punches);
    this.defense = { guard: r.signals.guard, slip: r.signals.slip, duck: r.signals.duck };

    // Lost tracking mid-fight pauses; being seen again resumes.
    const t = f.timestamp;
    if (f.tracked) {
      this.lostSince = null;
      this.foundSince ??= t;
      if (this.paused === "tracking" && t - this.foundSince >= RESUME_AFTER_MS) this.resume();
    } else {
      this.foundSince = null;
      this.lostSince ??= t;
      if (!this.paused && this.logic.state.phase === "fighting" && t - this.lostSince >= fightConfig.lostTrackingPauseMs) {
        this.pause("tracking");
      }
    }
  }

  private playerView(): PlayerView {
    const f = this.frame;
    if (!f || !f.tracked) return { left: null, right: null };
    const guard = this.calibration!.guard;
    const glove = (side: "left" | "right"): GloveView | null => {
      const a = f.arms[side];
      if (!a.visible) return null;
      const g = guard[side].upperRatio;
      return {
        x: a.wrist.x / f.imageAspect,
        y: 0.5 + ((a.wrist.y - f.shoulderMid.y) / f.scale) * 0.4,
        reach: Math.min(1, Math.max(0, (g - a.upperArmRatio) / Math.max(0.1, g * 0.6))),
      };
    };
    return { left: glove("left"), right: glove("right") };
  }

  // ---- loop ----

  private tick(now: number): void {
    const dt = this.lastNow ? now - this.lastNow : 0;
    this.lastNow = now;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.logic.step({ punches: this.punches.splice(0), defense: this.defense });
        this.renderer.onEvents(this.logic.drainEvents(), now);
        this.acc -= STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }
    this.renderer.render(this.logic.state, this.playerView(), now);

    if (this.logic.state.phase === "over") {
      this.overAt ??= now;
      if (now - this.overAt > RESULTS_DELAY_MS && this.overlay.hidden) this.showResults();
    }
  }

  private showResults(): void {
    const s = this.logic.state;
    const won = s.result?.winner === "player";
    const secs = Math.round((s.result?.timeMs ?? s.time) / 1000 - fightConfig.countdownMs / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const st = s.stats;
    const pct = st.thrown ? Math.round((st.landed / st.thrown) * 100) : 0;
    const row = (k: string, v: string) => h("div", { class: "debug-row" }, h("span", {}, k), h("b", {}, v));
    const hint = !won && this.fighter.weaknesses.length ? this.fighter.weaknesses[Math.floor(Math.random() * this.fighter.weaknesses.length)]! : null;
    this.overlay.hidden = false;
    this.overlay.replaceChildren(
      h(
        "div",
        { class: "fight-panel" },
        h("h2", {}, won ? `You beat ${this.fighter.name}` : `${this.fighter.name} wins`),
        h("p", { class: "fight-sub" }, `KO at ${time}`),
        h(
          "div",
          { class: "cal-summary" },
          row("Punches landed", `${st.landed} of ${st.thrown} (${pct}%)`),
          row("Counters", String(st.counters)),
          row("Attacks beaten", String(st.defended)),
          row("Damage dealt / taken", `${Math.round(st.damageDealt)} / ${Math.round(st.damageTaken)}`),
        ),
        hint ? h("p", { class: "fight-hint" }, `Tip: ${hint}`) : null,
        h("p", {}, h("kbd", {}, "Enter"), " rematch   ", h("kbd", {}, "Esc"), " hub"),
      ),
    );
  }

  private stats(): [string, string][] {
    const s = this.logic.state;
    const o = s.opponent;
    const d = this.defense;
    return [
      ["Fight", `${s.phase} · ${(s.time / 1000).toFixed(1)}s`],
      ["Opponent", `${o.name}${o.attack ? ` (${o.attack.id})` : ""} ${Math.round(o.t)}ms`],
      ["Health you / him", `${Math.round(s.player.health)} / ${Math.round(o.health)}`],
      ["Defense", `${d.guard} ${d.slip ? `slip-${d.slip}` : ""} ${d.duck ? "duck" : ""}`],
    ];
  }
}

import type { FighterData } from "../../data/fighter";
import { FULL_COUNT, type FightEvent, type FightState, type OpponentState } from "../../logic/fight";
import { fightConfig } from "../../logic/fightConfig";
import type { BoxingRenderer, GloveView, PlayerView } from "../renderer";
import { CLIPS, sampleClip } from "./animations";
import { BASE_POSE, drawPuppet, lerpPose, type Pose } from "./puppet";

interface Pop {
  text: string;
  color: string;
  size: number;
  start: number;
  ms: number;
  y: number;
}

const BLEND_MS = 120;

/** Canvas 2D boxing renderer: ring, crowd, puppet opponent, your gloves, HUD and hit effects. */
export class CanvasBoxingRenderer implements BoxingRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private crowd: HTMLCanvasElement | null = null;
  private pops: Pop[] = [];
  private flash: { color: string; start: number; ms: number } | null = null;
  private shake: { start: number; ms: number; amp: number } | null = null;
  private lastPose: Pose = BASE_POSE;
  private fromPose: Pose = BASE_POSE;
  private stateKey = "";
  private stateChangedAt = 0;
  /** Health shown in the bars' white "damage trail", easing down to the real value. */
  private trail = { player: 1, opponent: 1 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly fighter: FighterData,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  onEvents(events: readonly FightEvent[], now: number): void {
    for (const e of events) {
      switch (e.type) {
        case "round-start":
          this.pop(e.round === 1 ? "FIGHT!" : `ROUND ${e.round}`, "#ffd23f", 150, now, 1100, 0.42);
          break;
        case "round-end":
          this.pop("END OF ROUND", "#ffffff", 100, now, 1800, 0.42);
          break;
        case "too-tired":
          this.pop("TOO TIRED", "#9aa6bd", 70, now, 800, 0.62);
          break;
        case "knockdown":
          this.pop(e.who === "opponent" ? "DOWN!" : "YOU'RE DOWN!", "#ff5a5a", 140, now, 1400, 0.3);
          this.shake = { start: now, ms: 500, amp: 26 };
          break;
        case "get-up":
          this.pop(e.who === "player" ? "BACK UP!" : "HE'S UP", "#ffd23f", 110, now, 1200, 0.3);
          break;
        case "punch-landed":
          if (e.counter) {
            this.pop("COUNTER!", "#ffffff", 110, now, 900, 0.3);
            this.flash = { color: "255,255,255", start: now, ms: 220 };
            this.shake = { start: now, ms: 250, amp: 14 };
          } else if (e.punch === "hook" || e.punch === "uppercut") {
            this.shake = { start: now, ms: 180, amp: 8 };
          }
          if (e.combo >= 3) this.pop(`${e.combo} HIT COMBO`, "#ffb347", 54, now, 700, 0.62);
          break;
        case "punch-blocked":
          this.pop("BLOCKED", "#9aa6bd", 60, now, 500, 0.58);
          break;
        case "attack-defended":
          if (e.clean) {
            const word = e.defense === "slip" ? "SLIP!" : e.defense === "duck" ? "DUCK!" : "BLOCKED!";
            this.pop(word, "#3ee0d0", 100, now, 800, 0.3);
          } else {
            this.pop("BLOCKED", "#9aa6bd", 70, now, 600, 0.3);
            this.flash = { color: "255,60,60", start: now, ms: 200 };
          }
          break;
        case "attack-hit":
          this.flash = { color: "255,40,40", start: now, ms: 380 };
          this.shake = { start: now, ms: 320, amp: 22 };
          break;
        case "stunned":
          this.pop("STUNNED!", "#ffd23f", 100, now, 1200, 0.3);
          break;
        case "fight-over": {
          const text = e.method === "Decision" ? "DECISION" : e.method === "TKO" ? "T.K.O.!" : "K.O.!";
          this.pop(text, e.winner === "player" ? "#ffd23f" : "#ff5a5a", 200, now, 2500, 0.42);
          break;
        }
      }
    }
  }

  render(state: Readonly<FightState>, view: PlayerView, now: number): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.crowd = null;
    }

    ctx.save();
    if (this.shake) {
      const k = (now - this.shake.start) / this.shake.ms;
      if (k >= 1) this.shake = null;
      else {
        const a = this.shake.amp * (1 - k) * dpr;
        ctx.translate((Math.random() - 0.5) * a * 2, (Math.random() - 0.5) * a * 2);
      }
    }
    this.drawScene(w, h);
    this.drawOpponent(state.opponent, w, h, now);
    this.drawGloves(view, w, h);
    ctx.restore();

    // Low stamina: the edges of your vision darken.
    if (state.player.stamina < fightConfig.lowStamina || state.player.exhausted) this.vignette(w, h, state.player.exhausted ? 0.75 : 0.5);
    this.drawEdgeFlash(w, h, now);
    if (state.phase === "knockdown" && state.knockdown?.who === "player") this.vignette(w, h, 0.85);
    this.drawHud(state, w, h, dpr);
    if (state.phase === "countdown") {
      const n = Math.ceil(state.countdownLeft / 1000);
      this.text(String(Math.max(1, n)), w / 2, h * 0.42, 200 * dpr, "#ffffff");
    }
    this.drawKnockdown(state, w, h, dpr);
    this.drawPops(w, h, now, dpr);
  }

  // ---- scene ----

  private drawScene(w: number, h: number): void {
    const ctx = this.ctx;
    if (!this.crowd) this.crowd = makeCrowd(w, h);
    ctx.drawImage(this.crowd, 0, 0);
    // Spotlight on the fighter.
    const g = ctx.createRadialGradient(w / 2, h * 0.35, h * 0.05, w / 2, h * 0.45, h * 0.75);
    g.addColorStop(0, "rgba(255,240,210,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Ropes behind him.
    const ropes = ["#c0392b", "#ecf0f1", "#2c6fbb"];
    ropes.forEach((c, i) => {
      const y = h * (0.5 + i * 0.09);
      ctx.strokeStyle = c;
      ctx.lineWidth = h * 0.012;
      ctx.beginPath();
      ctx.moveTo(0, y + h * 0.02);
      ctx.quadraticCurveTo(w / 2, y - h * 0.01, w, y + h * 0.02);
      ctx.stroke();
    });
    // Corner posts.
    ctx.fillStyle = "#30343f";
    ctx.fillRect(w * 0.03, h * 0.42, w * 0.025, h * 0.6);
    ctx.fillRect(w * 0.945, h * 0.42, w * 0.025, h * 0.6);
  }

  // ---- opponent ----

  private clipFor(o: OpponentState): { name: string; k: number; loopMs?: number } {
    const tell = o.attack?.tell;
    const k = Number.isFinite(o.duration) && o.duration > 0 ? o.t / o.duration : 0;
    switch (o.name) {
      case "guard":
        return o.guarding ? { name: "guard", k: 0, loopMs: CLIPS.guard!.loopMs } : { name: "relaxed", k: 0, loopMs: CLIPS.relaxed!.loopMs };
      case "windup":
        return { name: CLIPS[`${tell}-windup`] ? `${tell}-windup` : "guard", k };
      case "strike":
        return { name: CLIPS[`${tell}-strike`] ? `${tell}-strike` : "guard", k };
      case "recover":
        return { name: "recover", k };
      case "whiff":
        return { name: "whiff", k };
      case "open":
        return { name: "open", k: 0, loopMs: CLIPS.open!.loopMs };
      case "hit":
        return { name: "flinch", k };
      case "stunned":
        return { name: "stunned", k: 0, loopMs: CLIPS.stunned!.loopMs };
      case "ko":
      case "knockdown":
        return { name: "ko", k: Math.min(1, o.t / 1400) };
      case "getup":
        return { name: "ko", k: Math.max(0, 1 - k) };
      case "victory":
        return { name: "victory", k: 0, loopMs: CLIPS.victory!.loopMs };
    }
  }

  private drawOpponent(o: OpponentState, w: number, h: number, now: number): void {
    const { name, k, loopMs } = this.clipFor(o);
    const key = `${o.name}:${o.attack?.id ?? ""}`;
    if (key !== this.stateKey) {
      this.stateKey = key;
      this.stateChangedAt = now;
      this.fromPose = this.lastPose;
    }
    const clip = CLIPS[name]!;
    const t = loopMs ? (now % loopMs) / loopMs : k;
    let pose = sampleClip(clip, t, lerpPose);
    // Ease out of the previous pose so state changes never snap.
    const blend = Math.min(1, (now - this.stateChangedAt) / BLEND_MS);
    if (blend < 1) pose = lerpPose(this.fromPose, pose, blend);
    this.lastPose = pose;

    const highlight =
      o.name === "windup" && o.attack
        ? { arm: (o.attack.tell.includes("right") ? "rear" : "lead") as "lead" | "rear", strength: 0.5 + 0.5 * Math.sin(now / 80) }
        : { arm: null, strength: 0 };
    drawPuppet(this.ctx, pose, this.fighter.art, w / 2, h * 0.97, h * 1.1, highlight);
  }

  // ---- player gloves ----

  private drawGloves(view: PlayerView, w: number, h: number): void {
    const draw = (g: GloveView | null) => {
      if (!g) return;
      const ctx = this.ctx;
      // Gloves live in the bottom of the screen; reaching moves them up and in, and smaller (away from you).
      const x = w * (0.5 + (g.x - 0.5) * (1 - 0.5 * g.reach));
      const y = h * (0.93 - 0.4 * g.reach) + (g.y - 0.5) * h * 0.2;
      const r = h * (0.1 - 0.035 * g.reach);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2f6fdd";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#24529f";
      ctx.fillRect(x - r * 0.75, y + r * 0.45, r * 1.5, r * 0.7);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };
    draw(view.left);
    draw(view.right);
  }

  // ---- HUD and effects ----

  private drawHud(state: Readonly<FightState>, w: number, h: number, dpr: number): void {
    const ctx = this.ctx;
    const bw = w * 0.36, bh = h * 0.035, pad = w * 0.03, top = h * 0.04;
    const p = state.player.health / state.player.maxHealth;
    const o = state.opponent.health / state.opponent.maxHealth;
    this.trail.player = Math.max(p, this.trail.player - 0.006);
    this.trail.opponent = Math.max(o, this.trail.opponent - 0.006);
    const bar = (x: number, frac: number, trail: number, color: string, rightAligned: boolean) => {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - 4 * dpr, top - 4 * dpr, bw + 8 * dpr, bh + 8 * dpr);
      const fill = (f: number, c: string) => {
        ctx.fillStyle = c;
        ctx.fillRect(rightAligned ? x + bw * (1 - f) : x, top, bw * f, bh);
      };
      fill(trail, "rgba(255,255,255,0.8)");
      fill(frac, color);
    };
    bar(pad, p, this.trail.player, "#3ee07a", false);
    bar(w - pad - bw, o, this.trail.opponent, "#ff5a5a", true);
    // Stamina: a thinner bar under each health bar.
    const sh = bh * 0.4, sy = top + bh + 8 * dpr;
    const stam = (x: number, frac: number, color: string, rightAligned: boolean) => {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x, sy, bw, sh);
      ctx.fillStyle = color;
      ctx.fillRect(rightAligned ? x + bw * (1 - frac) : x, sy, bw * frac, sh);
    };
    const pl = state.player;
    const playerStamColor = pl.exhausted ? "#777" : pl.stamina < fightConfig.lowStamina ? "#ff8c42" : "#ffd23f";
    stam(pad, pl.stamina / pl.staminaMax, playerStamColor, false);
    stam(w - pad - bw, state.opponent.stamina / state.opponent.staminaMax, "#ffd23f", true);
    ctx.font = `700 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("YOU", pad, sy + sh + 8 * dpr);
    ctx.textAlign = "right";
    ctx.fillText(this.fighter.name.toUpperCase(), w - pad, sy + sh + 8 * dpr);

    // Round and clock, top center.
    const secs = Math.max(0, Math.ceil(state.roundLeft / 1000));
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(h * 0.025)}px system-ui, sans-serif`;
    ctx.fillStyle = "#9aa6bd";
    ctx.fillText(`ROUND ${state.round} OF ${state.format.rounds}`, w / 2, top - 6 * dpr);
    ctx.font = `800 ${Math.round(h * 0.055)}px ui-monospace, monospace`;
    ctx.fillStyle = secs <= 10 && state.phase === "fighting" ? "#ff5a5a" : "#ffffff";
    ctx.fillText(state.phase === "rest" ? "REST" : clock, w / 2, top + h * 0.022);
  }

  private vignette(w: number, h: number, strength: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** The referee's count, and your get-up meter when you're the one down. */
  private drawKnockdown(state: Readonly<FightState>, w: number, h: number, dpr: number): void {
    const kd = state.knockdown;
    if (state.phase !== "knockdown" || !kd || kd.resumeLeft !== null) return;
    const ctx = this.ctx;
    this.text(kd.count > 0 ? String(Math.min(kd.count, FULL_COUNT)) : "", w / 2, h * 0.5, 260 * (h / 900), "#ffffff");
    if (kd.who === "opponent") {
      this.text("STAY DOWN!", w / 2, h * 0.7, 70 * (h / 900), "#ffd23f");
      return;
    }
    this.text("PUNCH TO GET UP!", w / 2, h * 0.7, 80 * (h / 900), "#ffd23f");
    const bw = w * 0.5, bh = h * 0.04, x = (w - bw) / 2, y = h * 0.78;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 4 * dpr, y - 4 * dpr, bw + 8 * dpr, bh + 8 * dpr);
    ctx.fillStyle = "#3ee07a";
    ctx.fillRect(x, y, bw * (kd.getUp / kd.getUpNeeded), bh);
    this.text(`${kd.getUp} / ${kd.getUpNeeded}`, w / 2, y + bh * 2.2, 40 * (h / 900), "#ffffff");
  }

  private drawEdgeFlash(w: number, h: number, now: number): void {
    if (!this.flash) return;
    const k = (now - this.flash.start) / this.flash.ms;
    if (k >= 1) {
      this.flash = null;
      return;
    }
    const ctx = this.ctx;
    const a = 0.6 * (1 - k);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, `rgba(${this.flash.color},0)`);
    g.addColorStop(1, `rgba(${this.flash.color},${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private pop(text: string, color: string, size: number, now: number, ms: number, y: number): void {
    this.pops.push({ text, color, size, start: now, ms, y });
    if (this.pops.length > 4) this.pops.shift();
  }

  private drawPops(w: number, h: number, now: number, dpr: number): void {
    this.pops = this.pops.filter((p) => now - p.start < p.ms);
    for (const p of this.pops) {
      const k = (now - p.start) / p.ms;
      const scale = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - 0.1 * Math.min(1, (k - 0.15) / 0.2);
      this.ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      this.text(p.text, w / 2, h * p.y, p.size * scale * dpr * (h / (900 * dpr)), p.color);
      this.ctx.globalAlpha = 1;
    }
  }

  private text(s: string, x: number, y: number, size: number, color: string): void {
    const ctx = this.ctx;
    ctx.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = size * 0.08;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
}

/** A blurred crowd backdrop, drawn once per size. */
function makeCrowd(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#07080c");
  g.addColorStop(0.6, "#151925");
  g.addColorStop(1, "#1d1410");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `blur(${Math.round(h * 0.012)}px)`;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = h * (0.18 + rand() * 0.4);
    const r = h * (0.02 + rand() * 0.025);
    const shade = 40 + Math.floor(rand() * 60);
    ctx.fillStyle = `rgb(${shade + 20},${shade},${shade - 10})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = "none";
  return c;
}

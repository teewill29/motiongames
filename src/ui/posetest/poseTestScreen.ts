import type { BodyFrame } from "../../core/body/bodyFrame";
import { attachStream, describeCameraError, openCamera, stopStream } from "../../core/camera/camera";
import { poseConfig } from "../../core/pose/config";
import { LivePoseSource } from "../../core/pose/liveSource";
import { PosePipeline } from "../../core/pose/pipeline";
import { PoseTracker } from "../../core/pose/poseTracker";
import type { RawPoseFrame } from "../../core/pose/types";
import { downloadRecording } from "../../core/recorder/download";
import { recordingToFrames, type PoseRecording } from "../../core/recorder/format";
import { PoseRecorder } from "../../core/recorder/recorder";
import { ReplayPlayer } from "../../core/recorder/replay";
import { DebugOverlay } from "../debug/debugOverlay";
import { FpsMeter } from "../debug/fps";
import { containRect, drawSkeleton } from "../debug/skeleton";
import { h } from "../dom";
import type { AppContext, Screen } from "../screen";

type Mode = { kind: "live" } | { kind: "replay"; recording: PoseRecording; fileName: string };

/**
 * Phase 0 screen: mirrored camera feed (or a replayed recording) with the debug
 * skeleton. Live mode records with R; replay mode plays a recording through the
 * same pipeline.
 */
export class PoseTestScreen implements Screen {
  private root!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private readonly video = h("video", { class: "hidden-video" });
  private status!: HTMLElement;
  private recBadge!: HTMLElement;
  private debug!: DebugOverlay;

  private readonly pipeline = new PosePipeline(poseConfig);
  private readonly recorder = new PoseRecorder();
  private stream: MediaStream | null = null;
  private tracker: PoseTracker | null = null;
  private live: LivePoseSource | null = null;
  private player: ReplayPlayer | null = null;
  private replayUi: ReplayControls | null = null;

  private readonly renderFps = new FpsMeter();
  private readonly poseFps = new FpsMeter();
  private raf = 0;
  private disposed = false;
  private lastTracked = false;
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly app: AppContext,
    private readonly mode: Mode,
  ) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.canvas = h("canvas", { class: "stage" });
    this.ctx = this.canvas.getContext("2d")!;
    this.status = h("div", { class: "status" });
    this.recBadge = h("div", { class: "rec-badge", hidden: true });
    this.debug = new DebugOverlay(this.app.tunables, this.app.events, this.app.settings.get().debugOverlayDefault);

    const back = h("button", { class: "corner-button", type: "button" }, "← Hub (Esc)");
    back.addEventListener("click", () => this.app.navigate({ name: "hub" }));

    root.append(this.canvas, this.video, this.debug.element, this.recBadge, this.status, back);

    this.unsubs.push(
      this.pipeline.subscribe((frame, raw) => this.onBodyFrame(frame, raw)),
    );

    if (this.mode.kind === "live") void this.startLive();
    else this.startReplay(this.mode.recording, this.mode.fileName);

    const loop = (now: number) => {
      if (this.disposed) return;
      this.player?.update(now);
      this.render(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  unmount(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.recorder.recording) this.stopRecording();
    this.live?.stop();
    this.tracker?.close();
    stopStream(this.stream);
    this.unsubs.forEach((u) => u());
    this.debug.destroy();
    this.root.replaceChildren();
  }

  onKey(e: KeyboardEvent): boolean {
    const now = performance.now();
    switch (e.code) {
      case "KeyD":
        this.debug.toggle();
        return true;
      case "KeyR":
        if (this.mode.kind !== "live") return false;
        this.toggleRecording();
        return true;
      case "Escape":
        this.app.navigate({ name: "hub" });
        return true;
    }
    if (!this.player) return false;
    switch (e.code) {
      case "Space":
        this.player.toggle(now);
        return true;
      case "ArrowRight":
      case "Period":
        this.player.step(e.shiftKey ? 10 : 1);
        return true;
      case "ArrowLeft":
      case "Comma":
        this.player.step(e.shiftKey ? -10 : -1);
        return true;
      case "Home":
        this.player.seek(0, now);
        return true;
      case "KeyL":
        this.player.loop = !this.player.loop;
        this.replayUi?.sync();
        return true;
    }
    return false;
  }

  // ---- live ----

  private async startLive(): Promise<void> {
    const s = this.app.settings.get();
    try {
      this.setStatus("Starting camera…");
      this.stream = await openCamera({ deviceId: s.cameraDeviceId, fps: s.cameraFps });
      if (this.disposed) return stopStream(this.stream);
      await attachStream(this.video, this.stream);
    } catch (err) {
      this.setStatus(describeCameraError(err), true);
      return;
    }
    try {
      this.setStatus(`Loading pose model (${s.poseModel})…`);
      this.tracker = await PoseTracker.create(s.poseModel);
      if (this.disposed) return this.tracker.close();
    } catch (err) {
      console.error(err);
      this.setStatus(`Pose tracking failed to start: ${err instanceof Error ? err.message : String(err)}`, true);
      return;
    }
    this.setStatus("");
    this.live = new LivePoseSource(this.video, this.tracker, (raw) => this.pipeline.push(raw));
    this.live.start();
  }

  private toggleRecording(): void {
    if (this.recorder.recording) {
      this.stopRecording();
      return;
    }
    if (!this.tracker || this.video.videoWidth === 0) return;
    this.recorder.start({
      model: this.tracker.info.model,
      delegate: this.tracker.info.delegate,
      imageWidth: this.video.videoWidth,
      imageHeight: this.video.videoHeight,
    });
    this.app.events.emit({ type: "recorder:start", timestamp: performance.now() });
  }

  private stopRecording(): void {
    const frames = this.recorder.frameCount;
    const rec = this.recorder.stop();
    if (!rec) return;
    const name = downloadRecording(rec);
    this.app.events.emit({ type: "recorder:saved", timestamp: performance.now(), data: { frames, file: name } });
    this.flash(`Saved ${name} (${frames} frames)`);
  }

  // ---- replay ----

  private startReplay(recording: PoseRecording, fileName: string): void {
    const frames = recordingToFrames(recording);
    this.player = new ReplayPlayer(frames, {
      onFrame: (raw) => this.pipeline.push(raw),
      onSeek: (raw, _i, history) => {
        this.pipeline.reset();
        this.pipeline.warm(history);
        this.pipeline.push(raw);
      },
    });
    this.replayUi = new ReplayControls(this.player, fileName, recording);
    this.root.append(this.replayUi.element);
    this.player.seek(0);
    this.player.play(performance.now());
  }

  // ---- per frame ----

  private onBodyFrame(frame: BodyFrame, raw: RawPoseFrame): void {
    this.poseFps.tick(performance.now());
    if (this.recorder.recording) this.recorder.add(raw);
    if (frame.tracked !== this.lastTracked) {
      this.lastTracked = frame.tracked;
      this.app.events.emit({ type: frame.tracked ? "tracking:found" : "tracking:lost", timestamp: frame.timestamp });
    }
  }

  private render(now: number): void {
    this.renderFps.tick(now);
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(this.canvas.clientWidth * dpr);
    const ch = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const ctx = this.ctx;
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, cw, ch);

    const frame = this.pipeline.latest;
    const aspect =
      this.video.videoWidth > 0 ? this.video.videoWidth / this.video.videoHeight : (frame?.imageAspect ?? 16 / 9);
    const rect = containRect(cw, ch, aspect);

    if (this.mode.kind === "live" && this.video.readyState >= 2) {
      ctx.save();
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1); // mirror: your right hand moves the right side of the screen
      ctx.drawImage(this.video, 0, 0, rect.w, rect.h);
      ctx.restore();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }

    if (frame && this.debug.visible) drawSkeleton(ctx, frame, rect, poseConfig.minVisibility);

    this.updateRecBadge();
    this.replayUi?.sync();
    this.debug.setStats(this.statsRows(frame, now), now);
  }

  private statsRows(frame: BodyFrame | null, now: number): [string, string][] {
    const rows: [string, string][] = [];
    if (this.mode.kind === "live") {
      const info = this.tracker?.info;
      rows.push(["Source", info ? `Live · ${info.model} · ${info.delegate}` : "Live · starting"]);
      rows.push(["Camera", this.video.videoWidth ? `${this.video.videoWidth}×${this.video.videoHeight}` : "-"]);
      rows.push(["Inference", this.live ? `${this.live.stats.inferenceMs.toFixed(1)} ms` : "-"]);
    } else {
      rows.push(["Source", `Replay · ${this.mode.recording.meta.model}`]);
    }
    const poseFps = this.poseFps.value(now);
    rows.push(["Pose FPS", String(poseFps) + (this.mode.kind === "live" && this.tracker && poseFps < 30 ? " (below 30)" : "")]);
    rows.push(["Render FPS", String(this.renderFps.value(now))]);
    if (!frame || frame.landmarks.length === 0) {
      rows.push(["Tracked", "no pose"]);
      return rows;
    }
    rows.push(["Tracked", frame.tracked ? "yes" : "low visibility"]);
    rows.push(["Shoulder width", frame.shoulderWidth.toFixed(3)]);
    rows.push(["Torso (sw)", frame.shoulderWidth ? (frame.torsoLength / frame.shoulderWidth).toFixed(2) : "-"]);
    for (const side of ["left", "right"] as const) {
      const a = frame.arms[side];
      const tag = side === "left" ? "L" : "R";
      if (!a.visible) {
        rows.push([`${tag} arm`, "not visible"]);
        continue;
      }
      rows.push([`${tag} ext / elbow`, `${a.extension.toFixed(2)} / ${a.elbowAngle.toFixed(0)}°`]);
      rows.push([`${tag} reach`, `${a.reach.toFixed(2)} sw`]);
      rows.push([
        `${tag} wrist v`,
        `${a.wristVelocity.x.toFixed(1)}, ${a.wristVelocity.y.toFixed(1)} sw/s · z ${a.wristVelocityZ.toFixed(2)} m/s`,
      ]);
    }
    rows.push(["Keys", this.mode.kind === "live" ? "D debug · R record · F full · Esc" : "Space · ←/→ · Home · L loop"]);
    return rows;
  }

  private updateRecBadge(): void {
    const rec = this.recorder.recording;
    this.recBadge.hidden = !rec;
    if (rec) {
      const secs = this.recorder.durationMs / 1000;
      this.recBadge.textContent = `● REC ${secs.toFixed(1)}s · ${this.recorder.frameCount} frames · R to stop`;
    }
  }

  private setStatus(text: string, error = false): void {
    this.status.textContent = text;
    this.status.hidden = !text;
    this.status.classList.toggle("error", error);
  }

  private flashTimer = 0;
  private flash(text: string): void {
    this.setStatus(text);
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.setStatus(""), 3000);
  }
}

/** Mouse controls for replay: play/pause, step, scrub, speed, loop. */
class ReplayControls {
  readonly element: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly scrub: HTMLInputElement;
  private readonly time: HTMLElement;
  private readonly loop: HTMLInputElement;

  constructor(
    private readonly player: ReplayPlayer,
    fileName: string,
    recording: PoseRecording,
  ) {
    const btn = (label: string, title: string, fn: () => void) => {
      const b = h("button", { type: "button", title }, label);
      b.addEventListener("click", () => {
        fn();
        b.blur(); // keep Space for play/pause
      });
      return b;
    };
    this.playBtn = btn("▶", "Play / pause (Space)", () => player.toggle(performance.now()));
    this.scrub = h("input", { type: "range", min: 0, max: player.length - 1, step: 1, value: 0 });
    this.scrub.addEventListener("input", () => player.seek(Number(this.scrub.value)));
    this.scrub.addEventListener("keydown", (e) => e.stopPropagation());
    this.time = h("span", { class: "replay-time" });
    const rate = h(
      "select",
      { title: "Playback speed" },
      ...[0.1, 0.25, 0.5, 1, 2].map((r) => h("option", { value: r, selected: r === 1 }, `${r}×`)),
    );
    rate.addEventListener("change", () => {
      player.setRate(Number(rate.value), performance.now());
      rate.blur();
    });
    this.loop = h("input", { type: "checkbox" });
    this.loop.addEventListener("change", () => {
      player.loop = this.loop.checked;
      this.loop.blur();
    });
    const label = recording.label ? `${fileName} · ${recording.label}` : fileName;
    this.element = h(
      "div",
      { class: "replay-bar" },
      h("span", { class: "replay-name", title: label }, label),
      btn("⏮", "Restart (Home)", () => player.seek(0)),
      btn("◀", "Step back (←, Shift for 10)", () => player.step(-1)),
      this.playBtn,
      btn("▶|", "Step forward (→, Shift for 10)", () => player.step(1)),
      this.scrub,
      this.time,
      rate,
      h("label", { class: "replay-loop" }, this.loop, "Loop (L)"),
    );
  }

  sync(): void {
    const p = this.player;
    this.playBtn.textContent = p.isPlaying ? "❚❚" : "▶";
    if (document.activeElement !== this.scrub) this.scrub.value = String(Math.max(0, p.currentIndex));
    this.time.textContent = `${(p.positionMs / 1000).toFixed(2)} / ${(p.durationMs / 1000).toFixed(2)}s · frame ${p.currentIndex + 1}/${p.length}`;
    this.loop.checked = p.loop;
  }
}

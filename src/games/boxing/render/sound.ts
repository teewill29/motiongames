import type { AudioEngine } from "../../../core/audio/audio";
import type { FightEvent } from "../logic/fight";

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten!"];

/**
 * Fight sounds, driven by fight events like the renderer. Every attack gets
 * its own cue during the tell so the player can learn it by ear.
 */
export class BoxingSound {
  constructor(private readonly audio: AudioEngine) {}

  onEvents(events: readonly FightEvent[]): void {
    for (const e of events) this.play(e);
  }

  private bell(rings: number): void {
    for (let i = 0; i < rings; i++) {
      const delayMs = i * 320;
      for (const [f, g] of [[880, 0.5], [1320, 0.25], [2200, 0.12]] as const) {
        this.audio.tone({ freq: f, ms: 1400, gain: g, type: "sine", delayMs });
      }
    }
  }

  private crowd(gain: number, ms = 1600): void {
    this.audio.noiseBurst({ ms, freq: 900, q: 0.5, gain, type: "bandpass", attackMs: 250 });
  }

  private play(e: FightEvent): void {
    const a = this.audio;
    switch (e.type) {
      case "round-start":
        this.bell(1);
        break;
      case "round-end":
        this.bell(3);
        this.crowd(0.25);
        break;
      case "windup":
        // Tell cues: a short rising blip for the jab, a low swelling growl for the hook.
        if (e.attack.includes("hook")) a.tone({ freq: 110, ms: 450, gain: 0.35, type: "sawtooth", slideTo: 190 });
        else a.tone({ freq: 520, ms: 140, gain: 0.3, type: "square", slideTo: 780 });
        break;
      case "punch-landed":
        if (e.counter || e.punch === "hook" || e.punch === "uppercut") {
          a.noiseBurst({ ms: 220, freq: 600, gain: 1, sweepTo: 120 });
          a.tone({ freq: 90, ms: 180, gain: 0.6, slideTo: 50 });
        } else {
          a.noiseBurst({ ms: 120, freq: 1400, gain: 0.7, sweepTo: 300 });
        }
        if (e.counter) this.crowd(0.35, 1200);
        break;
      case "punch-blocked":
        a.noiseBurst({ ms: 90, freq: 2500, gain: 0.35, type: "bandpass", q: 2 });
        break;
      case "attack-hit":
        a.noiseBurst({ ms: 260, freq: 500, gain: 1, sweepTo: 90 });
        a.tone({ freq: 70, ms: 220, gain: 0.7, slideTo: 40 });
        break;
      case "attack-defended":
        if (e.clean) {
          // The whoosh of a miss.
          a.noiseBurst({ ms: 300, freq: 400, gain: 0.5, type: "bandpass", q: 1.5, sweepTo: 2400, attackMs: 60 });
        } else {
          a.noiseBurst({ ms: 120, freq: 1800, gain: 0.5, type: "bandpass", q: 2 });
        }
        break;
      case "stunned":
        this.crowd(0.4);
        break;
      case "too-tired":
        a.tone({ freq: 200, ms: 250, gain: 0.25, type: "triangle", slideTo: 140 });
        break;
      case "knockdown":
        a.noiseBurst({ ms: 500, freq: 300, gain: 1, sweepTo: 60 });
        this.crowd(0.6, 2500);
        break;
      case "count":
        a.say(COUNT_WORDS[e.n] ?? String(e.n), 1.2);
        break;
      case "get-up":
        this.crowd(0.4);
        break;
      case "fight-over":
        this.bell(e.method === "Decision" ? 3 : 5);
        this.crowd(0.6, 3000);
        break;
    }
  }
}

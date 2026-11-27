/**
 * Synthesized sound effects (Web Audio) and the browser's speech voice. No
 * audio files: everything is self-made from oscillators and noise, which
 * keeps the app free of licensing questions. Games describe sounds with the
 * small recipe helpers here.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private volume: number) {}

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Audio starts on demand; browsers allow it after a key press or click. */
  private context(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** A burst of filtered noise: thuds, whooshes, crowd. */
  noiseBurst(opts: { ms: number; freq: number; q?: number; gain: number; type?: BiquadFilterType; attackMs?: number; sweepTo?: number }): void {
    const ctx = this.context();
    if (!ctx || !this.noise || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? "lowpass";
    filter.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.ms / 1000);
    filter.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const attack = (opts.attackMs ?? 2) / 1000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.ms / 1000);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + opts.ms / 1000 + 0.05);
  }

  /** A pitched tone with an envelope: bells, beeps, cues. */
  tone(opts: { freq: number; ms: number; gain: number; type?: OscillatorType; slideTo?: number; delayMs?: number }): void {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + opts.ms / 1000);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.ms / 1000);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + opts.ms / 1000 + 0.05);
  }

  /** Speaks a short phrase with the browser's built-in voice, if it has one. */
  say(text: string, rate = 1.1): void {
    if (!("speechSynthesis" in window) || this.volume <= 0) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.volume = Math.min(1, this.volume);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  close(): void {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    void this.ctx?.close();
    this.ctx = null;
  }
}

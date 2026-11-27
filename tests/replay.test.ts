import { describe, expect, it } from "vitest";
import type { RawPoseFrame } from "../src/core/pose/types";
import { ReplayPlayer } from "../src/core/recorder/replay";
import { frameAt } from "./helpers/syntheticPose";

function setup(n = 10, stepMs = 100) {
  const frames = Array.from({ length: n }, (_, i) => frameAt(i * stepMs, null));
  const log: string[] = [];
  const seeks: { index: number; history: readonly RawPoseFrame[] }[] = [];
  const player = new ReplayPlayer(frames, {
    onFrame: (_f, i) => log.push(`f${i}`),
    onSeek: (_f, i, history) => {
      log.push(`s${i}`);
      seeks.push({ index: i, history });
    },
  });
  return { player, log, seeks };
}

describe("ReplayPlayer", () => {
  it("plays at real speed using the supplied clock", () => {
    const { player, log } = setup();
    player.play(1000);
    player.update(1000);
    expect(log).toEqual(["f0"]);
    player.update(1250);
    expect(log).toEqual(["f0", "f1", "f2"]);
    player.update(5000);
    expect(log.at(-1)).toBe("f9");
    expect(player.isPlaying).toBe(false);
  });

  it("scales time by rate", () => {
    const { player, log } = setup();
    player.setRate(0.5, 0);
    player.play(0);
    player.update(400); // 200ms of recording
    expect(log).toEqual(["f0", "f1", "f2"]);
  });

  it("steps forward without a seek and backward with full history", () => {
    const { player, log, seeks } = setup();
    player.step(1);
    player.step(1);
    player.step(1);
    expect(log).toEqual(["f0", "f1", "f2"]);
    player.step(-1);
    expect(log.at(-1)).toBe("s1");
    expect(seeks.at(-1)!.history).toHaveLength(1);
    player.step(-10);
    expect(player.currentIndex).toBe(0);
  });

  it("pauses when stepping and resumes from the current frame", () => {
    const { player, log } = setup();
    player.play(0);
    player.update(250);
    player.step(1);
    expect(player.isPlaying).toBe(false);
    expect(player.currentIndex).toBe(3);
    player.play(10_000);
    player.update(10_100);
    expect(log.at(-1)).toBe("f4");
  });

  it("loops back to the start", () => {
    const { player, log } = setup(3);
    player.loop = true;
    player.play(0);
    player.update(250);
    expect(log).toEqual(["f0", "f1", "f2", "s0"]);
    expect(player.isPlaying).toBe(true);
    player.update(360);
    expect(log.at(-1)).toBe("f1");
  });

  it("restarts from the beginning when played at the end", () => {
    const { player, log } = setup(3);
    player.seek(2, 0);
    player.play(0);
    expect(log.at(-1)).toBe("s0");
  });
});

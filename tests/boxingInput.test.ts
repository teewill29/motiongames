import { describe, expect, it } from "vitest";
import { countPunches, detect, runCalibration, calibrationSession, syntheticCalibration } from "./helpers/boxingSetup";
import { animate, punchSeries, type Keyframe } from "./helpers/syntheticPose";

const cal = syntheticCalibration();
const run = (keys: Keyframe[]) => detect(animate(keys), cal);

describe("punch detection (orthodox, calibrated)", () => {
  it("counts lead straights as jabs, to the head", () => {
    const r = run(punchSeries({ side: "left", path: ["straight"], count: 5, stepMs: [150] }));
    expect(countPunches(r)).toEqual({ jab: 5 });
    for (const p of r.punches) {
      expect(p.hand).toBe("left");
      expect(p.role).toBe("lead");
      expect(p.target).toBe("head");
      expect(p.snapMs).toBeGreaterThan(50);
      expect(p.snapMs).toBeLessThanOrEqual(250);
    }
  });

  it("counts rear straights as crosses", () => {
    const r = run(punchSeries({ side: "right", path: ["straight"], count: 5, stepMs: [150] }));
    expect(countPunches(r)).toEqual({ cross: 5 });
    expect(r.punches.every((p) => p.hand === "right" && p.role === "rear")).toBe(true);
  });

  it("labels low straights as body shots", () => {
    const r = run(punchSeries({ side: "left", path: ["straightBody"], count: 3, stepMs: [150] }));
    expect(countPunches(r)).toEqual({ jab: 3 });
    expect(r.punches.every((p) => p.target === "body")).toBe(true);
  });

  it("counts hooks with either hand", () => {
    const lead = run(punchSeries({ side: "left", path: ["hookWind", "hookFinish"], count: 5, stepMs: [200, 150] }));
    expect(countPunches(lead)).toEqual({ hook: 5 });
    const rear = run(punchSeries({ side: "right", path: ["hookWind", "hookFinish"], count: 5, stepMs: [200, 150] }));
    expect(countPunches(rear)).toEqual({ hook: 5 });
    expect(rear.punches.every((p) => p.hand === "right" && p.target === "head")).toBe(true);
  });

  it("counts uppercuts with either hand", () => {
    const lead = run(punchSeries({ side: "left", path: ["uppercutDip", "uppercutFinish"], count: 5, stepMs: [200, 150] }));
    expect(countPunches(lead)).toEqual({ uppercut: 5 });
    const rear = run(punchSeries({ side: "right", path: ["uppercutDip", "uppercutFinish"], count: 5, stepMs: [200, 150] }));
    expect(countPunches(rear)).toEqual({ uppercut: 5 });
  });

  it("ignores slow extensions (pushing, not punching)", () => {
    const r = run(punchSeries({ side: "left", path: ["straight"], count: 3, stepMs: [700] }));
    expect(r.punches).toHaveLength(0);
  });

  it("ignores arms raised out to the side", () => {
    const r = run(punchSeries({ side: "left", path: ["sideways"], count: 3, stepMs: [150] }));
    expect(r.punches.filter((p) => p.type === "jab" || p.type === "cross")).toHaveLength(0);
  });

  it("detects a fast one-two combo as jab then cross", () => {
    const keys: Keyframe[] = [
      { t: 0 },
      { t: 800 },
      { t: 950, left: "straight" },
      { t: 1100, left: "guard", right: "guard" },
      { t: 1250, right: "straight" },
      { t: 1400, right: "guard" },
      { t: 2200 },
    ];
    const r = run(keys);
    expect(r.punches.map((p) => p.type)).toEqual(["jab", "cross"]);
  });

  it("registers a double jab only after the hand returns toward guard", () => {
    const keys: Keyframe[] = [{ t: 0 }, { t: 800 }, { t: 950, left: "straight" }, { t: 1150, left: "guard" }, { t: 1300, left: "straight" }, { t: 1500, left: "guard" }, { t: 2200 }];
    expect(countPunches(run(keys))).toEqual({ jab: 2 });
  });

  it("does not read slipping with the hands up as hooks", () => {
    const keys: Keyframe[] = [{ t: 0 }, { t: 500 }];
    for (let i = 0, t = 500; i < 4; i++) {
      keys.push({ t: (t += 200), upper: [i % 2 ? -0.2 : 0.2, 0, 0] }, { t: (t += 200), upper: [0, 0, 0] }, { t: (t += 300) });
    }
    expect(run(keys).punches).toHaveLength(0);
  });

  it("does not read coming up from a duck as uppercuts", () => {
    const keys: Keyframe[] = [{ t: 0 }, { t: 500 }];
    for (let i = 0, t = 500; i < 3; i++) {
      keys.push({ t: (t += 200), upper: [0, 0.2, 0] }, { t: (t += 150), upper: [0, 0, 0] }, { t: (t += 400) });
    }
    expect(run(keys).punches).toHaveLength(0);
  });

  it("emits nothing while holding guard", () => {
    const r = run([{ t: 0 }, { t: 3000 }]);
    expect(r.punches).toHaveLength(0);
  });

  it("swaps jab and cross hands for southpaw", () => {
    const south = runCalibration(calibrationSession("southpaw"), "southpaw");
    const r = detect(animate(punchSeries({ side: "right", path: ["straight"], count: 3, stepMs: [150] })), south);
    expect(countPunches(r)).toEqual({ jab: 3 });
    expect(r.punches.every((p) => p.role === "lead")).toBe(true);
  });
});

describe("defense detection", () => {
  const types = (keys: Keyframe[]) => run(keys).defense.map((d) => d.type);

  it("reports high guard when hands are up", () => {
    const r = run([{ t: 0 }, { t: 1000 }]);
    expect(r.results.at(-1)!.signals.guard).toBe("high");
  });

  it("reports guard dropping when the hands go down", () => {
    const r = run([{ t: 0 }, { t: 500 }, { t: 800, left: "down", right: "down" }, { t: 1500 }]);
    expect(r.results.at(-1)!.signals.guard).toBe("none");
    expect(r.defense.map((d) => d.type)).toContain("guard:none");
  });

  it("detects slips left and right with entry and exit events", () => {
    const keys: Keyframe[] = [
      { t: 0 },
      { t: 500 },
      { t: 700, upper: [0.2, 0, 0] },
      { t: 1000 },
      { t: 1200, upper: [0, 0, 0] },
      { t: 1600 },
      { t: 1800, upper: [-0.2, 0, 0] },
      { t: 2100 },
      { t: 2300, upper: [0, 0, 0] },
      { t: 2800 },
    ];
    expect(types(keys).filter((t) => t.startsWith("slip"))).toEqual(["slip:left", "slip:end", "slip:right", "slip:end"]);
  });

  it("detects a duck and its end", () => {
    const keys: Keyframe[] = [{ t: 0 }, { t: 500 }, { t: 700, upper: [0, 0.2, 0] }, { t: 1000 }, { t: 1200, upper: [0, 0, 0] }, { t: 1700 }];
    expect(types(keys).filter((t) => t.startsWith("duck"))).toEqual(["duck", "duck:end"]);
  });

  it("does not read a small lean as a slip", () => {
    const keys: Keyframe[] = [{ t: 0 }, { t: 500 }, { t: 800, upper: [0.05, 0, 0] }, { t: 1500 }];
    expect(types(keys).filter((t) => t.startsWith("slip"))).toEqual([]);
  });

  it("does not read stepping sideways as a slip (hips move too)", () => {
    // Whole-body shift: offset moves hips with the head.
    const r = detect(
      animate([{ t: 0 }, { t: 500 }]).concat(
        animate([{ t: 0 }, { t: 500 }]).map((f, i) => ({
          ...f,
          timestamp: 533 + i * 33.3,
          pose: f.pose && {
            image: f.pose.image.map((l) => ({ ...l, x: l.x + 0.08 })),
            world: f.pose.world,
          },
        })),
      ),
      cal,
    );
    expect(r.defense.filter((d) => d.type.startsWith("slip"))).toEqual([]);
  });
});

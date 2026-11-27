import type { PuppetArtRef } from "../../data/fighter";

/**
 * Cutout puppet: a skeleton of parts posed by a handful of numbers. Poses come
 * from keyframed clips (animations.ts). Every part is a placeholder shape for
 * now; real art replaces drawPart() per part with images, no logic changes.
 *
 * The puppet faces the player, so his left arm ("lead", jab hand) is on the
 * right of the screen. Arm angles are degrees from straight down, positive =
 * outward (away from his body), so poses mirror cleanly between arms.
 */
export interface ArmPose {
  /** Upper arm angle from straight down; positive = out to his side. */
  shoulder: number;
  /** Elbow bend added to the upper arm angle (180 = forearm straight up). */
  elbow: number;
  /** Upper arm length factor: < 1 when it points at the camera (foreshortened). */
  reach: number;
  /** Forearm length factor. */
  foreReach: number;
  /** Glove size factor: > 1 when the glove comes at the camera. */
  glove: number;
}

export interface Pose {
  /** Whole puppet offset (fraction of puppet height) and scale (lunges). */
  x: number;
  y: number;
  scale: number;
  /** Torso lean, degrees (positive = toward screen right). */
  lean: number;
  /** Head offset relative to the neck (fraction of puppet height) and tilt. */
  headX: number;
  headY: number;
  headTilt: number;
  /** His left arm (screen right) and right arm (screen left). */
  lead: ArmPose;
  rear: ArmPose;
}

export type PoseKey = keyof Omit<Pose, "lead" | "rear">;

/** Elbows tucked in front of the body (upper arm foreshortened), gloves up by the chin. */
export const GUARD_ARM: ArmPose = { shoulder: 8, elbow: 182, reach: 0.45, foreReach: 1, glove: 1 };

export const BASE_POSE: Pose = {
  x: 0,
  y: 0,
  scale: 1,
  lean: 0,
  headX: 0,
  headY: 0,
  headTilt: 0,
  lead: { ...GUARD_ARM },
  rear: { ...GUARD_ARM },
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function lerpArm(a: ArmPose, b: ArmPose, k: number): ArmPose {
  return {
    shoulder: lerp(a.shoulder, b.shoulder, k),
    elbow: lerp(a.elbow, b.elbow, k),
    reach: lerp(a.reach, b.reach, k),
    foreReach: lerp(a.foreReach, b.foreReach, k),
    glove: lerp(a.glove, b.glove, k),
  };
}

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  return {
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    scale: lerp(a.scale, b.scale, k),
    lean: lerp(a.lean, b.lean, k),
    headX: lerp(a.headX, b.headX, k),
    headY: lerp(a.headY, b.headY, k),
    headTilt: lerp(a.headTilt, b.headTilt, k),
    lead: lerpArm(a.lead, b.lead, k),
    rear: lerpArm(a.rear, b.rear, k),
  };
}

/** Rig proportions as fractions of the puppet's height (pelvis to top of head). */
const RIG = {
  torso: 0.42,
  shoulderHalf: 0.17,
  waistHalf: 0.12,
  neck: 0.05,
  head: 0.095,
  upperArm: 0.2,
  forearm: 0.18,
  glove: 0.07,
  armWidth: 0.055,
};

export interface PuppetHighlight {
  /** Which glove glows (the tell), and how strongly 0-1. */
  arm: "lead" | "rear" | null;
  strength: number;
}

/**
 * Draws the puppet with its pelvis at (cx, baseY) and the given height in px.
 * Draw order puts the arm reaching toward the camera on top.
 */
export function drawPuppet(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  art: PuppetArtRef,
  cx: number,
  baseY: number,
  height: number,
  highlight: PuppetHighlight,
): void {
  const H = height * pose.scale;
  const px = cx + pose.x * height;
  const py = baseY + pose.y * height;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate((pose.lean * Math.PI) / 180);

  const torsoTop = -RIG.torso * H;
  // Torso: a tapered shape from waist to shoulders.
  ctx.fillStyle = art.skin;
  ctx.beginPath();
  ctx.moveTo(-RIG.waistHalf * H, 0);
  ctx.lineTo(-RIG.shoulderHalf * H, torsoTop + 0.03 * H);
  ctx.quadraticCurveTo(0, torsoTop - 0.02 * H, RIG.shoulderHalf * H, torsoTop + 0.03 * H);
  ctx.lineTo(RIG.waistHalf * H, 0);
  ctx.closePath();
  ctx.fill();
  // Chest shading and trunks waistband.
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(-0.004 * H, torsoTop + 0.1 * H, 0.008 * H, 0.18 * H);
  ctx.fillStyle = art.trunks;
  ctx.fillRect(-RIG.waistHalf * H * 1.05, -0.05 * H, RIG.waistHalf * H * 2.1, 0.08 * H);

  // Neck and head.
  ctx.fillStyle = art.skin;
  ctx.fillRect(-0.035 * H, torsoTop - RIG.neck * H, 0.07 * H, RIG.neck * H + 0.02 * H);
  const hx = pose.headX * H;
  const hy = torsoTop - RIG.neck * H - RIG.head * H + pose.headY * H;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((pose.headTilt * Math.PI) / 180);
  ctx.fillStyle = art.skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, RIG.head * H * 0.85, RIG.head * H, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = art.hair;
  ctx.beginPath();
  ctx.ellipse(0, -RIG.head * H * 0.45, RIG.head * H * 0.88, RIG.head * H * 0.6, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // Simple face: eyes and brow so head turns and flinches read.
  ctx.fillStyle = "#1c1410";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * RIG.head * H * 0.32, -RIG.head * H * 0.05, RIG.head * H * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(-RIG.head * H * 0.25, RIG.head * H * 0.42, RIG.head * H * 0.5, RIG.head * H * 0.07);
  ctx.restore();

  // Arms: the one reaching toward the camera (bigger glove) draws last.
  const arms: { pose: ArmPose; side: 1 | -1; id: "lead" | "rear" }[] = [
    { pose: pose.lead, side: 1, id: "lead" },
    { pose: pose.rear, side: -1, id: "rear" },
  ];
  arms.sort((a, b) => a.pose.glove - b.pose.glove);
  for (const a of arms) {
    drawArm(ctx, a.pose, a.side, H, torsoTop, art, highlight.arm === a.id ? highlight.strength : 0);
  }
  ctx.restore();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  arm: ArmPose,
  side: 1 | -1,
  H: number,
  torsoTop: number,
  art: PuppetArtRef,
  glow: number,
): void {
  const sx = side * RIG.shoulderHalf * H * 0.92;
  const sy = torsoTop + 0.04 * H;
  const dir = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.sin(r) * side, y: Math.cos(r) };
  };
  const u = dir(arm.shoulder);
  const ex = sx + u.x * RIG.upperArm * H * arm.reach;
  const ey = sy + u.y * RIG.upperArm * H * arm.reach;
  const f = dir(arm.shoulder + arm.elbow);
  const wx = ex + f.x * RIG.forearm * H * arm.foreReach;
  const wy = ey + f.y * RIG.forearm * H * arm.foreReach;

  ctx.lineCap = "round";
  ctx.strokeStyle = art.skin;
  ctx.lineWidth = RIG.armWidth * H * (0.85 + 0.15 * arm.glove);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(wx, wy);
  ctx.stroke();

  const r = RIG.glove * H * arm.glove;
  if (glow > 0) {
    const g = ctx.createRadialGradient(wx, wy, r * 0.6, wx, wy, r * 3);
    g.addColorStop(0, `rgba(255,220,90,${0.9 * glow})`);
    g.addColorStop(1, "rgba(255,220,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy, r * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = art.gloves;
  ctx.beginPath();
  ctx.arc(wx, wy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(wx - r * 0.3, wy - r * 0.3, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

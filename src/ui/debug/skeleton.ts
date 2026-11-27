import type { BodyFrame } from "../../core/body/bodyFrame";
import { LM, SKELETON_CONNECTIONS } from "../../core/pose/landmarks";

/** Where the camera image sits on the canvas, in canvas pixels. */
export interface ImageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest rect of the given aspect that fits inside w x h, centered. */
export function containRect(w: number, h: number, aspect: number): ImageRect {
  if (w / h > aspect) {
    const rw = h * aspect;
    return { x: (w - rw) / 2, y: 0, w: rw, h };
  }
  const rh = w / aspect;
  return { x: 0, y: (h - rh) / 2, w, h: rh };
}

const KEY_POINTS = new Set<number>(Object.values(LM));

/** Draws the debug skeleton for a BodyFrame over an image drawn at `rect`. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: BodyFrame,
  rect: ImageRect,
  minVisibility: number,
): void {
  if (frame.landmarks.length === 0) return;
  const px = (x: number) => rect.x + (x / frame.imageAspect) * rect.w;
  const py = (y: number) => rect.y + y * rect.h;
  const scale = rect.h / 720;
  const pts = frame.landmarks;
  const color = frame.tracked ? "#3ee07a" : "#f0b43c";

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, 5 * scale);
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const pa = pts[a], pb = pts[b];
    if (!pa || !pb) continue;
    const vis = Math.min(pa.visibility, pb.visibility) >= minVisibility;
    ctx.strokeStyle = vis ? color : "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(px(pa.x), py(pa.y));
    ctx.lineTo(px(pb.x), py(pb.y));
    ctx.stroke();
  }
  pts.forEach((p, i) => {
    if (i > 24) return; // skip feet
    const vis = p.visibility >= minVisibility;
    const key = KEY_POINTS.has(i);
    ctx.fillStyle = !vis ? "rgba(255,255,255,0.25)" : key ? "#ffffff" : color;
    ctx.beginPath();
    ctx.arc(px(p.x), py(p.y), (key ? 7 : 4) * Math.max(0.5, scale), 0, Math.PI * 2);
    ctx.fill();
  });

  // Wrist labels with live extension, so arm metrics can be eyeballed against the image.
  ctx.font = `${Math.round(16 * Math.max(0.7, scale))}px ui-monospace, monospace`;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 4;
  for (const side of ["left", "right"] as const) {
    const arm = frame.arms[side];
    if (!arm.visible) continue;
    const label = `${side === "left" ? "L" : "R"} ${arm.extension.toFixed(2)}`;
    const x = px(arm.wrist.x) + 12, y = py(arm.wrist.y) - 12;
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  }

  // Body scale bar under the shoulders: the unit every detector uses.
  if (frame.tracked) {
    const y = py(frame.shoulderMid.y) + 18 * scale;
    const half = (frame.scale / frame.imageAspect) * rect.w * 0.5;
    const cx = px(frame.shoulderMid.x);
    ctx.strokeStyle = "rgba(120,190,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx + half, y);
    ctx.stroke();
  }
  ctx.restore();
}

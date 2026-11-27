export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const mid2 = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Angle at vertex b formed by a-b-c, in degrees (180 = straight). */
export function angle3(a: Vec3, b: Vec3, c: Vec3): number {
  const ux = a.x - b.x, uy = a.y - b.y, uz = a.z - b.z;
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z;
  const nu = Math.hypot(ux, uy, uz);
  const nv = Math.hypot(vx, vy, vz);
  if (nu === 0 || nv === 0) return 180;
  const cos = (ux * vx + uy * vy + uz * vz) / (nu * nv);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

import type { Landmark, RawPoseFrame } from "../pose/types";

/**
 * Pose session file format. Stores the raw tracker output (image + world
 * landmarks) rather than derived BodyFrames, so a recording stays valid when
 * smoothing or BodyFrame math changes: replay rebuilds BodyFrames through the
 * current pipeline with the current config.
 *
 * Landmarks are stored as [x, y, z, visibility] tuples to keep files small.
 */
export const RECORDING_FORMAT = "motiongames.pose-session";
export const RECORDING_VERSION = 1;

export type LandmarkTuple = [number, number, number, number];

export interface RecordedFrame {
  /** ms since the first frame. */
  t: number;
  /** Image landmarks, or null when no pose was found. */
  lm: LandmarkTuple[] | null;
  /** World landmarks, or null when no pose was found. */
  wl: LandmarkTuple[] | null;
}

export interface RecordingMeta {
  model: string;
  delegate: string;
  imageWidth: number;
  imageHeight: number;
}

export interface PoseRecording {
  format: typeof RECORDING_FORMAT;
  version: typeof RECORDING_VERSION;
  createdAt: string;
  /** Free text, e.g. "jab-cross-x10". */
  label: string;
  meta: RecordingMeta;
  frames: RecordedFrame[];
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

export function toTuple(l: Landmark): LandmarkTuple {
  return [round(l.x, 5), round(l.y, 5), round(l.z, 5), round(l.visibility, 3)];
}

function fromTuple(t: LandmarkTuple): Landmark {
  return { x: t[0], y: t[1], z: t[2], visibility: t[3] };
}

/** Converts a recording into the frames the pipeline consumes. */
export function recordingToFrames(rec: PoseRecording): RawPoseFrame[] {
  const aspect = rec.meta.imageWidth / rec.meta.imageHeight;
  return rec.frames.map((f) => ({
    timestamp: f.t,
    imageAspect: aspect,
    pose: f.lm && f.wl ? { image: f.lm.map(fromTuple), world: f.wl.map(fromTuple) } : null,
  }));
}

export class RecordingFormatError extends Error {}

function isTupleArray(v: unknown): v is LandmarkTuple[] {
  return (
    Array.isArray(v) &&
    v.every((t) => Array.isArray(t) && t.length === 4 && t.every((n) => typeof n === "number" && Number.isFinite(n)))
  );
}

/** Parses and validates a recording from JSON text. Throws RecordingFormatError on bad input. */
export function parseRecording(json: string): PoseRecording {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new RecordingFormatError("Not a JSON file.");
  }
  const d = data as Partial<PoseRecording>;
  if (!d || typeof d !== "object" || d.format !== RECORDING_FORMAT) {
    throw new RecordingFormatError("Not a pose session recording.");
  }
  if (d.version !== RECORDING_VERSION) {
    throw new RecordingFormatError(`Unsupported recording version ${String(d.version)}.`);
  }
  const m = d.meta;
  if (!m || !(m.imageWidth > 0) || !(m.imageHeight > 0)) {
    throw new RecordingFormatError("Recording is missing image size.");
  }
  if (!Array.isArray(d.frames) || d.frames.length === 0) {
    throw new RecordingFormatError("Recording has no frames.");
  }
  let lastT = -Infinity;
  d.frames.forEach((f, i) => {
    if (typeof f?.t !== "number" || f.t < lastT) throw new RecordingFormatError(`Frame ${i} has a bad timestamp.`);
    lastT = f.t;
    const hasPose = f.lm !== null || f.wl !== null;
    if (hasPose && !(isTupleArray(f.lm) && isTupleArray(f.wl))) {
      throw new RecordingFormatError(`Frame ${i} has malformed landmarks.`);
    }
  });
  return {
    format: RECORDING_FORMAT,
    version: RECORDING_VERSION,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
    label: typeof d.label === "string" ? d.label : "",
    meta: m,
    frames: d.frames,
  };
}

export function serializeRecording(rec: PoseRecording): string {
  return JSON.stringify(rec);
}

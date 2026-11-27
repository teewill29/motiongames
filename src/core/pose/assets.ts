import type { PoseModel } from "../settings/settings";

/**
 * Where to load the MediaPipe runtime and models from. `npm install` copies them
 * into public/mediapipe/ (scripts/setup-mediapipe.mjs); if they are missing,
 * fall back to the CDN.
 */
const MP_VERSION = "1.2.3"; // keep in sync with package.json
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const CDN_MODEL = (m: PoseModel) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/latest/pose_landmarker_${m}.task`;

const base = import.meta.env.BASE_URL;
const LOCAL_WASM = `${base}mediapipe/wasm`;
const LOCAL_MODEL = (m: PoseModel) => `${base}mediapipe/models/pose_landmarker_${m}.task`;

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    // Vite's dev server answers unknown paths with index.html, so check the type too.
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

export interface PoseAssets {
  wasmBase: string;
  modelUrl: string;
  source: "local" | "cdn";
}

export async function resolvePoseAssets(model: PoseModel): Promise<PoseAssets> {
  const [wasmOk, modelOk] = await Promise.all([
    exists(`${LOCAL_WASM}/vision_wasm_internal.wasm`),
    exists(LOCAL_MODEL(model)),
  ]);
  if (wasmOk && modelOk) return { wasmBase: LOCAL_WASM, modelUrl: LOCAL_MODEL(model), source: "local" };
  return {
    wasmBase: wasmOk ? LOCAL_WASM : CDN_WASM,
    modelUrl: modelOk ? LOCAL_MODEL(model) : CDN_MODEL(model),
    source: "cdn",
  };
}

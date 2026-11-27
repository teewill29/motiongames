// Copies the MediaPipe wasm runtime out of node_modules and downloads the pose
// models into public/mediapipe/, so the app runs without a CDN at play time.
// Runs on `npm install`. Failures are non-fatal: the app falls back to the CDN.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const outDir = join(root, "public", "mediapipe");
const wasmOut = join(outDir, "wasm");
const modelOut = join(outDir, "models");

const MODELS = {
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};

function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.warn("[setup-mediapipe] @mediapipe/tasks-vision not installed yet, skipping wasm copy");
    return;
  }
  mkdirSync(wasmOut, { recursive: true });
  // Only the classic (non-module) runtime is used; see src/core/pose/assets.ts.
  for (const file of readdirSync(wasmSrc).filter((f) => f.startsWith("vision_wasm_internal")))
    copyFileSync(join(wasmSrc, file), join(wasmOut, file));
  console.log("[setup-mediapipe] wasm copied to public/mediapipe/wasm");
}

async function downloadModels() {
  mkdirSync(modelOut, { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const dest = join(modelOut, name);
    if (existsSync(dest)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest + ".part", buf);
      renameSync(dest + ".part", dest);
      console.log(`[setup-mediapipe] downloaded ${name} (${(buf.length / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      console.warn(`[setup-mediapipe] could not download ${name}: ${err.message}. The app will load it from the CDN.`);
    }
  }
}

copyWasm();
await downloadModels();

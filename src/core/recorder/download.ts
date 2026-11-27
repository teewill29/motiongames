import { serializeRecording, type PoseRecording } from "./format";

/** Saves a recording through the browser's download prompt. */
export function downloadRecording(rec: PoseRecording): string {
  const stamp = rec.createdAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const prefix = rec.label && rec.label !== "free" ? rec.label : "pose-session";
  const name = `${prefix}-${stamp}.json`;
  const blob = new Blob([serializeRecording(rec)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

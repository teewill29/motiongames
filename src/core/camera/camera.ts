export interface CameraInfo {
  deviceId: string;
  label: string;
}

export interface CameraOptions {
  deviceId: string | null;
  fps: number;
}

/** Lists video inputs. Labels are blank until the user has granted camera permission once. */
export async function listCameras(): Promise<CameraInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** Opens a 1280x720 stream from the chosen camera (or the default one). */
export async function openCamera(opts: CameraOptions): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser has no camera API. Use Chrome or Edge over localhost or HTTPS.");
  }
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: opts.fps },
  };
  if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    // A saved camera that's been unplugged: fall back to the default camera.
    if (opts.deviceId && err instanceof DOMException && err.name === "OverconstrainedError") {
      delete video.deviceId;
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    throw err;
  }
}

/** Attaches a stream to a video element and waits until frames are available. */
export async function attachStream(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => video.addEventListener("loadeddata", () => resolve(), { once: true }));
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Camera permission was denied. Allow camera access in the address bar, then try again.";
      case "NotFoundError":
        return "No camera found. Plug in a webcam and try again.";
      case "NotReadableError":
        return "The camera is in use by another app. Close it and try again.";
    }
  }
  return err instanceof Error ? err.message : String(err);
}

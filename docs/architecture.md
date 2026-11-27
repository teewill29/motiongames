# Architecture

One web app holds every game. The shared core handles the camera, pose tracking, calibration, settings and stats. Each game is a module that reads pose data from the core and supplies its own logic and renderer.

## Layers

```
Webcam
  -> Pose tracking (MediaPipe PoseLandmarker)      core/pose
  -> Body frame (normalized, smoothed landmarks)   core/body
  -> Game input detectors (punch, slip, lean...)   games/<game>/input
  -> Game logic (state, rules, AI)                 games/<game>/logic
  -> Renderer (2D now, 3D later)                   games/<game>/render
```

- **Input** turns body frames into discrete events (`punch:jab`, `slip:left`) and continuous signals (`guardUp: true`, `lean: -0.4`).
- **Logic** consumes events and signals on a fixed timestep and produces a game state. It has no knowledge of the camera or the renderer.
- **Renderer** draws the current game state each animation frame. It may interpolate and add effects, but never changes state.

The upgrade from 2D to 3D replaces `render/` only.

## Folder structure

```
src/
  core/
    camera/        webcam selection, stream, resolution
    pose/          PoseLandmarker setup, frame loop, landmark smoothing
    body/          BodyFrame type, normalization, derived measurements
    calibration/   calibration flow and saved profile
    recorder/      record and replay pose sessions as JSON
    settings/      app and per-game settings
    storage/       storage interface (localStorage implementation)
    stats/         session history shared across games
    audio/         sound effects and music playback
  ui/
    hub/           home screen and game menu
    debug/         overlay: skeleton, events, FPS, live threshold sliders
  games/
    boxing/
      input/  logic/  render/  data/  config.ts
    runner/
      input/  logic/  render/  data/  config.ts
tests/
  fixtures/        recorded pose sessions for replay tests
```

## Camera and pose tracking

- Use `@mediapipe/tasks-vision` `PoseLandmarker` in `VIDEO` running mode, GPU delegate, `numPoses: 1`.
- Start with the `full` model, and add a setting for the `lite` model in case the laptop can't hold the frame rate.
- Target 30 fps or better for tracking. Show the measured FPS in the debug overlay.
- Request a 1280x720 camera stream, and let the user pick a camera in settings when more than one is connected.
- Mirror the display so moving your right hand moves the right side of the screen. Keep the left/right labels in the data consistent with the player's own body (MediaPipe's "left" landmarks are the person's left).

### Landmarks used

| Index | Landmark |
| --- | --- |
| 0 | Nose |
| 11, 12 | Left and right shoulder |
| 13, 14 | Left and right elbow |
| 15, 16 | Left and right wrist |
| 23, 24 | Left and right hip |

### BodyFrame

Every pose result becomes a `BodyFrame`:

- `timestamp` (ms)
- landmarks smoothed with a One Euro filter (tunable; low lag matters more than perfect smoothness)
- `shoulderWidth` (this frame's) and `scale`, the base unit of distance: a facing-the-camera shoulder width. Each frame takes the larger of the shoulder width and torso length × the player's calibrated shoulder/torso ratio, then the max over 1.5 s. A fighting stance turns the shoulders and shrinks the 2D shoulder width by about 20% for as long as it's held; the torso term covers that.
- `shoulderMid`, `hipMid`, `torsoLength`
- per-arm `extension` = shoulder-to-wrist distance / calibrated arm length (0 = fist at shoulder, 1 = arm straight)
- per-arm `elbowAngle` in degrees (from world landmarks; unreliable for arms pointed at the camera)
- per-arm `upperArmRatio`: on-screen upper arm length over its calibrated side-on length. About 1 when the arm hangs or points sideways, about 0.2 to 0.4 when it points at the camera. Purely 2D.
- per-wrist velocity in scale units per second, x and y, both on screen and relative to the shoulder midpoint (`wristVelocityBody`). Detectors use the body-relative one, so slipping or ducking with the hands up doesn't read as a hook or uppercut.
- `shoulderTilt` in degrees
- `visibility` flags, so detectors can ignore low-confidence landmarks
- `tracked: boolean`, false when no pose was found or key landmarks have low visibility

Games read `BodyFrame`s and never raw MediaPipe output.

**Depth is unreliable.** MediaPipe's z and world landmarks badly underestimate an arm pointed at the camera, and they couple the two arms: when one hand jabs, the other often appears to extend in depth too. Detectors should rely on 2D signals and use depth only as supporting evidence.

## Calibration

Run on first launch and on demand from settings. Save the profile to storage.

1. **Position check:** show the camera feed with a target outline and confirm the player is centered and visible from the waist up (full body for games that need it).
2. **Neutral stance:** hold still for 2 seconds to record baseline shoulder height, head position, hip center and shoulder width.
3. **Arm length:** extend each arm straight toward the camera, then out to the side, to record max extension per arm.
4. **Game-specific steps:** each game can add its own steps, such as boxing's guard and practice punches.

Re-check the player's distance from the camera at the start of each session. If shoulder width differs from the profile by more than 15%, prompt a quick recalibration.

## Pose recorder and replay

Claude Code can't use a live camera, so this tool is essential for development and tests.

- Hotkey `R` on the pose screen starts and stops recording to a JSON file (downloaded through the browser).
- Recordings store the raw tracker output (image and world landmarks with timestamps), not derived `BodyFrame`s. Replay rebuilds `BodyFrame`s through the current pipeline, so old recordings stay valid when smoothing or `BodyFrame` math changes. Format: `src/core/recorder/format.ts`.
- Replay mode feeds a recorded file through the pipeline in place of the camera, at real speed (0.1x to 2x) or stepped frame by frame.
- Store labeled recordings in `tests/fixtures/` (for example `jab-cross-x10.json` or `slip-left-right.json`).
- Detector tests run fixtures through the input layer and assert on the events that come out, with tolerances.

The owner will record fixtures with the real setup once Phase 1 of a game exists.

## Settings

- **App:** camera device, model (full or lite), volume, debug overlay default, units (miles or kilometers)
- **Per game:** difficulty, round length, stance, and so on. Each game defines its own settings schema.

## Stats and history

- Each game writes a session record when the session ends: game id, start time, duration, result, and a game-specific stats object.
- The hub has a history screen listing past sessions with per-game summaries and personal bests.
- Keep all of it behind the `storage` interface so a database or a sync to a fitness app can be added later without changing games.

## App shell

- The hub screen shows a tile per game, plus Settings, Calibration and History. Navigate with mouse and keyboard.
- Run fullscreen (the Fullscreen API on a button or the `F` key).
- `Esc` pauses any game and opens a pause menu.
- If tracking is lost for more than 1 second mid-game, auto-pause and show "Step back into view."

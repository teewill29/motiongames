# CLAUDE.md

Instructions for Claude Code working in this repo.

## What this is

A browser web app of webcam motion-controlled games, played on a TV. A laptop runs the app in Chrome, is connected to the TV over HDMI, and uses a webcam mounted on top of the TV. Pose tracking (MediaPipe) turns body movement into game input.

Two games are planned:

1. **Boxing** (build first): first-person fights against AI opponents. See `docs/boxing.md`.
2. **Treadmill Runner** (build second): an endless lane runner played while walking on a treadmill. See `docs/treadmill-runner.md`.

Shared systems (camera, pose tracking, calibration, settings, stats, app shell) are in `docs/architecture.md`. Read it before writing code.

## Build order

**Start with the boxing game.** Build the shared foundation only as far as boxing needs it, then extend it when the runner starts. Do not start the runner until the boxing phases in `docs/boxing.md` are done or the owner says otherwise.

Work phase by phase. Each phase has acceptance criteria. Finish and demo a phase before starting the next one.

## Rules

- **Keep the three layers separate: input, logic, renderer.** Game logic never touches the camera or MediaPipe directly, and renderers never change game state. The 2D renderer will be swapped for 3D later, so nothing outside `render/` may depend on how things are drawn.
- **Fighter data lives in data files**, not in code: stats, attack patterns, tells and art references. Adding an opponent should not require editing logic.
- **No magic numbers in detectors.** Every threshold (extension ratio, velocity, angles, cooldowns) goes in a config file and can be tuned live from the debug screen.
- **Normalize body measurements.** Express distances in shoulder widths or calibrated arm lengths, never raw pixels, so detection works at any distance from the camera.
- **Record and replay pose data.** The pose recorder (see architecture) is how detection and logic get tested without a live camera. Write unit tests against recorded sessions.
- **Use mouse and keyboard for menus.** The player walks to the laptop between games, so menus do not need gesture controls.
- **Keep the debug overlay** (skeleton, detected events, FPS, thresholds) on a hotkey (`D`) in every game.
- **Safety first in the runner**: no game input may ask the player to jump or step sideways on a moving belt. See the safety section in `docs/treadmill-runner.md`.

## Stack

- Vite + TypeScript (strict)
- `@mediapipe/tasks-vision` PoseLandmarker for pose tracking
- Canvas 2D for the first renderers
- Vitest for unit tests
- No backend. Persist to `localStorage` behind a storage interface so a database can replace it later.

## Commands

- `npm install`: installs dependencies, copies the MediaPipe wasm into `public/mediapipe/` and downloads the pose models (falls back to the CDN at runtime if the download failed)
- `npm run dev`: local dev server at http://localhost:5173 (localhost allows camera access)
- `npm run build`: typecheck and production build into `dist/`
- `npm test`: unit tests (Vitest)
- `npm run typecheck`: strict TypeScript check for app, tests and scripts
- `npm run fixtures:synthetic`: regenerate the synthetic test fixture in `tests/fixtures/`

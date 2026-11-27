# Motion Games

Webcam motion-controlled games for the living room TV. Stand in front of the camera and your body is the controller.

| Game | Status | Spec |
| --- | --- | --- |
| Boxing | Phase 2: playable fight vs. Dusty Hale | [docs/boxing.md](docs/boxing.md) |
| Treadmill Runner | Planned | [docs/treadmill-runner.md](docs/treadmill-runner.md) |

Shared systems: [docs/architecture.md](docs/architecture.md)
Instructions for Claude Code: [CLAUDE.md](CLAUDE.md)

## Setup

**Hardware**
- A laptop or mini PC running Chrome or Edge
- An HDMI cable to the TV
- A webcam (built-in works; a USB webcam on top of the TV works better)
- Floor space: about 6 to 8 feet between you and the camera
- Even lighting on your front, with no bright window behind you

**Run locally**

```bash
npm install
npm run dev
```

Open the local URL in Chrome and allow camera access. Browsers only allow the camera over `localhost` or HTTPS.

**Deploy**

Any static host with HTTPS works: GitHub Pages, Netlify or Vercel. Run `npm run build` and deploy the `dist/` folder.

## Data

Calibration, settings, scores and session stats save in the browser on the device you play on. Clearing browser data erases them.

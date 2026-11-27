# Treadmill Runner

An endless lane runner played while walking or jogging on a treadmill. Upper-body gestures switch lanes, jump and slide, and real treadmill speed sets how fast the game moves.

**Build this after the boxing game.** It reuses the shared core from `docs/architecture.md`.

## Safety

These rules override any gameplay idea:

- **No real jumping, dodging or side steps.** Every control is an upper-body gesture done while walking normally. The treadmill is a walking pad with no handrails.
- **Lost tracking pauses the game.** If the player stumbles or steps off, the game stops.
- **The game never controls the treadmill.** It may read speed over Bluetooth but must never write speed or incline commands.
- Gestures are small and quick, so the player's walking rhythm doesn't change.
- Show a one-time safety screen before the first run: set a comfortable speed first, keep eyes forward, step off if unsure.

## Controls

Detected on `BodyFrame`s, with thresholds in `games/runner/config.ts`.

| Action | Gesture | Detection |
| --- | --- | --- |
| Lane left or right | Lean shoulders | Shoulder midpoint moves sideways from the calibrated center by more than 0.3 shoulder widths. One lane per lean; the player must return near center before the next switch. |
| Jump | Raise both hands | Both wrists above the nose for at least 100ms |
| Slide | Dip | Shoulder midpoint drops more than 0.15 torso lengths below baseline, or a quick chin tuck. Tune the method in Phase 1. |

### Filtering walking motion

Walking makes the shoulders bob and sway, so detectors must filter it out:

- Calibrate while walking: record 10 seconds at the player's normal pace to measure the natural sway and bob range.
- Set the lean and dip thresholds above that range.
- Use a low-pass filter on shoulder midpoint for lean, and a short hold time (about 80ms) before triggering.

## Speed input

Game speed follows the player's real speed. Three sources, in order of preference, chosen in settings:

### 1. Bluetooth FTMS

The Fitness Machine Service is the standard that apps like Kinomap and Zwift use.

- Service `0x1826`, Treadmill Data characteristic `0x2ACD` (notify)
- Read instantaneous speed (uint16, units of 0.01 km/h) and total distance if present
- Web Bluetooth works in Chrome and Edge on desktop and Android only. It does not work on iPhone or iPad.
- Only one device can connect at a time, so other fitness apps must be closed.
- The owner's treadmill is a Garvee walking pad. **Check whether it broadcasts FTMS** before relying on this: scan for service `0x1826` in a test page. If it doesn't, use option 2 or 3.

### 2. Webcam step cadence

- Detect steps from the vertical bob of the hip midpoint (peak detection on a filtered signal).
- Estimate speed = cadence × stride length. Stride length is set once in calibration by walking at a known treadmill speed for 30 seconds.
- Rougher than Bluetooth, but works on any treadmill.

### 3. Manual

The player enters the treadmill speed and changes it with `+` and `-` on the keyboard. The game assumes that speed until it's changed. If tracking shows the player standing still, the game pauses.

### Mapping speed to the game

- Tune for walking-pad speeds of roughly 1.5 to 4 mph.
- Game world speed scales linearly with real speed, so 2 mph feels slow and 4 mph feels fast.
- Distance in the game equals real distance walked.
- Speed 0 for more than 2 seconds pauses the run.

## Gameplay

- Three lanes, viewed from behind the runner, heading into the distance.
- **Obstacles:**
    - Low barrier: jump
    - High bar: slide
    - Blocked lane: switch lanes
- Coins in lines and arcs that reward lane changes.
- Hitting an obstacle costs one of three lives and slows the run briefly. Losing all three ends the run.
- Obstacles are spaced by time, not distance, so faster walking means more obstacles per minute. Keep at least 1.5 seconds between required actions at the start of a run, tightening to 0.8 seconds over time.
- Difficulty ramps with distance: more obstacles, more combinations (switch then jump) and less warning.

### Modes

- **Endless:** run until out of lives
- **Distance goal:** reach a set distance (0.5, 1, 2 or 3 miles)
- **Timed:** a set time (10, 20 or 30 minutes)
- **No-fail:** obstacles cost coins instead of lives, for long steady walks

## Renderer (2D)

Canvas 2D, behind a `RunnerRenderer` interface.

- **Pseudo-3D perspective:** lanes converge to a vanishing point, and objects scale as they approach.
- The runner character is seen from behind, using the same cutout puppet system as boxing: run cycle, jump, slide, stumble.
- The environment scrolls in themed sections (city, forest, canyon) that change every half mile.
- Obstacles must be visible at least 2 seconds before reaching the player at any speed.

### HUD

- Distance, time, current speed, coins and lives
- Pace indicator (current speed vs. average)
- Distance or time remaining in goal modes

## Stats

Saved per run through the shared stats system:

- Distance, time, average speed and top speed
- Coins collected
- Obstacles cleared and hit, by type
- Mode and result
- Personal bests: longest run, most coins, farthest endless distance

## Build phases

### Phase 1: Controls test screen

Walking calibration plus a screen labeling lean left, lean right, jump and slide while the player walks. It shows the current speed from the chosen source.

**Done when:** gestures trigger reliably while walking at 2 to 4 mph with no false triggers over 5 minutes, and the speed source works (FTMS confirmed or ruled out).

### Phase 2: Core runner

Three lanes, the three obstacle types, coins, lives and speed-driven movement, with placeholder shapes. Endless mode only.

**Done when:** a full endless run is playable while walking.

### Phase 3: Modes and stats

All modes, the HUD, sound and the stats screen.

### Phase 4: Art and polish

Runner puppet art, themed environments and effects.

## Later

- 3D renderer with Three.js
- Ghost runner: race your own best run
- Treadmill incline from FTMS (read only) driving uphill sections

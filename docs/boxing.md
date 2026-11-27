# Boxing

A first-person boxing game. An opponent faces you on screen. You throw real punches, block, slip and duck to win fights, working up a ladder of original fighters.

The design is pattern-based, like classic arcade boxing. Each opponent telegraphs attacks with tells. You read the tell, defend, then counter in the opening. This suits webcam tracking, which has about 100ms of lag and can't support frame-perfect reactions.

## Player input

All detection works on normalized `BodyFrame`s (see `docs/architecture.md`). Every threshold below is a starting value and lives in `games/boxing/config.ts`, tunable from the debug screen.

### Stance

A setting chooses orthodox (left hand leads) or southpaw (right hand leads). The lead hand throws jabs, and the rear hand throws crosses.

### Punches

A punch fires when a wrist moves from the guard zone into a strike pattern. The hand must come back toward guard (extension below 0.55) before that hand can register another punch. Each hand has a minimum cooldown of 200ms.

| Punch | Hand | Detection |
| --- | --- | --- |
| Jab | Lead | Extension rises from below 0.55 to above 0.85 within 250ms, elbow angle above 140° at peak, wrist moves toward the screen center |
| Cross | Rear | Same as jab, with the rear hand |
| Hook | Either | Elbow angle stays between 60° and 120°, wrist moves sideways toward the centerline above 2.5 shoulder widths/sec, wrist at or above shoulder height |
| Uppercut | Either | Wrist moves upward above 2.5 shoulder widths/sec, starting below shoulder height, elbow angle between 50° and 120° |

- **Target height:** at the punch's peak, a wrist above shoulder height hits the head. A wrist between shoulder and mid-torso hits the body.
- **Ambiguous motion:** if a motion matches more than one punch, the strongest match wins.
- **Snap:** report how fast the punch was (time from guard to peak) with each event. Logic uses it for damage.
- **Supplementary depth:** MediaPipe's z value can add confidence for straight punches, but don't rely on it alone.

### Defense

| Action | Detection |
| --- | --- |
| Guard | Both wrists within 0.7 shoulder widths of the nose and above shoulder height |
| Slip left or right | Nose moves sideways from the calibrated center by more than 0.35 shoulder widths, while shoulders stay roughly level |
| Duck | Shoulder midpoint drops more than 0.25 torso lengths below the calibrated baseline |

Guard is a continuous state. Slip and duck are states with an entry event, active while held.

### Boxing calibration steps

These run after the shared calibration steps:

1. Choose a stance.
2. Hold your guard for 2 seconds to record the guard zone.
3. Throw 3 jabs and 3 crosses to record extension and speed ranges, then adjust the default thresholds from them.
4. Slip left, slip right and duck once each to record ranges.

## Fight logic

Run on a fixed timestep of 60 Hz, independent of the render frame rate.

### Player state

- **Health:** 100. Taking a hit removes damage based on the attack.
- **Stamina:** 100. Punches cost stamina: jab 3, cross 5, hook 6, uppercut 7. Stamina regenerates 12 per second after 0.5 seconds without punching.
- **Low stamina:** below 25, punches deal half damage and the screen edges dim. At 0, punches don't register until stamina is back above 10.
- **Knockdowns:** if health reaches 0, the player is knocked down. To get up before the count of 10, the player must throw 20 punches (any type) to fill a get-up meter. Each knockdown after the first takes 5 more punches. When the player gets up, health resets to 40.

### Opponent state machine

```
idle -> guard -> windup (tell) -> attack -> recover -> guard
                                        \-> whiff -> open (vulnerable) -> guard
guard -> hit -> guard
any -> stunned -> guard
any -> knockdown -> (count) -> guard | KO
```

- **Windup:** plays the tell for the attack the opponent chose. Windup length sets difficulty, from 900ms on easy fighters to 350ms on the hardest.
- **Attack:** resolves against the player's defense when the attack lands.
- **Whiff:** if the player defended correctly, the opponent misses and enters `open` for a window (default 800ms), taking double damage.
- **Hit:** a short flinch. Repeated clean hits within 1.5 seconds build a stun meter, and a full meter stuns the opponent for 1.5 seconds.
- **Guard:** while guarding, the opponent blocks the punches its data allows (for example high guard blocks head shots, not body shots). Blocked punches deal 10% damage.

### Opponent attacks and correct defense

| Attack | Beats it |
| --- | --- |
| Straight to the head (jab or cross) | Guard, or a slip to either side |
| Hook (left or right) | Duck, or guard (takes 30% damage through the guard) |
| Uppercut | Guard, or a slip |
| Body shot | Lower guard (wrists at chest height); ducking makes it worse |
| Haymaker (special) | Slip or duck only; guard is broken and takes 60% damage |

Each attack in a fighter's data names its tell, windup time, damage and which defenses beat it.

### Damage

- Base damage: jab 3, cross 5, hook 7, uppercut 8
- Counter (landed during `open`): ×2
- Body shots also drain 8 opponent stamina
- Snap modifier: faster punches deal up to 20% more
- Combo modifier: each punch within 600ms of the last in a landed chain adds 10%, up to 50%

### Rounds and results

- Default 3 rounds of 3 minutes with 1-minute rests. Settings allow 1 to 6 rounds and 1- to 3-minute rounds.
- The rest screen shows the round's stats and a countdown, and regenerates health by 15 and stamina fully.
- **KO:** a knockdown with no get-up before the count of 10
- **TKO:** 3 knockdowns in one round
- **Decision:** if no KO, judges score each round 10-9 to the fighter who landed more damage (10-8 with a knockdown). The higher total wins, and a tie is a draw.

## Opponents

Each fighter is one data file in `games/boxing/data/opponents/`. All fighters are original characters.

### Data format

```ts
interface FighterData {
  id: string;
  name: string;
  nickname: string;
  style: string;              // one line shown on the select screen
  stats: {
    health: number;           // 80-200
    power: number;            // damage multiplier, 0.6-1.6
    windupMs: number;         // base tell length
    guardChance: number;      // 0-1, chance to be guarding when not attacking
    staminaMax: number;
    recoveryMs: number;       // length of the open window after a whiff
  };
  guard: "high" | "low" | "mixed";
  attacks: AttackData[];      // name, tell, windupMs, damage, beatenBy[]
  patterns: PatternData[];    // weighted attack sequences, e.g. ["jab", "jab", "hook-right"]
  roundBehavior: {            // aggression multiplier per round, gets meaner as the fight goes on
    [round: number]: number;
  };
  weaknesses: string[];       // shown as a hint after a loss, e.g. "Drops his right hand after a hook"
  taunts: string[];
  art: PuppetArtRef;          // which part images to use (placeholders at first)
}
```

### Starting roster

Ladder order. Tune numbers in playtesting.

| # | Fighter | Style | Key mechanic |
| --- | --- | --- | --- |
| 1 | Dusty Hale | Slow and sloppy | Long tells, teaches block, slip, counter |
| 2 | "Quick" Nico Reyes | Fast jabber | Rapid jab strings, teaches slipping straights |
| 3 | Big Earl Boone | Heavy brawler | Huge hooks and haymakers, teaches ducking |
| 4 | Marcus "The Wall" Pratt | Defensive shell | High guard, must go to the body |
| 5 | Vic Santana | Counter-puncher | Punishes you for throwing first, rewards patience |
| 6 | Jax "Zero" Holloway | Champion | Mixes every pattern, short tells, feints |

Feints, a tell with no attack after it, arrive at fighter 5 and up.

### Career mode

- Beat a fighter to unlock the next one.
- Each fighter has a best result saved: win type, round and time.
- An exhibition mode lets the player pick any unlocked fighter and set the rounds.
- A loss screen shows one of that fighter's weaknesses as a hint.

## Renderer (2D)

Canvas 2D, behind a `BoxingRenderer` interface the logic never imports.

### Cutout puppet fighters

- Each fighter is a skeleton of parts: pelvis, torso, head, upper arms, forearms and gloves. Each part is one image with a pivot point.
- Animations are keyframes of part rotations and offsets, stored as data and interpolated with easing.
- Needed animations: idle bob, guard, each attack's windup and strike, flinch (head and body), block, whiff stumble, open (exposed), stunned, knockdown, get up, KO, victory taunt.
- **Placeholders first:** every part starts as a simple shape (rounded rectangles and circles, with colored gloves). Real art replaces the images later with no code changes.

### Scene

- The opponent stands center screen, from the waist up, against a ring and a blurred crowd background.
- The player's gloves are drawn at the bottom of the screen, following the tracked wrists, so the player sees their own punches.
- **Depth tricks:** the opponent scales up 10 to 15% on lunging attacks; the screen shakes on heavy hits; flash red at the edges when the player is hit, white on a clean counter.
- **Tells must be readable from 8 feet away:** large, clear motions, plus a sound cue per attack type.

### HUD

- Health and stamina bars for both fighters
- Round number and timer
- Combo counter on landed chains
- Small "COUNTER!", "BLOCKED" and "SLIP" text pops

### Sound

Punch impacts (light, heavy, blocked), whiffs, crowd reaction to big moments, the bell, the referee's count and an attack cue per tell. Use free or self-made sounds.

## Stats

Saved per fight through the shared stats system:

- Opponent, result, win type, round and time
- Punches thrown and landed, by type
- Accuracy, overall and by type
- Counters landed
- Blocks, slips and ducks that beat an attack
- Damage dealt and taken
- Average punches per minute
- Total active time

The post-fight screen shows these, plus a comparison to the player's previous best against that fighter.

## Build phases

### Phase 0: Foundation

The shared core from `docs/architecture.md`, as far as boxing needs it: Vite and TypeScript setup, camera, pose tracking, BodyFrame, the debug overlay, and the pose recorder with replay.

**Done when:** the app shows the mirrored camera feed with a skeleton overlay at 30 fps or better, and a session can be recorded and replayed.

### Phase 1: Detection test screen

Shared calibration plus the boxing steps. A screen that labels every detected punch and defense in large text, with counters per type and live threshold sliders.

**Done when:** in testing with the real setup, 9 out of 10 punches of each type are labeled correctly, guard, slip and duck are reliable, and fixture-based tests pass for each punch type.

**Implementation notes:**
- Straight punches are detected in 2D, not with the extension and elbow angle in the table above. The owner's first test showed why: thrown at the camera, a jab moves the wrist only about 0.15 shoulder widths on screen and the tracker's 3D elbow reaches only 105 to 125°. It also coupled the arms in depth, so jabs fired crosses. What does change reliably is the upper arm: it swings from hanging to pointing at the camera, and its on-screen length collapses (`upperArmRatio` about 0.85 in guard, 0.3 to 0.6 in a jab). A straight fires when that ratio drops from the hand's start threshold to its peak threshold within the rise time, with the elbow raised near shoulder height.
- Sideways wrist speed toward the centerline separates straights from hooks. In the owner's sessions jabs peaked at 3 to 5 scale units/s, crosses at 7 to 9 and hooks at 14 to 31. Tight hooks point the upper arm at the camera too, so a "straight" that sweeps faster than the hand's ceiling (`jabMaxLateral`, `crossMaxLateral`, calibrated at 1.75× the player's fastest straight) is a hook. Wide hooks with a side-on upper arm are caught by the hook rule directly. A 100 ms decision window lets a cross's turn toward the camera override its hook-like start.
- Real data moved some spec numbers: hook min speed 2.5 → 6 (the idle hand drifts at 3 to 4 while the other punches), uppercut min speed 2.5 → 5 and mostly vertical (recoil and guard adjustments hit 3 to 4), glitch filter at 45 (real hooks reach 30).
- A cross carries the head sideways by about 0.4 to 0.5, close to a real slip (about 0.7). Slips can't start while an arm is out in a punch or for 500 ms after one, and the threshold is 70% of the calibrated slip.
- Both hands rising together is a guard raise, not an uppercut.
- Calibration derives the per-player thresholds: jab and cross ratios sit between the hand's guard ratio and its calibrated punches. Head height comes from where the calibration punches (aimed at the camera) landed. Slip, duck and guard zone thresholds come from the calibrated ranges. The derived values become the sliders' Reset values. See `games/boxing/calibration/derive.ts`.
- Calibration pauses 1.5 s between steps so the tail of one movement can't count toward the next.
- Guard height is calibrated too (`guardMaxDrop`): wrists may sit a little below the shoulder line if that's the player's guard.
- Slip is measured as the head's offset from the hips, so stepping sideways doesn't read as a slip.
- Recordings made on the detection screen carry the calibration in effect. Labeled ones become test fixtures through `tests/fixtures/manifest.json`.

### Phase 2: One opponent

Dusty Hale as a placeholder puppet, with health bars, the opponent state machine, two attacks with tells, block and slip, and counters. One untimed round.

**Done when:** a full fight against Dusty is playable and the read, defend, counter loop feels fair.

**Implementation notes:**
- Dusty's two attacks: a lazy jab (guard or slip beats it) and a barn-door right hook (duck beats it; guard lets 30% through). Both have long, exaggerated tells, and the attacking glove glows during the wind-up.
- Your defense counts if you held it at any moment in the 300 ms before impact (`fightConfig.defenseWindowMs`), which covers tracking lag.
- A slip or duck makes him miss and stumble into `open`; a clean block leaves him open for 60% as long. Counters in `open` deal double.
- Any detected punch can land; the type only changes damage. Punch-type detection isn't perfect, and the fight shouldn't punish that.
- Fight rules are tunable live under "Fight rules" in the debug overlay.

### Phase 3: Full fight systems

Stamina, rounds with rests, knockdowns and the get-up meter, all win types, the HUD, sound and the post-fight stats screen.

**Done when:** a 3-round fight plays start to finish with correct results and saved stats.

### Phase 4: Roster and career

All six fighters as data files, feints, career mode, exhibition mode and the fight history screen.

**Done when:** the whole ladder is playable and each fighter feels distinct.

### Phase 5: Art and polish

Real puppet art, the ring and crowd scene, effects and the full sound pass.

## Later

- 3D renderer with Three.js and rigged models, reusing input, logic and fighter data unchanged
- Two-player mode (MediaPipe supports multiple poses, though accuracy drops when players overlap)
- Workout mode: timed rounds of punch combos called out, no opponent

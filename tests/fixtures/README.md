# Test fixtures

Recorded pose sessions replayed through the real pipeline and detectors by `tests/fixtures.test.ts`.

## Adding an owner recording

1. On the Boxing Detection Test screen, pick a label in "Next recording", press `R`, perform the set, press `R` again. The file downloads as `<label>-<timestamp>.json` and includes the calibration in effect.
2. Copy it here and add an entry to `manifest.json`:

```json
{ "file": "jab-x10-2026-11-28_10-12-00.json", "expect": { "jab": 10 }, "tolerance": 1, "source": "owner" }
```

`expect` keys are punch types (`jab`, `cross`, `hook`, `uppercut`), punch type plus target (`jab:body`), or defense entries (`slip:left`, `slip:right`, `duck`). `tolerance: 1` on a set of 10 is the Phase 1 bar of 9 out of 10. Punch types not listed must also stay within tolerance, which catches false positives. A `guard-idle` recording uses `"expect": {}`.

Fixtures replay with the thresholds that the file's calibration derives under the current code, not the slider values in effect when recording, so improving detection improves every fixture.

## Synthetic fixtures

`synthetic-*.json` come from `npm run fixtures:synthetic` (geometry in `tests/helpers/syntheticPose.ts`). They prove the harness and the detectors' logic, not real-world accuracy.

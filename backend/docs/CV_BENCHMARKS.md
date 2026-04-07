# CV Benchmarks

FlowBuildr now includes a small benchmark harness for the deterministic CV
pipeline. The purpose is not to prove final accuracy; it is to make regression
tracking repeatable while wall/opening detection is still being tuned.

## Files

- Manifest: `backend/data/cv_benchmark_manifest.json`
- Runner: `backend/scripts/benchmark_cv.py`

## What It Measures

For each curated sample, the runner records:

- wall count
- door opening count
- window opening count
- opening candidate totals
- verified/rejected opening candidate counts
- solid-wall rejection counts

The manifest also carries:

- broad expected count ranges
- known failure modes to watch while tuning

## Why The Ranges Are Broad

The current benchmark is a **regression guardrail**, not a final ground-truth
dataset. The ranges are intentionally broad so the harness catches major
breakage:

- walls collapsing to near-zero
- openings exploding in count
- door recovery disappearing
- window false positives growing out of control

As the pipeline stabilizes, these ranges should be tightened and eventually
replaced with more exact acceptance data.

## Usage

Run from `backend/`:

```bash
.venv/bin/python scripts/benchmark_cv.py
```

JSON output:

```bash
.venv/bin/python scripts/benchmark_cv.py --json
```

Custom manifest:

```bash
.venv/bin/python scripts/benchmark_cv.py --manifest data/cv_benchmark_manifest.json
```

## Recommended Workflow

1. Run the benchmark before a CV change.
2. Make the wall/opening/tag change.
3. Run the benchmark again.
4. Compare:
   - door/window counts
   - opening candidate verification counts
   - solid-wall rejection counts
5. Inspect only the samples that regressed.

## Next Tightening Steps

When the current recovery pipeline stabilizes, extend this benchmark set with:

- more plan styles
- per-sample expected debug counter thresholds
- exact acceptance counts where ground truth is known
- snapshot overlays for visual diff review

# Wall Detection Fixes — Bleeding & Gap Resolution

## Problem Statement

Two failure modes were observed in the wall mask overlay (green annotation):

1. **Overextension / Bleeding** — The wall fill rectangle extends far beyond the
   actual wall boundary, covering non-wall areas. Most severe at T-junctions and
   L-junctions where perpendicular walls meet.

2. **Missing Small Segments** — Small gaps appear at wall corners and near
   door/window tag split points, where the green fill doesn't reach.

## Root Cause Analysis

### Bleeding (Images 3, 4)

**Primary cause:** `_measure_visual_thickness` used `combined_mask`
(`h_mask | v_mask`) for all walls regardless of orientation. At a T-junction,
scanning perpendicular to a horizontal wall would pick up vertical wall pixels
from `v_mask`, inflating the measured thickness by 2-4x.

```
Perpendicular scan through combined_mask at a T-junction:

  ████  ← vertical wall (from v_mask) — picked up erroneously
  ████
  ████
  ════  ← top face of horizontal wall (from h_mask) — wanted
        ← wall cavity
  ════  ← bottom face (from h_mask) — wanted

Result: visual_thickness = entire column = 50+ px (actual wall is ~20 px)
```

**Secondary causes:**
- No endpoint margin — samples taken right at wall endpoints (where junctions
  are) produced the worst contamination.
- No cap — extreme values (60+ px) were accepted without bound.

### Gaps (Images 1, 2)

**Primary cause:** Morphological opening with a 50 px kernel erodes wall
endpoints by ~25 px. Where two perpendicular walls meet at a corner, both
endpoints are eroded, leaving a ~25×25 px gap in the green overlay.

**Secondary cause:** `MIN_PIECE_LENGTH = 50` was too aggressive — when a wall
was split at a door/window tag, short stubs between the tag and a junction
were discarded.

## Changes Made

### 1. Orientation-matched mask selection (`pipeline.py`)

**Before:** `_measure_visual_thickness(walls, combined_wall_mask)`
**After:** `_measure_visual_thickness(walls, h_mask, v_mask)`

The function now uses `h_mask` when measuring H walls and `v_mask` for V walls.
Since `h_mask` is produced by a horizontal morphological opening (1×50 kernel),
vertical features (perpendicular walls) are completely removed from the mask.
This eliminates cross-contamination at the source.

### 2. Endpoint margin (`pipeline.py`)

Samples are now skipped within `max(40 px, 15% of wall length)` of each
endpoint. This avoids measuring at the exact junction point where any
remaining artifacts might exist.

### 3. Visual thickness cap (`pipeline.py`)

A double cap prevents extreme values:
- Absolute: `MAX_VISUAL_THICKNESS_PX = 45` (~13" at 200 DPI)
- Relative: `wall.thickness × 4` (morphological thickness is one face)

### 4. Junction corner fills (`annotate_plan.py`, `takeoff.py`)

After drawing wall fill rectangles, the annotation code now finds perpendicular
wall pairs whose endpoints are within `CORNER_MAX_DIST_PX = 50` of each other
and draws a small fill rectangle at the junction. This bridges the gaps caused
by morphological erosion.

### 5. Reduced MIN_PIECE_LENGTH (`pipeline.py`)

`MIN_PIECE_LENGTH` reduced from 50 → 30 px, preserving short wall stubs at
corners and between closely-spaced openings.

## Configuration Flags

All tunables are defined as module-level constants and can be adjusted without
code changes:

| Constant                   | File          | Default | Description                              |
|----------------------------|---------------|---------|------------------------------------------|
| `MAX_VISUAL_THICKNESS_PX`  | `pipeline.py` | 45      | Absolute cap on measured wall width      |
| `ENDPOINT_MARGIN_MIN_PX`   | `pipeline.py` | 40      | Min endpoint margin for thickness samples|
| `ENDPOINT_MARGIN_FRAC`     | `pipeline.py` | 0.15    | Fraction of wall length to skip at ends  |
| `MIN_PIECE_LENGTH`         | `pipeline.py` | 30      | Min wall piece length after tag splitting|
| `CORNER_MAX_DIST_PX`       | `annotate_plan.py` / `takeoff.py` | 50 | Endpoint proximity for corner fill |

## Results

### Boxhaus_Page_3.pdf

| Metric | Before | After |
|--------|--------|-------|
| Wall segments | 29 | 29 |
| Visual thickness range | 5–60+ px | 5–31 px |
| Visual thickness median | ~28 px | 20 px |
| Corner fills | 0 | 13 |
| Doors | 11 | 11 |
| Windows | 4 | 4 |

### 112125_14_ARCH-5.pdf

| Metric | Before | After |
|--------|--------|-------|
| Wall segments | 53 | 53 |
| Visual thickness range | 3–60+ px | 3–31 px |
| Visual thickness median | ~25 px | 20 px |
| Corner fills | 0 | 22 |
| Doors | 12 | 12 |
| Windows | 4 | 4 |

## Diagnostic Script

`scripts/diagnose_walls.py` produces intermediate outputs for every pipeline
stage, including:

- Binary image, H/V masks, combined mask
- Thin midline overlay and thick fill overlay
- Corner fill overlay
- Per-wall measurements log
- Perpendicular scan slice images showing h_mask vs combined_mask

Usage:
```bash
cd backend
.venv/bin/python scripts/diagnose_walls.py data/Boxhaus_Page_3.pdf
```

Output is saved to `data/<stem>_diag/`.

## Runtime Impact

No measurable change — the same number of perpendicular scans are performed;
only the mask source differs. Corner fill adds O(n²) endpoint comparisons where
n is the number of wall segments (typically <60), which is negligible.

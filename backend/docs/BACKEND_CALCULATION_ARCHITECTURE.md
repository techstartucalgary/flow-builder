# FlowBuildr Backend — Calculation Architecture

This document describes **only** the backend’s calculation and data flow: how raw file bytes become walls, openings, tags, and (optionally) lengths in feet. No connections, HTTP, CORS, or frontend.

---

## 1. Core Modules (Calculation Only)

| Role | File | Main functions / types |
|------|------|------------------------|
| **Pipeline** | `src/vision/cv/pipeline.py` | `run()` — orchestrates all steps; `_measure_visual_thickness`, `_split_walls_at_tags`, `_mark_double_doors`, `_correlate_gaps_and_tags`, `_apply_scale` |
| **Preprocessing** | `src/vision/cv/preprocessing.py` | `load_image()`, `crop_drawing_area()`, `binarise()`, `isolate_walls()` |
| **Wall detection** | `src/vision/cv/wall_detection.py` | `extract_wall_segments()`, `detect_gaps()` |
| **Tag detection** | `src/vision/cv/tag_detection.py` | `detect_tags()` — doors (Hough) + windows (hexagons) |
| **CV models** | `src/vision/cv/models.py` | `WallSegment`, `TagAnchor`, `Opening`, `CVTakeoffResult`, `DebugInfo`, `PlanMetadata` |
| **Gemini (semantic)** | `src/vision/providers/gemini_vision.py` | `analyze_image()` — image bytes + prompt → text (no geometric output) |
| **Drywall math** | `src/estimators/drywall/calculator.py`, `calculator_v2.py` | Dimension parsing, perimeter/partition/opening area, sheet count, corner bead |

---

## 2. Preprocessing steps (what each does)

Preprocessing turns raw file bytes into two binary masks: **h_mask** (horizontal lines only) and **v_mask** (vertical lines only). Everything later (walls, gaps, doors, windows) runs on these masks and the grayscale image.

| Step | Function | What it does |
|------|----------|--------------|
| **1. Load image** | `load_image(file_bytes, mime_type, dpi=200, page_number=0)` | **PDF**: Renders one page with PyMuPDF at `dpi` (zoom = dpi/72), converts RGB→BGR. **Image**: Decodes JPEG/PNG/WebP/GIF with OpenCV. Output: BGR numpy array. |
| **2. Crop** | `crop_drawing_area(bgr, left_pct=0.02, top_pct=0.05, right_pct=0.72, bottom_pct=0.95)` | Slices the image to the drawing area: keeps 2% from left, 5% from top, 72% from right, 95% from bottom. Removes title block, legend column, and margins (tuned for ARCH-D style sheets). |
| **3. Grayscale** | `cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)` | Single channel for binarisation and tag detection. |
| **4. Binarise** | `binarise(gray)` | (1) Gaussian blur (3×3) to reduce noise. (2) Adaptive threshold: block size 25, C=12, **THRESH_BINARY_INV** so **lines → 255 (white), background → 0 (black)**. Result: clean binary image where every line (walls, dimensions, symbols) is white. |
| **5. Isolate walls** | `isolate_walls(binary, h_kernel_len=50, v_kernel_len=50)` | **Morphological opening** with two rectangular kernels: **horizontal 50×1** and **vertical 1×50**. Opening keeps only structures that “fit” the kernel: the 50×1 kernel keeps **horizontal** lines and removes vertical ones; the 1×50 kernel keeps **vertical** lines and removes horizontal ones. Output: **h_mask** (horizontal wall lines only) and **v_mask** (vertical wall lines only). |

After preprocessing you have: **bgr** (cropped color image), **gray** (cropped grayscale), **binary** (all lines white), **h_mask**, **v_mask**. The pipeline then uses **h_mask** and **v_mask** for wall geometry; **gray** and **binary** are also used for door/window tag detection.

---

## 3. What happens after preprocessing

The pipeline (`pipeline.run()`) does the following in order **after** preprocessing:

| Step | What it does |
|------|--------------|
| **2. Vectorise walls** | `extract_wall_segments(h_mask, v_mask)` finds contours on each mask, filters by thickness (≥5 px) and fill ratio (≥0.50), scans the midline of each contour and **splits at pixel gaps** (gaps &lt; 25 px are bridged so small breaks don’t split a wall). Segments are **grouped by cross-axis position** (same wall line) and **merged** if the gap between them is small (≤60 px) and the gap region has enough wall pixels (fill ≥ 0.40). Result: list of **WallSegment** (id, H/V, start, end, thickness, length_px). `detect_gaps(walls, combined_wall_mask)` walks along each wall and finds runs of **background** (0) pixels between 25 and 400 px long → **Gap** objects (opening candidates). |
| **3. Detect tags** | `detect_tags(gray, binary, combined_wall_mask, walls)`: **Doors**: subtract dilated wall mask from binary, run **Hough Circle Transform** (radius 12–30 px), keep only circles within 150 px of a wall. **Windows**: find contours on the original binary, keep shapes with area 1200–2500 px², aspect 1.05–1.60, 6–7 vertices (flat-top hexagons), within 500 px of a wall. If a circle and hexagon overlap, the circle is dropped. Result: list of **TagAnchor** (door/window, center, radius). |
| **4b. Split walls at tags** | For each wall, find tags within 80 px (perpendicular distance). At each tag, **split** the wall and insert a gap (half-width 60 px each side); drop any resulting piece shorter than 30 px. Re-number segment ids (H-01, H-02, …, V-01, …). So walls no longer cross door/window openings. |
| **4c. Measure visual thickness** | For each wall, take **perpendicular** slices on the **orientation-matched** mask (h_mask for H walls, v_mask for V walls). Sample at several points along the wall, **skipping** the ends (margin 40 px or 15% of length). For each slice, measure the span of wall pixels; take the **median** and cap at 45 px and at 4× the morphological thickness. Store as **visual_thickness** (used for drawing the wall width on the annotated image). |
| **5. Double-door pairs** | Among door tags, any two within 50 px are marked as a **double-door pair** (is_double, pair_id). |
| **6. Correlate gaps with tags** | Each **Gap** is assigned the **nearest** tag within 200 px (gap center to tag center). That yields **Opening** objects (bbox, wall_id, tag_ids, door/window). Unmatched gaps still become openings without a tag. |
| **7. Scale (optional)** | If **scale_px_per_ft** was provided: for each wall, `length_ft = length_px / scale_px_per_ft`; for each opening, `width_ft = bbox_w / scale_px_per_ft`, `height_ft = bbox_h / scale_px_per_ft`. If not provided, lengths stay in pixels only. |
| **8. Build result** | Assemble **CVTakeoffResult**: lists of walls, openings, tags, plus metadata (image size, scale if any) and debug counts (horizontal/vertical walls, door/window tags, openings, gaps). |

So after preprocessing, the pipeline: **extracts wall segments and gaps** → **detects door and window symbols** → **splits walls at those symbols** → **measures wall thickness** → **pairs double doors** → **links gaps to tags** → **optionally converts pixels to feet** → **returns the structured result**.

---

## 4. End-to-End Calculation Flow

Input: **file_bytes** (PDF or image), **mime_type**, and optional **page_number**, **dpi**, **crop** fractions, **scale_px_per_ft**.

```
file_bytes, mime_type, page_number, dpi, crop_*, scale_px_per_ft (optional)
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. PREPROCESSING (preprocessing.py)                                      │
│    load_image()     → BGR image (PDF: one page at dpi; zoom = dpi/72)     │
│    crop_drawing_area() → crop to [left_pct, top_pct, right_pct, bottom]  │
│    gray = BGR→gray                                                       │
│    binarise(gray)   → binary (lines=255, background=0); adaptive block 25, C=12 │
│    isolate_walls()  → h_mask, v_mask (morph open: 50×1 and 1×50)        │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. WALL SEGMENTS (wall_detection.py)                                     │
│    extract_wall_segments(h_mask, v_mask)                                  │
│      → contours on each mask → thickness/fill filter → midline scan     │
│        (split at pixel gaps ≥ MIN_OPENING_GAP_PX) → group-then-merge      │
│    Result: list of WallSegment (id, orientation H/V, start, end,        │
│             thickness, length_px)                                        │
│    detect_gaps(walls, combined_mask) → list of Gap (wall_id, center,      │
│             width_px, bbox) along each wall (runs of background pixels   │
│             between MIN_GAP_SIZE_PX and MAX_GAP_SIZE_PX)                  │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. TAGS (tag_detection.py)                                                │
│    detect_tags(gray, binary, wall_mask, walls)                            │
│      → doors: Hough circles on (binary − dilated walls); filter by       │
│        distance to wall ≤ MAX_DIST_TO_WALL_DOOR_PX                       │
│      → windows: contours on binary → area/aspect/vertex count filter →   │
│        hexagons; filter by distance ≤ MAX_DIST_TO_WALL_WINDOW_PX         │
│      → dedupe circle vs hexagon overlap                                  │
│    Result: list of TagAnchor (id, tag_class door/window, center, radius) │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. PIPELINE POST-PROCESS (pipeline.py)                                    │
│    _split_walls_at_tags(walls, tags)  → split wall at each tag within     │
│      TAG_WALL_SPLIT_DIST_PX, insert gap half-width TAG_SPLIT_HALF_WIDTH; │
│      drop pieces shorter than MIN_PIECE_LENGTH                            │
│    _measure_visual_thickness(walls, h_mask, v_mask)  → per wall:         │
│      sample perpendicular to wall on orientation-matched mask (h for H,  │
│      v for V); median width, cap at MAX_VISUAL_THICKNESS_PX and           │
│      4× morphological thickness; skip ENDPOINT_MARGIN near ends           │
│    _mark_double_doors(tags)  → pairs within DOUBLE_DOOR_RADIUS_PX        │
│    _correlate_gaps_and_tags(gaps, tags, walls)  → each gap assigned       │
│      nearest tag within GAP_TAG_MATCH_RADIUS_PX → Opening (bbox, tag_ids)│
│    If scale_px_per_ft provided:                                           │
│      _apply_scale(walls, openings, scale_px_per_ft)                      │
│        length_ft = length_px / scale_px_per_ft                            │
│        width_ft, height_ft from opening bbox / scale_px_per_ft           │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
CVTakeoffResult(walls, openings, tags, metadata, debug)
```

**Gemini path** (separate from geometry): same **file_bytes** + **prompt** (e.g. TAKEOFF_PROMPT) → `analyze_image()` → **text**. No lengths or coordinates; used for semantic extraction (dimensions, schedules, room names). Scale and dimension parsing for **drywall** live in `estimators/drywall` (e.g. `parse_dimension("12'-4 3/4\"")` → feet); they are not part of the CV pipeline.

---

## 5. Formulas and Unit Conversions

- **Pixel length of a segment**  
  From endpoints:  
  `length_px = |end.x - start.x|` (H) or `|end.y - start.y|` (V).

- **Visual thickness (px)**  
  Perpendicular scan on orientation-matched mask (h_mask for H, v_mask for V); median of “first to last” wall pixel width over samples; then:
  - `visual_thickness = min(median_width, MAX_VISUAL_THICKNESS_PX, 4 × morphological_thickness)`.

- **Pixels → feet (only when scale is provided)**  
  Backend does **not** infer scale from the drawing. If caller passes `scale_px_per_ft`:
  - `length_ft = length_px / scale_px_per_ft` (walls),
  - `width_ft = bbox_w / scale_px_per_ft`, `height_ft = bbox_h / scale_px_per_ft` (openings).  
  (`pipeline.py` `_apply_scale`.)

- **DPI**  
  PDF rendered at `dpi` (default 200). Zoom = `dpi / 72`. So 1 inch = `dpi` pixels; no built-in “pixels per foot” from scale text.

- **Drywall (estimators)**  
  In `estimators/drywall`: dimension strings like `"12'-4 3/4\""` parsed to decimal feet; area = length_ft × height_ft; openings subtracted; waste factor applied; sheet count from area and sheet size (e.g. 4×12). No geometric CV in those modules.

---

## 6. Constants (All from Code)

### Preprocessing

| Constant | Value | File |
|----------|--------|------|
| Default DPI | 200 | `preprocessing.py` |
| PDF zoom | dpi/72.0 | `preprocessing.py` |
| Crop left / top / right / bottom | 0.02, 0.05, 0.72, 0.95 | `preprocessing.py` |
| ADAPTIVE_BLOCK_SIZE | 25 | `preprocessing.py` |
| ADAPTIVE_C | 12 | `preprocessing.py` |
| Gaussian blur | (3, 3) | `preprocessing.py` |
| DEFAULT_H_KERNEL_LEN, DEFAULT_V_KERNEL_LEN | 50 | `preprocessing.py` |
| Morph kernels | (50, 1) and (1, 50) | `preprocessing.py` — `getStructuringElement(MORPH_RECT, …)` |

### Wall detection

| Constant | Value | File |
|----------|--------|------|
| MIN_WALL_THICKNESS_PX | 5 | `wall_detection.py` |
| MIN_WALL_LENGTH_PX | 70 | `wall_detection.py` |
| MIN_FILL_RATIO | 0.50 | `wall_detection.py` |
| MIN_OPENING_GAP_PX | 25 | `wall_detection.py` |
| MERGE_CROSS_AXIS_TOL | 30 | `wall_detection.py` |
| MERGE_ALONG_AXIS_GAP | 60 | `wall_detection.py` |
| MERGE_MIN_FILL_IN_GAP | 0.40 | `wall_detection.py` |
| MIN_GAP_SIZE_PX | 25 | `wall_detection.py` |
| MAX_GAP_SIZE_PX | 400 | `wall_detection.py` |

### Pipeline (splitting, thickness, correlation)

| Constant | Value | File |
|----------|--------|------|
| DOUBLE_DOOR_RADIUS_PX | 50 | `pipeline.py` |
| GAP_TAG_MATCH_RADIUS_PX | 200 | `pipeline.py` |
| TAG_WALL_SPLIT_DIST_PX | 80 | `pipeline.py` |
| TAG_SPLIT_HALF_WIDTH_PX | 60 | `pipeline.py` |
| VISUAL_THICKNESS_SEARCH_PX | 30 | `pipeline.py` |
| MAX_VISUAL_THICKNESS_PX | 45 | `pipeline.py` |
| ENDPOINT_MARGIN_MIN_PX | 40 | `pipeline.py` |
| ENDPOINT_MARGIN_FRAC | 0.15 | `pipeline.py` |
| MIN_PIECE_LENGTH | 30 | `pipeline.py` |
| CORNER_MAX_DIST_PX | 70 | `takeoff.py`, `annotate_plan.py`, `diagnose_walls.py` |

### Tag detection — doors (Hough)

| Constant | Value | File |
|----------|--------|------|
| HOUGH_DP | 1.2 | `tag_detection.py` |
| HOUGH_MIN_DIST | 30 | `tag_detection.py` |
| HOUGH_PARAM1, HOUGH_PARAM2 | 60, 42 | `tag_detection.py` |
| MIN_CIRCLE_RADIUS, MAX_CIRCLE_RADIUS | 10, 35 | `tag_detection.py` |
| MAX_DIST_TO_WALL_DOOR_PX | 220 | `tag_detection.py` |

### Tag detection — windows (hexagon)

| Constant | Value | File |
|----------|--------|------|
| MIN_HEX_AREA, MAX_HEX_AREA | 1000, 2800 px² | `tag_detection.py` |
| HEX_ASPECT_LO, HEX_ASPECT_HI | 1.05, 1.60 | `tag_detection.py` |
| HEX_DEDUP_DIST | 20 | `tag_detection.py` |
| MAX_DIST_TO_WALL_WINDOW_PX | 500 | `tag_detection.py` |

### Tag detection — wall subtraction

| Operation | Value | File |
|-----------|--------|------|
| Dilate kernel | (3, 3), 2 iterations | `tag_detection.py` |
| Residual open kernel | (3, 3) ellipse | `tag_detection.py` |

---

## 7. Data Structures (Calculation-Relevant)

- **WallSegment**: `id`, `orientation` (H/V), `start`, `end` (px), `thickness` (morph, px), `visual_thickness` (px), `length_px`, optional `length_ft` if scale applied.
- **TagAnchor**: `id`, `tag_class` (door/window), `center` (px), `radius` (px), `is_double`, `pair_id`.
- **Opening**: `id`, `tag_class`, `bbox` (x, y, w, h px), `center`, `wall_id`, `tag_ids`, optional `width_ft`, `height_ft` if scale applied.
- **CVTakeoffResult**: `walls`, `openings`, `tags`, `metadata` (sheet, floor_level, image dimensions, scale_px_per_ft), `debug` (counts).

---

## 8. Summary

- **Input**: Raw file bytes + optional page, DPI, crop, and **scale_px_per_ft**.
- **Preprocessing**: Load one page at DPI, crop, binarise (adaptive 25×25, C=12), separate H/V lines with 50×1 and 1×50 morphological opening.
- **Walls**: Contours → thickness/length/fill filters → midline scan (split at gaps ≥25 px) → group-then-merge (cross-axis 30 px, along-axis gap 60 px, fill-in-gap 0.40).
- **Gaps**: Runs of background along wall midline, length 25–400 px → opening candidates.
- **Doors**: Hough circles (radius 12–30 px) on wall-subtracted image; keep only within 150 px of a wall.
- **Windows**: Contours with area 1200–2500 px², aspect 1.05–1.60, 6–7 vertices; keep only within 500 px of a wall.
- **Post-process**: Split walls at tags (80 px, half-gap 60 px; min piece 30 px); measure visual thickness (orientation-matched mask, median, cap 45 px and 4× morph); pair double doors (50 px); correlate gaps to tags (200 px); optional scale conversion **length_ft = length_px / scale_px_per_ft**.
- **Output**: List of wall segments, openings (with bbox and tag ids), and tag anchors; all coordinates in pixels unless **scale_px_per_ft** was provided, in which case wall length and opening width/height are also in feet.

No connections, HTTP, or frontend are part of this architecture; it is purely the backend calculation pipeline and its constants.

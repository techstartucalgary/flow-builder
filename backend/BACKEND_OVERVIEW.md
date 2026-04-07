# FlowBuildr Backend — Complete Overview

## The Gist

**FlowBuildr** is an automated construction takeoff and material estimation platform. The backend transforms 2D architectural floor plans (PDFs or images) into **precise, actionable material lists** for drywall, framing, and finishing — without relying on broad area multipliers.

### What Makes It Different

- **Entity-level precision**: Every wall segment is treated as an individual entity (X-direction, Y-direction, end-caps, soffits)
- **Hybrid approach**: Combines **computer vision (OpenCV)** for deterministic door/window/wall counts with **AI vision (Gemini)** for semantic extraction (dimensions, schedules, legends)
- **Schedule-aware**: Cross-references window/door tags with schedules for automated deductions
- **Auditable**: Traceable calculations with explicit inputs; avoids opaque heuristics

---

## Architecture Overview

```
backend/
├── src/
│   ├── main.py                 # FastAPI entrypoint
│   ├── api/routes/             # HTTP endpoints
│   ├── core/config/            # Settings (Gemini, Vertex)
│   ├── vision/                 # AI + CV pipelines
│   │   ├── providers/          # Gemini client (Vertex or API key)
│   │   ├── prompts/            # Vision prompts (extraction, partitions)
│   │   ├── schemas/            # Request/response models
│   │   └── cv/                 # Deterministic OpenCV pipeline
│   └── estimators/             # Drywall calculators
├── scripts/                    # CLI tools (annotate, diagnose)
├── data/                       # Sample plans & diagnostic outputs
└── docs/                       # Setup & domain docs
```

---

## How Everything Works

### 1. API Layer (`src/api/routes/`)

| Route | Purpose |
|-------|---------|
| **`/api/vision/analyze`** | Generic image analysis via Gemini (custom prompt) |
| **`/api/floorplan/extract`** | Legend-driven extraction (doors, windows, dimensions) using `UNIVERSAL_EXTRACTION_PROMPT` |
| **`/api/floorplan/legend-check`** | Quick legend-only extraction |
| **`/api/partitions/extract`** | Interior partitions with V/H orientation + drywall area |
| **`/api/partitions/extract-simple`** | Same but returns raw analysis + totals only |
| **`/api/takeoff/analyze`** | Full takeoff: Gemini + CV pipeline + annotated image |
| **`/api/cv-takeoff/analyze`** | Pure CV pipeline (file upload) — walls, doors, windows as JSON |
| **`/api/cv-takeoff/analyze-url`** | Same, but accepts a signed URL |

### 2. Vision Provider (`src/vision/providers/`)

- **`client.py`**: Factory for `genai.Client` — uses **Vertex AI** if `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_CLOUD_PROJECT` are set, otherwise `GEMINI_API_KEY`
- **`gemini_vision.py`**: `analyze_image()` and `analyze_with_gemini()` — send image/PDF + prompt to Gemini 3 Pro (or configured model)

### 3. Computer Vision Pipeline (`src/vision/cv/`)

Deterministic, reproducible extraction of walls, doors, and windows from floor plans.

#### Preprocessing (`preprocessing.py`)

1. **`load_image()`**: Renders PDF (PyMuPDF) or decodes image (OpenCV) at configurable DPI (default 200)
2. **`crop_drawing_area()`**: Crops title block/legend (default: 2% left, 5% top, 72% right, 95% bottom)
3. **`binarise()`**: Adaptive Gaussian threshold → black lines on white background
4. **`isolate_walls()`**: Morphological opening with horizontal (1×50) and vertical (50×1) kernels → separate H and V wall masks

#### Wall Detection (`wall_detection.py`)

1. **`extract_wall_segments(h_mask, v_mask)`**:
   - Find contours on each mask
   - Filter by thickness (≥5 px) and fill ratio (≥0.50)
   - **Midline scan**: Split contours at pixel gaps (openings) so doors/windows naturally break walls
   - **Group-then-merge**: Cluster by cross-axis proximity, merge sequential segments within clusters (avoids bridging across doors)
2. **`detect_gaps()`**: Walk along each wall, find runs of background pixels (25–400 px) → opening candidates

#### Tag Detection (`tag_detection.py`)

- **Doors**: Hough Circle Transform on **residual** (binary minus dilated wall mask) → circles ≈ 12–30 px radius, filtered by wall proximity
- **Windows**: Flat-top hexagons via contour approximation on original binary → area 1200–2500 px², 6–7 vertices
- **Deduplication**: If circle overlaps hexagon, keep window only

#### Pipeline Orchestrator (`pipeline.py`)

1. Load & preprocess
2. Extract wall segments from H/V masks
3. Detect gaps (opening candidates)
4. Detect tags (doors/windows)
5. **Split walls at tags** — insert gaps so walls don’t cross openings
6. **Measure visual thickness** — perpendicular scans on orientation-matched mask (h_mask for H, v_mask for V) to avoid junction bleed
7. **Double-door pairing** — group door tags within 50 px
8. **Correlate gaps with tags** → `Opening` objects
9. Optional: apply `scale_px_per_ft` for feet conversion

**Output**: `CVTakeoffResult` — `walls`, `openings`, `tags`, `metadata`, `debug`

#### Wall Detection Fixes (from `WALL_DETECTION_FIXES.md`)

- **Bleeding fix**: Use orientation-matched masks for thickness measurement (h_mask for H walls, v_mask for V)
- **Gap fix**: Junction corner fills — draw small rectangles where perpendicular walls meet (within 50 px)
- **Endpoint margin**: Skip thickness samples near wall endpoints (40 px or 15% of length)

### 4. Vision Prompts (`src/vision/prompts/`)

| Prompt | Use Case |
|--------|----------|
| **`UNIVERSAL_EXTRACTION_PROMPT`** | Legend-first extraction: learn symbol definitions, count doors/windows, extract schedules, room labels, dimensions |
| **`COMBINED_PARTITION_AND_DIMENSION_PROMPT`** | Interior partitions only: thick vs thin lines, V/H orientation, dimension strings, double-sided drywall area |

### 5. Drywall Estimators (`src/estimators/drywall/`)

**`calculator.py`** (basic):

- Perimeter walls, interior partitions, ceiling, openings
- Dimension parser: `"42'-1 1/2""` → 42.125 ft
- Net area, waste factor (15%), sheet count (4×12 ft)

**`calculator_v2.py`** (enhanced):

- Same plus: end caps, soffit faces
- Validation: warns when interior partitions aren’t marked double-sided
- Corner bead linear feet for end caps and soffits

Both use FLOWBUILDR defaults: `GLOBAL_CEILING_HEIGHT=9.0`, `DEFAULT_WASTE_FACTOR=0.15`, `DRY_WALL_SHEET_SIZE=48×144 sq in`.

### 6. Scripts (`scripts/`)

| Script | Purpose |
|-------|---------|
| **`annotate_plan.py`** | Run CV pipeline on a PDF/image, draw walls/doors/windows/legend, save annotated PNG |
| **`diagnose_walls.py`** | Stage-by-stage diagnostics: saves binary, H/V masks, combined mask, wall overlays, corner fills, perpendicular slices, `wall_measurements.txt` |

---

## Data Flow: Full Takeoff

```
User → POST /api/takeoff/analyze { file_url }
  │
  ├─► Download file from signed URL
  │
  ├─► Gemini: TAKEOFF_PROMPT → full text extraction
  │
  ├─► CV pipeline:
  │     load_image → crop → binarise → isolate_walls
  │     → extract_wall_segments → detect_gaps → detect_tags
  │     → split_walls_at_tags → _measure_visual_thickness
  │     → _mark_double_doors → _correlate_gaps_and_tags
  │
  ├─► Annotate image: walls (green), doors (red), windows (blue), legend
  │
  └─► Return: analysis text + cv_doors, cv_windows, cv_walls + annotated_image (base64)
```

---

## Configuration

| Env Var | Purpose |
|---------|---------|
| `GEMINI_API_KEY` | Direct Gemini API (alternative to Vertex) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON (Vertex AI) |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | e.g. `us-central1` |
| `APP_ENV` | `development` / `production` |
| `DEBUG` | `true` / `false` |

---

## MVP Roadmap Alignment

| Milestone | Backend Component |
|-----------|-------------------|
| **1. Vision Detection Engine** | CV pipeline (walls, tags), Gemini prompts (legend, symbols) |
| **2. Scale & Schedule Parser** | `universal_extraction` prompt, dimension parsing in estimators |
| **3. Entity Logic Engine** | Wall segments (H/V), openings, drywall calculators (perimeter, partitions, end caps, soffits) |
| **4. Takeoff Review Dashboard** | CV output (`CVTakeoffResult`) — frontend can render walls/openings/tags as SVG/Canvas |
| **5. Material Reporting** | `DrywallCalculator`, sheet counts, waste factor, corner bead LF |

---

## Key Dependencies

- **FastAPI** — HTTP API
- **google-genai** — Gemini (Vertex AI or API key)
- **opencv-python-headless** — CV pipeline
- **pymupdf (fitz)** — PDF rendering
- **numpy**, **pydantic** — data handling

---

## Quick Reference: Run Commands

```bash
# Backend
uvicorn src.main:app --reload

# Annotate a plan
.venv/bin/python scripts/annotate_plan.py data/Boxhaus_Page_3.pdf

# Diagnose wall detection
.venv/bin/python scripts/diagnose_walls.py data/Boxhaus_Page_3.pdf
```

---

## Summary

The FlowBuildr backend is a **hybrid AI + CV system** that:

1. **Extracts** walls, doors, windows, dimensions, and schedules from floor plans
2. **Combines** Gemini’s semantic understanding with OpenCV’s deterministic geometry
3. **Outputs** structured data (walls, openings, tags) for review and material estimation
4. **Calculates** drywall area, sheet counts, and accessories (corner bead) using construction defaults

It is designed to produce **auditable, precise takeoffs** that bridge complex blueprints to final ordering lists.

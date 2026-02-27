# FlowBuildr Backend — Presentation-Ready Explanation

## Relevant Files (Source of Truth)

| Role | File path |
|------|-----------|
| **App entry** | `backend/src/main.py` |
| **Analyze endpoint** | `backend/src/api/routes/takeoff.py` — `POST /api/takeoff/analyze` |
| **CV-only analyze** | `backend/src/api/routes/cv_takeoff.py` — `POST /api/cv-takeoff/analyze`, `POST /api/cv-takeoff/analyze-url` |
| **Vision routes** | `backend/src/api/routes/vision.py`, `floorplan.py`, `partitions.py` |
| **Config** | `backend/src/core/config/__init__.py` — `get_settings()`, `Settings` |
| **Gemini client** | `backend/src/vision/providers/client.py` — `get_genai_client()` |
| **Gemini vision** | `backend/src/vision/providers/gemini_vision.py` — `analyze_image()`, `DEFAULT_MODEL` |
| **CV pipeline** | `backend/src/vision/cv/pipeline.py` — `run()` |
| **Preprocessing** | `backend/src/vision/cv/preprocessing.py` — `load_image()`, `crop_drawing_area()`, `binarise()`, `isolate_walls()` |
| **Wall detection** | `backend/src/vision/cv/wall_detection.py` — `extract_wall_segments()`, `detect_gaps()` |
| **Tag detection** | `backend/src/vision/cv/tag_detection.py` — `detect_tags()` |
| **CV models** | `backend/src/vision/cv/models.py` — `TakeoffResult`, `WallSegment`, `TagAnchor`, `Opening`, etc. |
| **Env/config** | `backend/.env.example` (no file-size or timeout values; download timeout is in code) |

---

# A) Presentation Script (60–90 seconds)

**“What happens when the user clicks Analyze?”**

When the user clicks Analyze, the frontend sends a **POST** to **`/api/takeoff/analyze`** with a **signed URL** to the floor plan PDF or image and the **page number**. There is no auth in the request; the signed URL is the authorization to fetch the file.

The backend does four things in order:

1. **Download** — It fetches the file from that URL with a **60-second timeout**, in memory. No file-size limit is enforced in code; the only limit is what the download and later steps can hold in RAM.

2. **Gemini** — It sends the **raw file bytes** and a **fixed takeoff prompt** to **Gemini 3 Pro** (Vertex AI or API key). The model returns **plain text** — walls, dimensions, scale, legends, doors/windows, rooms, and special features. No max tokens or temperature are set in code; the SDK uses its defaults.

3. **CV pipeline** — In parallel conceptually, it runs the **deterministic OpenCV pipeline** on the same file: render PDF at **200 DPI** (or decode the image), **crop** to the drawing area (2% left, 5% top, 72% right, 95% bottom), **binarise** with adaptive threshold, **split** walls into horizontal and vertical using **50×1 and 1×50 pixel** morphological kernels, **extract** wall segments and **gaps**, **detect** door circles and window hexagons, **split** walls at door/window tags, **measure** visual thickness with orientation-matched masks, and **draw** an annotated image. All of that produces **wall count**, **door count**, **window count**, and a **base64 PNG** overlay.

4. **Response** — It returns a **TakeoffResult**: the Gemini **analysis** text, **cv_doors**, **cv_windows**, **cv_walls**, and the **annotated_image** base64. If the CV pipeline throws, the route **catches** the exception, logs it, and still returns the Gemini result with zero CV counts and no image; only Gemini failures cause a **502**.

So in one sentence: **the backend downloads the plan from the signed URL, gets a textual takeoff from Gemini, runs a deterministic CV pipeline for counts and an annotated image, and returns both; CV failure is non-fatal.**

---

# B) Technical Deep Explanation

## 1. Request Arrives

- **Route**: `POST /api/takeoff/analyze`  
- **Handler**: `analyze_takeoff` in `src/api/routes/takeoff.py`  
- **Auth**: None. Trust is via the signed URL.  
- **Request body** (Pydantic `TakeoffRequest`):
  - `file_url: str` — signed URL to PDF or image (required)
  - `file_mime: str` — default `"application/pdf"`
  - `page_number: int` — 1-indexed page; default `1`

## 2. CORS Handling (OPTIONS vs POST)

- **Preflight**: Browsers send **OPTIONS** when the request is “non-simple” (e.g. `Content-Type: application/json`, custom headers, or `credentials: true`). The browser expects `Access-Control-Allow-*` and method/headers to match.
- **FastAPI CORSMiddleware** (in `main.py`): On **OPTIONS**, it responds with **200** and the configured `allow_origins`, `allow_methods`, `allow_headers`. No `allow_headers="*"` is used; the app uses **explicit** `allow_headers=["Content-Type", "Authorization", "Accept", "Origin"]` so that preflight works with `allow_credentials=True`.
- **Actual POST**: If the request origin/method/headers are allowed, the POST proceeds; otherwise the browser blocks it before the backend sees it. The app does not return 400 for CORS; misconfiguration shows as browser blocking.

**App CORS config** (from `main.py`):

- `allow_origins`: `["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"]`
- `allow_credentials`: `True`
- `allow_methods`: `["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]`
- `allow_headers`: `["Content-Type", "Authorization", "Accept", "Origin"]`
- `expose_headers`: `["*"]`

## 3. Input Validation

- **Takeoff** route: No explicit URL format validation; invalid URL surfaces at download. **file_mime** is passed through to Gemini and to the CV pipeline; no allowlist in takeoff.py (cv_takeoff and vision use allowlists).
- **Empty body**: Not applicable (JSON body). Empty file is checked **after** download (`if not file_bytes` → 400).

## 4. Download Stage

- **Where**: `httpx.AsyncClient(timeout=60.0).get(req.file_url)` in `takeoff.py`. Response body read into memory (`resp.content`).
- **Streaming**: No; full response in memory.
- **Timeout**: **60.0** seconds (single timeout for the whole request).
- **Max size**: Not set in code; effectively limited by memory and any limits in httpx/defaults.
- **Hashing / temp files**: None. Bytes are kept in memory and reused for Gemini and CV.

## 5. Preprocessing (CV path)

- **PDF → image**: `load_image(file_bytes, mime_type, dpi=200, page_number=cv_page)` in `preprocessing.py`. For PDF: PyMuPDF `fitz` renders one page; `zoom = dpi / 72.0`, matrix `(zoom, zoom)`; RGB then converted to BGR for OpenCV. **Page**: request `page_number` is 1-indexed; converted to 0-indexed `cv_page = max(0, req.page_number - 1)`.
- **Crop**: `crop_drawing_area(bgr)` in takeoff (defaults) or `crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)` in pipeline. Defaults: **left 0.02, top 0.05, right 0.72, bottom 0.95** (fraction of width/height). Intended for ARCH-D style layout (drawing ~left 70%, title block right).
- **Resolution**: PDF rendered at **200 DPI** unless overridden (e.g. in cv_takeoff `dpi` 72–600). No resize/normalization to fixed dimensions; image size is determined by page size and DPI.
- **Base64 for Gemini**: Not used. Gemini is called with **raw bytes** via `types.Part.from_bytes(data=image_bytes, mime_type=mime_type)` in `gemini_vision.py`.

## 6. Model Stage

### Gemini (takeoff)

- **Model**: `DEFAULT_MODEL` = **`"gemini-3-pro-preview"`** (`gemini_vision.py`).
- **Parameters**: Only `model` and `contents` are passed to `client.models.generate_content()`. **No** `max_output_tokens`, **no** `temperature`, **no** `top_p`, **no** safety overrides in code; SDK defaults apply.
- **Payload**: One `Content` with role `"user"`, parts = `[Part.from_text(prompt), Part.from_bytes(data=image_bytes, mime_type=mime_type)]`. Prompt = **TAKEOFF_PROMPT** (long construction takeoff instruction in `takeoff.py`).

### CV “model”

- **Not a neural network.** Deterministic OpenCV: Hough circles for doors, contour-based hexagon detection for windows, morphological opening for walls. No confidence/IoU/NMS; only geometric and tuning constants (see Calculations & thresholds).

## 7. Post-processing (CV)

- **Morphology**: Already in “preprocessing”: **opening** with rectangular kernels `(h_kernel_len, 1)` and `(1, v_kernel_len)` (default 50). No extra erode/dilate/close in pipeline.
- **Contour/line**: Wall segments from contours on H/V masks; **midline scan** splits at pixel gaps; **group-then-merge** by cross-axis proximity; **fill-ratio** and **min length/thickness** filters. Gaps along walls detected as runs of background pixels; correlated to tags within **GAP_TAG_MATCH_RADIUS_PX**.
- **Geometry**: Wall `length_px` from segment endpoints; **visual_thickness** from perpendicular scans on orientation-matched mask, median width, capped by **MAX_VISUAL_THICKNESS_PX** and **4× morphological thickness**. **Scale**: only if `scale_px_per_ft` is provided (e.g. by cv-takeoff client): `length_ft = length_px / scale_px_per_ft`; opening `width_ft`/`height_ft` from bbox and same scale. **No** automatic scale detection in code; without `scale_px_per_ft`, outputs stay in **pixels** at the render DPI (e.g. 200).

## 8. Response Construction

- **Schema**: `TakeoffResult` (Pydantic): `status`, `model`, `analysis` (str), `error` (optional), `cv_doors`, `cv_windows`, `cv_walls`, `annotated_image` (optional base64 PNG string).
- **Errors**: Exceptions mapped to HTTP (see Failure modes). No correlation ID or timing fields in the response. On CV exception, handler catches, logs traceback, and returns success with CV counts 0 and `annotated_image=None`.

## 9. Logging / Observability

- **Logged**: `[takeoff/cv] file size=… bytes, mime=…, page=…`; `[takeoff/cv] walls=… doors=… windows=…`; `[takeoff/cv] debug: …`; `[takeoff/cv] annotated image size=… chars (base64)`; on CV error `[takeoff] CV pipeline error (non-fatal): …` + traceback. Preprocessing logs `[preprocessing] PDF has N pages, rendering page K`.
- **No**: Correlation IDs, request IDs, or structured timing metrics in the code.

---

# C) Calculations & Thresholds

All values below are taken from the repo; “reasoned estimates” only where noted.

## Download & timeouts

| Name | Value | Where |
|------|--------|--------|
| Download timeout | 60.0 s | `takeoff.py`: `httpx.AsyncClient(timeout=60.0)`; same in `cv_takeoff.py` for analyze-url |

## Preprocessing (PDF / image)

| Name | Value | Where |
|------|--------|--------|
| Default DPI | 200 | `preprocessing.py`: `load_image(..., dpi=200)`; `pipeline.run(..., dpi=200)`; takeoff uses 200 for CV |
| PDF zoom | dpi/72.0 | `preprocessing.py`: `zoom = dpi / 72.0` |
| Crop left | 0.02 | `preprocessing.py`: `crop_drawing_area(..., left_pct=0.02, ...)` |
| Crop top | 0.05 | `preprocessing.py`: `top_pct=0.05` |
| Crop right | 0.72 | `preprocessing.py`: `right_pct=0.72` |
| Crop bottom | 0.95 | `preprocessing.py`: `bottom_pct=0.95` |
| Adaptive block size | 25 | `preprocessing.py`: `ADAPTIVE_BLOCK_SIZE = 25` (must be odd) |
| Adaptive C | 12 | `preprocessing.py`: `ADAPTIVE_C = 12` |
| Gaussian blur | (3, 3) | `preprocessing.py`: `cv2.GaussianBlur(gray, (3, 3), 0)` |

## Morphological kernels

| Name | Value | Where |
|------|--------|--------|
| Default H kernel | 50×1 px | `preprocessing.py`: `DEFAULT_H_KERNEL_LEN = 50`, `(h_kernel_len, 1)` |
| Default V kernel | 1×50 px | `preprocessing.py`: `DEFAULT_V_KERNEL_LEN = 50`, `(1, v_kernel_len)` |
| Wall subtract dilate | (3,3), 2 iter | `tag_detection.py`: `cv2.getStructuringElement(MORPH_RECT,(3,3))`, `dilate(..., iterations=2)` |
| Residual open kernel | (3,3) ellipse | `tag_detection.py`: `MORPH_OPEN` with 3×3 ellipse |

## Wall detection

| Name | Value | Where |
|------|--------|--------|
| MIN_WALL_THICKNESS_PX | 5 | `wall_detection.py` |
| MIN_WALL_LENGTH_PX | 100 | `wall_detection.py` (~2 ft at 200 DPI comment) |
| MIN_FILL_RATIO | 0.50 | `wall_detection.py` |
| MIN_OPENING_GAP_PX | 25 | `wall_detection.py` (gaps smaller bridged in midline) |
| MERGE_CROSS_AXIS_TOL | 30 | `wall_detection.py` |
| MERGE_ALONG_AXIS_GAP | 60 | `wall_detection.py` |
| MERGE_MIN_FILL_IN_GAP | 0.40 | `wall_detection.py` |
| MIN_GAP_SIZE_PX | 25 | `wall_detection.py` |
| MAX_GAP_SIZE_PX | 400 | `wall_detection.py` |

## Pipeline (splitting, thickness, corners)

| Name | Value | Where |
|------|--------|--------|
| DOUBLE_DOOR_RADIUS_PX | 50 | `pipeline.py` |
| GAP_TAG_MATCH_RADIUS_PX | 200 | `pipeline.py` |
| TAG_WALL_SPLIT_DIST_PX | 80 | `pipeline.py` |
| TAG_SPLIT_HALF_WIDTH_PX | 60 | `pipeline.py` |
| VISUAL_THICKNESS_SEARCH_PX | 30 | `pipeline.py` |
| MAX_VISUAL_THICKNESS_PX | 45 | `pipeline.py` (~13" at 200 DPI comment) |
| ENDPOINT_MARGIN_MIN_PX | 40 | `pipeline.py` |
| ENDPOINT_MARGIN_FRAC | 0.15 | `pipeline.py` |
| MIN_PIECE_LENGTH | 30 | `pipeline.py` |
| CORNER_MAX_DIST_PX | 50 | `takeoff.py` (and annotate/diagnose scripts) |

## Tag detection (doors: Hough)

| Name | Value | Where |
|------|--------|--------|
| HOUGH_DP | 1.2 | `tag_detection.py` |
| HOUGH_MIN_DIST | 30 | `tag_detection.py` |
| HOUGH_PARAM1 | 60 | `tag_detection.py` |
| HOUGH_PARAM2 | 42 | `tag_detection.py` |
| MIN_CIRCLE_RADIUS | 12 | `tag_detection.py` |
| MAX_CIRCLE_RADIUS | 30 | `tag_detection.py` |
| MAX_DIST_TO_WALL_DOOR_PX | 150 | `tag_detection.py` |

## Tag detection (windows: hexagon)

| Name | Value | Where |
|------|--------|--------|
| MIN_HEX_AREA | 1200 px² | `tag_detection.py` |
| MAX_HEX_AREA | 2500 px² | `tag_detection.py` |
| HEX_ASPECT_LO | 1.05 | `tag_detection.py` |
| HEX_ASPECT_HI | 1.60 | `tag_detection.py` |
| HEX_DEDUP_DIST | 20 | `tag_detection.py` |
| MAX_DIST_TO_WALL_WINDOW_PX | 500 | `tag_detection.py` |

## API overrides (cv-takeoff)

| Name | Default | Bounds | Where |
|------|--------|--------|--------|
| dpi | 200 | 72–600 | `cv_takeoff.py`: `CVUrlRequest.dpi` |
| h_kernel | 50 | 10–200 | `cv_takeoff.py` |
| v_kernel | 50 | 10–200 | `cv_takeoff.py` |
| crop_* | 0.02, 0.05, 0.72, 0.95 | 0–1 | `cv_takeoff.py` |

## Unit conversions

- **Pixels → feet**: Used only when `scale_px_per_ft` is provided (e.g. by client). Formula: `length_ft = length_px / scale_px_per_ft`; opening `width_ft = bbox_w / scale_px_per_ft`, `height_ft = bbox_h / scale_px_per_ft` (`pipeline.py` `_apply_scale`). **No** scale inference in the backend; output is pixels if scale is not supplied.
- **DPI**: PDF page is rendered at `dpi` (default 200); 1 inch = 200 px. No explicit “pixels per foot” derived from scale text in code.

## Latency (reasoned breakdown)

- **Download**: 0–60 s (bounded by timeout); depends on URL and file size.
- **Gemini**: No timeout in code; typical single-digit to tens of seconds.
- **CV**: Load image (PDF decode/render), crop, binarise, morphology, contours, tags, split, thickness, annotate, encode PNG to base64 — all CPU; order of seconds for a single page at 200 DPI.
- **Response**: Serialization of JSON with base64 image can be large; no explicit logging of serialization time.

---

# D) Failure Modes & HTTP Statuses

| Condition | HTTP | Detail / message (source) |
|-----------|------|---------------------------|
| Gemini/Vertex not configured | 503 | `"Configure GEMINI_API_KEY or Vertex AI in backend/.env"` (takeoff, vision, floorplan, main test) |
| Download fails (network, timeout, 4xx/5xx) | 400 | `"Failed to download file: {str(e)}"` (takeoff), same in cv_takeoff analyze-url |
| Downloaded file empty | 400 | `"Downloaded file is empty"` (takeoff, cv_takeoff) |
| Gemini API error (including ValueError from client) | 502 | `"Gemini API error: {str(e)}"` or `str(e)` for ValueError in main (test endpoint) |
| Vision analyze: Gemini error | 502 | `"Vision API error: {str(e)}"` (vision.py) |
| Unsupported file type (vision/floorplan) | 400 | `"Unsupported file type: {mime}. Use JPEG, PNG, GIF, WebP, or PDF."` (or similar) |
| Failed to read uploaded file | 400 | `"Failed to read file: {e}"` (vision, floorplan, cv_takeoff upload) |
| Empty uploaded file | 400 | `"Empty file"` (vision, floorplan, cv_takeoff) |
| CV pipeline exception (takeoff) | 200 | Caught; response with `cv_doors=0`, `cv_windows=0`, `cv_walls=0`, `annotated_image=None`; analysis still returned |
| CV pipeline exception (cv_takeoff) | 502 | `"CV pipeline error: {e}"` (analyze and analyze-url) |
| Partitions extraction failure | 500 | `"Extraction failed: {str(e)}"` (partitions) |
| Invalid MIME (cv_takeoff) | 400 | `"Unsupported MIME type: {req.file_mime}"` or `"Unsupported file type: {mime}"` |

---

# E) CORS & Browser Behavior

- **When preflight is sent**: For cross-origin requests with “non-simple” characteristics: e.g. `Content-Type: application/json`, custom headers, or `credentials: true`. Browser sends **OPTIONS** with `Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers`.
- **What the app does**: **CORSMiddleware** responds to OPTIONS with **200** and sets `Access-Control-Allow-Origin` (from `allow_origins`), `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Credentials: true`. Because headers are **explicit** (not `*`), preflight with `credentials: true` succeeds.
- **When 200 vs 400**: CORS does not cause the backend to return 400; disallowed origin/method/header causes the **browser** to block the request. So “when 200” = preflight allowed; “when 400” is not used for CORS in this app.
- **Exact config** (from `main.py`):  
  `allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"]`,  
  `allow_credentials=True`,  
  `allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]`,  
  `allow_headers=["Content-Type", "Authorization", "Accept", "Origin"]`,  
  `expose_headers=["*"]`.

---

# F) ASCII Sequence Diagram (Takeoff Analyze)

```
Frontend                Backend                     External
   |                       |                            |
   |  POST /api/takeoff/   |                            |
   |  analyze              |                            |
   |  { file_url,           |                            |
   |    file_mime,          |                            |
   |    page_number }      |                            |
   |---------------------->|                            |
   |                       |  GET file_url              |
   |                       |  (timeout 60s)             |
   |                       |--------------------------->|
   |                       |                            |
   |                       |<---------------------------|
   |                       |  file_bytes                |
   |                       |                            |
   |                       |  generate_content(         |
   |                       |    image_bytes, prompt     |
   |                       |  )                         |
   |                       |--------------------------->|  Gemini
   |                       |<---------------------------|
   |                       |  analysis text             |
   |                       |                            |
   |                       |  load_image, crop,         |
   |                       |  binarise, isolate_walls,  |
   |                       |  extract_wall_segments,    |
   |                       |  detect_gaps, detect_tags, |
   |                       |  split_walls_at_tags,      |
   |                       |  _measure_visual_thickness,|
   |                       |  _generate_annotated_image |
   |                       |  (all in process)          |
   |                       |                            |
   |  TakeoffResult        |                            |
   |  (analysis, cv_*,     |                            |
   |   annotated_image)    |                            |
   |<----------------------|                            |
```

---

# G) Constants Table (Extracted)

| Constant | Value | File:line or note |
|----------|--------|-------------------|
| Download timeout | 60.0 | takeoff.py (httpx), cv_takeoff.py |
| Default DPI | 200 | preprocessing.py, pipeline.run(), takeoff |
| Crop left/top/right/bottom | 0.02, 0.05, 0.72, 0.95 | preprocessing.py crop_drawing_area |
| ADAPTIVE_BLOCK_SIZE | 25 | preprocessing.py |
| ADAPTIVE_C | 12 | preprocessing.py |
| DEFAULT_H_KERNEL_LEN, DEFAULT_V_KERNEL_LEN | 50 | preprocessing.py |
| MIN_WALL_THICKNESS_PX | 5 | wall_detection.py |
| MIN_WALL_LENGTH_PX | 100 | wall_detection.py |
| MIN_FILL_RATIO | 0.50 | wall_detection.py |
| MIN_OPENING_GAP_PX | 25 | wall_detection.py |
| MERGE_CROSS_AXIS_TOL | 30 | wall_detection.py |
| MERGE_ALONG_AXIS_GAP | 60 | wall_detection.py |
| MERGE_MIN_FILL_IN_GAP | 0.40 | wall_detection.py |
| MIN_GAP_SIZE_PX, MAX_GAP_SIZE_PX | 25, 400 | wall_detection.py |
| DOUBLE_DOOR_RADIUS_PX | 50 | pipeline.py |
| GAP_TAG_MATCH_RADIUS_PX | 200 | pipeline.py |
| TAG_WALL_SPLIT_DIST_PX | 80 | pipeline.py |
| TAG_SPLIT_HALF_WIDTH_PX | 60 | pipeline.py |
| VISUAL_THICKNESS_SEARCH_PX | 30 | pipeline.py |
| MAX_VISUAL_THICKNESS_PX | 45 | pipeline.py |
| ENDPOINT_MARGIN_MIN_PX | 40 | pipeline.py |
| ENDPOINT_MARGIN_FRAC | 0.15 | pipeline.py |
| MIN_PIECE_LENGTH | 30 | pipeline.py |
| CORNER_MAX_DIST_PX | 50 | takeoff.py |
| HOUGH_DP, HOUGH_MIN_DIST | 1.2, 30 | tag_detection.py |
| HOUGH_PARAM1, HOUGH_PARAM2 | 60, 42 | tag_detection.py |
| MIN_CIRCLE_RADIUS, MAX_CIRCLE_RADIUS | 12, 30 | tag_detection.py |
| MIN_HEX_AREA, MAX_HEX_AREA | 1200, 2500 | tag_detection.py |
| HEX_ASPECT_LO, HEX_ASPECT_HI | 1.05, 1.60 | tag_detection.py |
| HEX_DEDUP_DIST | 20 | tag_detection.py |
| MAX_DIST_TO_WALL_DOOR_PX | 150 | tag_detection.py |
| MAX_DIST_TO_WALL_WINDOW_PX | 500 | tag_detection.py |
| DEFAULT_MODEL | "gemini-3-pro-preview" | gemini_vision.py |
| dpi (API bounds) | 72–600 | cv_takeoff.py CVUrlRequest |
| h_kernel, v_kernel (API bounds) | 10–200 | cv_takeoff.py |

No **file size limits**, **max tokens**, **temperature**, **top_p**, or **retry counts** are set in the code. Scale conversion is **length_ft = length_px / scale_px_per_ft** when `scale_px_per_ft` is provided; otherwise outputs are in **pixels**.

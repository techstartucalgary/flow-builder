#!/usr/bin/env python3
"""
Wall-detection diagnostic & instrumentation script.

Runs the CV pipeline stage-by-stage on a sample floor plan and saves
intermediate outputs for each processing step, enabling root-cause
analysis of wall mask errors (missed segments, bleeding/overextension).

Outputs
-------
<stem>_diag/
  01_original.png          – cropped input image
  02_binary.png            – adaptive-threshold result
  03_h_mask.png            – horizontal morphological opening
  04_v_mask.png            – vertical morphological opening
  05_combined_mask.png     – h_mask | v_mask
  06_walls_thin.png        – wall midline segments drawn thin
  07_walls_thick.png       – wall fills at visual_thickness
  08_corners.png           – junction corner fills highlighted
  09_final_annotated.png   – full annotated image
  wall_measurements.txt    – per-wall data log
  slice_<wall_id>.png      – perpendicular scans for selected walls

Usage:
    python scripts/diagnose_walls.py                           # defaults
    python scripts/diagnose_walls.py data/Boxhaus_Page_3.pdf
    python scripts/diagnose_walls.py data/MyPlan.pdf --dpi 300

Run from the backend/ directory:
    .venv/bin/python scripts/diagnose_walls.py
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import cv2
import numpy as np

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.vision.cv.models import Orientation, TagClass
from src.vision.cv.pipeline import (
    _measure_visual_thickness,
    _split_walls_at_tags,
    VISUAL_THICKNESS_SEARCH_PX,
    MAX_VISUAL_THICKNESS_PX,
    ENDPOINT_MARGIN_MIN_PX,
)
from src.vision.cv.preprocessing import binarise, crop_drawing_area, isolate_walls, load_image
from src.vision.cv.tag_detection import detect_tags
from src.vision.cv.wall_detection import extract_wall_segments, detect_gaps

# Colors (BGR)
WALL_COLOR = (0, 180, 0)
DOOR_COLOR = (0, 0, 255)
WINDOW_COLOR = (255, 150, 0)
CORNER_COLOR = (0, 255, 255)  # yellow for corner fills
FONT = cv2.FONT_HERSHEY_SIMPLEX

CORNER_MAX_DIST_PX = 50


def _save(img: np.ndarray, path: str) -> None:
    cv2.imwrite(path, img)
    print(f"  → {path}")


def diagnose(
    input_path: str,
    *,
    dpi: int = 200,
    h_kernel: int = 50,
    v_kernel: int = 50,
    crop_left: float = 0.02,
    crop_top: float = 0.05,
    crop_right: float = 0.72,
    crop_bottom: float = 0.95,
) -> None:
    infile = Path(input_path)
    if not infile.exists():
        raise FileNotFoundError(f"Input not found: {infile}")

    outdir = infile.parent / (infile.stem + "_diag")
    outdir.mkdir(exist_ok=True)
    print(f"Saving diagnostics to: {outdir}/")

    mime = (
        "application/pdf"
        if infile.suffix.lower() == ".pdf"
        else f"image/{infile.suffix.lstrip('.').lower()}"
    )
    file_bytes = infile.read_bytes()

    # ── 1. Load & preprocess ──────────────────────────────────────────
    bgr = load_image(file_bytes, mime, dpi=dpi)
    bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
    _save(bgr, str(outdir / "01_original.png"))

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    binary = binarise(gray)
    _save(binary, str(outdir / "02_binary.png"))

    h_mask, v_mask = isolate_walls(binary, h_kernel_len=h_kernel, v_kernel_len=v_kernel)
    _save(h_mask, str(outdir / "03_h_mask.png"))
    _save(v_mask, str(outdir / "04_v_mask.png"))

    combined = cv2.bitwise_or(h_mask, v_mask)
    _save(combined, str(outdir / "05_combined_mask.png"))

    # ── 2. Extract wall segments ──────────────────────────────────────
    walls = extract_wall_segments(h_mask, v_mask)
    print(f"  Walls after extraction+merge: {len(walls)}")

    # Draw thin wall midlines
    thin_img = bgr.copy()
    for w in walls:
        cv2.line(thin_img, w.start, w.end, WALL_COLOR, 2)
        mx = (w.start[0] + w.end[0]) // 2
        my = (w.start[1] + w.end[1]) // 2
        cv2.putText(thin_img, w.id, (mx - 15, my - 5), FONT, 0.35, WALL_COLOR, 1, cv2.LINE_AA)
    _save(thin_img, str(outdir / "06_walls_thin.png"))

    # ── 3. Tags & split ───────────────────────────────────────────────
    tags = detect_tags(gray, binary, combined, walls)
    walls = _split_walls_at_tags(walls, tags)
    print(f"  Walls after tag splitting: {len(walls)}")

    # ── 4. Measure visual thickness ───────────────────────────────────
    _measure_visual_thickness(walls, h_mask, v_mask)

    # Save wall measurements
    log_path = str(outdir / "wall_measurements.txt")
    with open(log_path, "w") as f:
        f.write(f"{'ID':<8} {'Orient':<4} {'Start':<14} {'End':<14} "
                f"{'LenPx':>6} {'MorphT':>6} {'VisT':>6}\n")
        f.write("-" * 70 + "\n")
        for w in walls:
            f.write(
                f"{w.id:<8} {w.orientation.value:<4} "
                f"{str(w.start):<14} {str(w.end):<14} "
                f"{w.length_px:>6} {w.thickness:>6} {w.visual_thickness:>6}\n"
            )
    print(f"  → {log_path}")

    # Draw thick wall fills
    thick_img = bgr.copy()
    wall_overlay = thick_img.copy()
    for w in walls:
        vt = w.visual_thickness if w.visual_thickness > 0 else w.thickness
        half_t = max(vt // 2, 3)
        if w.orientation.value == "H":
            pt1 = (w.start[0], w.start[1] - half_t)
            pt2 = (w.end[0], w.end[1] + half_t)
        else:
            pt1 = (w.start[0] - half_t, w.start[1])
            pt2 = (w.end[0] + half_t, w.end[1])
        cv2.rectangle(wall_overlay, pt1, pt2, WALL_COLOR, -1)
    cv2.addWeighted(wall_overlay, 0.4, thick_img, 0.6, 0, thick_img)
    _save(thick_img, str(outdir / "07_walls_thick.png"))

    # ── 5. Corner fills ───────────────────────────────────────────────
    corner_img = thick_img.copy()
    corner_overlay = corner_img.copy()
    corners_found = 0
    for i, w1 in enumerate(walls):
        for w2 in walls[i + 1 :]:
            if w1.orientation == w2.orientation:
                continue
            vt1 = w1.visual_thickness if w1.visual_thickness > 0 else w1.thickness
            vt2 = w2.visual_thickness if w2.visual_thickness > 0 else w2.thickness
            ht1 = max(vt1 // 2, 3)
            ht2 = max(vt2 // 2, 3)
            for ep1 in [w1.start, w1.end]:
                for ep2 in [w2.start, w2.end]:
                    d = math.hypot(ep1[0] - ep2[0], ep1[1] - ep2[1])
                    if d < CORNER_MAX_DIST_PX:
                        mx = (ep1[0] + ep2[0]) // 2
                        my = (ep1[1] + ep2[1]) // 2
                        if w1.orientation.value == "H":
                            h_ht, v_ht = ht1, ht2
                        else:
                            h_ht, v_ht = ht2, ht1
                        cp1 = (mx - v_ht, my - h_ht)
                        cp2 = (mx + v_ht, my + h_ht)
                        cv2.rectangle(corner_overlay, cp1, cp2, CORNER_COLOR, -1)
                        corners_found += 1
    cv2.addWeighted(corner_overlay, 0.4, corner_img, 0.6, 0, corner_img)
    _save(corner_img, str(outdir / "08_corners.png"))
    print(f"  Corner fills: {corners_found}")

    # ── 6. Perpendicular slice diagnostics (sample walls) ─────────────
    sample_walls = walls[:min(8, len(walls))]
    for w in sample_walls:
        mask = h_mask if w.orientation == Orientation.HORIZONTAL else v_mask
        if w.orientation == Orientation.HORIZONTAL:
            mid_x = (w.start[0] + w.end[0]) // 2
            y_mid = w.start[1]
            y0 = max(0, y_mid - VISUAL_THICKNESS_SEARCH_PX)
            y1 = min(mask.shape[0], y_mid + VISUAL_THICKNESS_SEARCH_PX + 1)

            # Get perpendicular slices from both h_mask and combined
            h_col = h_mask[y0:y1, mid_x]
            c_col = combined[y0:y1, mid_x]

            # Build a diagnostic image
            slice_h = 120
            slice_w = 300
            diag = np.ones((slice_h, slice_w, 3), dtype=np.uint8) * 255

            # Draw h_mask slice (green)
            for j, val in enumerate(h_col):
                if val > 0:
                    cv2.line(diag, (20, 10 + j), (140, 10 + j), (0, 200, 0), 1)

            # Draw combined slice (red)
            for j, val in enumerate(c_col):
                if val > 0:
                    cv2.line(diag, (160, 10 + j), (280, 10 + j), (0, 0, 200), 1)

            # Center marker
            center_y = y_mid - y0
            cv2.line(diag, (0, 10 + center_y), (slice_w, 10 + center_y), (200, 0, 0), 1)

            cv2.putText(diag, "h_mask", (40, slice_h - 5), FONT, 0.3, (0, 150, 0), 1)
            cv2.putText(diag, "combined", (180, slice_h - 5), FONT, 0.3, (0, 0, 150), 1)
            cv2.putText(
                diag, f"{w.id} vt={w.visual_thickness}", (5, 10), FONT, 0.3, (0, 0, 0), 1
            )
        else:
            mid_y = (w.start[1] + w.end[1]) // 2
            x_mid = w.start[0]
            x0 = max(0, x_mid - VISUAL_THICKNESS_SEARCH_PX)
            x1 = min(mask.shape[1], x_mid + VISUAL_THICKNESS_SEARCH_PX + 1)

            v_row = v_mask[mid_y, x0:x1]
            c_row = combined[mid_y, x0:x1]

            slice_h = 120
            slice_w = 300
            diag = np.ones((slice_h, slice_w, 3), dtype=np.uint8) * 255

            for j, val in enumerate(v_row):
                if val > 0:
                    cv2.line(diag, (20 + j, 10), (20 + j, 50), (0, 200, 0), 1)
            for j, val in enumerate(c_row):
                if val > 0:
                    cv2.line(diag, (20 + j, 60), (20 + j, 100), (0, 0, 200), 1)

            center_x = x_mid - x0
            cv2.line(diag, (20 + center_x, 0), (20 + center_x, slice_h), (200, 0, 0), 1)

            cv2.putText(diag, "v_mask", (5, 55), FONT, 0.3, (0, 150, 0), 1)
            cv2.putText(diag, "combined", (5, 105), FONT, 0.3, (0, 0, 150), 1)
            cv2.putText(
                diag, f"{w.id} vt={w.visual_thickness}", (5, 10), FONT, 0.3, (0, 0, 0), 1
            )

        _save(diag, str(outdir / f"slice_{w.id}.png"))

    # ── 7. Summary ────────────────────────────────────────────────────
    h_count = sum(1 for w in walls if w.orientation == Orientation.HORIZONTAL)
    v_count = sum(1 for w in walls if w.orientation == Orientation.VERTICAL)
    door_count = sum(1 for t in tags if t.tag_class == TagClass.DOOR)
    win_count = sum(1 for t in tags if t.tag_class == TagClass.WINDOW)
    vts = [w.visual_thickness for w in walls if w.visual_thickness > 0]

    print("\n═══ Summary ═══")
    print(f"  Walls: {len(walls)}  (H={h_count}, V={v_count})")
    print(f"  Doors: {door_count},  Windows: {win_count}")
    if vts:
        print(f"  Visual thickness — min={min(vts)}, max={max(vts)}, "
              f"median={sorted(vts)[len(vts)//2]}, mean={sum(vts)/len(vts):.1f}")
    print(f"  Corners: {corners_found}")
    print(f"\nDiagnostics saved to {outdir}/")


# ── CLI ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Wall-detection diagnostics.")
    parser.add_argument("input", nargs="?", default="data/Boxhaus_Page_3.pdf")
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument("--h-kernel", type=int, default=50)
    parser.add_argument("--v-kernel", type=int, default=50)
    parser.add_argument("--crop-left", type=float, default=0.02)
    parser.add_argument("--crop-top", type=float, default=0.05)
    parser.add_argument("--crop-right", type=float, default=0.72)
    parser.add_argument("--crop-bottom", type=float, default=0.95)
    args = parser.parse_args()

    diagnose(
        args.input,
        dpi=args.dpi,
        h_kernel=args.h_kernel,
        v_kernel=args.v_kernel,
        crop_left=args.crop_left,
        crop_top=args.crop_top,
        crop_right=args.crop_right,
        crop_bottom=args.crop_bottom,
    )


if __name__ == "__main__":
    main()

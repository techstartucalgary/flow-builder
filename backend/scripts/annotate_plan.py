#!/usr/bin/env python3
"""
Annotate a floor plan with CV pipeline detections.

Draws colored overlays for walls, door tags, window tags, and openings
on the input image/PDF and saves the result as a PNG.

Usage:
    python scripts/annotate_plan.py                          # defaults
    python scripts/annotate_plan.py data/MyPlan.pdf          # custom input
    python scripts/annotate_plan.py data/MyPlan.pdf -o out.png --dpi 300

Run from the backend/ directory:
    .venv/bin/python scripts/annotate_plan.py
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import cv2
import numpy as np

# Ensure the backend src package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.vision.cv.pipeline import run
from src.vision.cv.preprocessing import load_image, crop_drawing_area

# ── Colors (BGR) ───────────────────────────────────────────────────────
WALL_COLOR    = (0, 180, 0)      # green
DOOR_COLOR    = (0, 0, 255)      # red
WINDOW_COLOR  = (255, 150, 0)    # blue
OPENING_COLOR = (0, 200, 255)    # yellow
FONT          = cv2.FONT_HERSHEY_SIMPLEX

# Junction corner fill — max endpoint distance to consider a corner pair
CORNER_MAX_DIST_PX = 70


def annotate(
    input_path: str,
    output_path: str | None = None,
    *,
    dpi: int = 200,
    h_kernel: int = 50,
    v_kernel: int = 50,
    crop_left: float = 0.0,
    crop_top: float = 0.0,
    crop_right: float = 1.0,
    crop_bottom: float = 1.0,
    sheet: str | None = None,
    floor_level: str | None = None,
    address: str | None = None,
) -> str:
    """Run the CV pipeline and save an annotated PNG. Returns the output path."""

    infile = Path(input_path)
    if not infile.exists():
        raise FileNotFoundError(f"Input file not found: {infile}")

    mime = "application/pdf" if infile.suffix.lower() == ".pdf" else f"image/{infile.suffix.lstrip('.').lower()}"

    with open(infile, "rb") as f:
        file_bytes = f.read()

    # ── Run pipeline ───────────────────────────────────────────────────
    result = run(
        file_bytes,
        mime,
        dpi=dpi,
        h_kernel=h_kernel,
        v_kernel=v_kernel,
        crop_left=crop_left,
        crop_top=crop_top,
        crop_right=crop_right,
        crop_bottom=crop_bottom,
        sheet=sheet,
        floor_level=floor_level,
        address=address,
    )

    # ── Load image for drawing ─────────────────────────────────────────
    bgr = load_image(file_bytes, mime, dpi=dpi)
    bgr = crop_drawing_area(bgr, crop_left, crop_top, crop_right, crop_bottom)
    annotated = bgr.copy()

    # ── Draw walls (full-thickness semi-transparent fill) ──────────────
    wall_overlay = annotated.copy()
    for w in result.walls:
        # Use visual_thickness (both faces) for the fill
        vt = w.visual_thickness if w.visual_thickness > 0 else w.thickness
        half_t = max(vt // 2, 3)
        if w.orientation.value == "H":
            pt1 = (w.start[0], w.start[1] - half_t)
            pt2 = (w.end[0],   w.end[1]   + half_t)
        else:
            pt1 = (w.start[0] - half_t, w.start[1])
            pt2 = (w.end[0]   + half_t, w.end[1])
        cv2.rectangle(wall_overlay, pt1, pt2, WALL_COLOR, -1)  # filled

    # ── Fill junction corners ────────────────────────────────────────
    # Morphological opening erodes wall endpoints, leaving visible gaps
    # where perpendicular walls meet.  Fill small rectangles at these
    # corners so the overlay looks continuous.
    for i, w1 in enumerate(result.walls):
        for w2 in result.walls[i + 1:]:
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
                        cv2.rectangle(wall_overlay, cp1, cp2, WALL_COLOR, -1)

    # Blend: 40% wall fill, 60% original drawing
    cv2.addWeighted(wall_overlay, 0.4, annotated, 0.6, 0, annotated)

    # Wall labels on top (fully opaque)
    for w in result.walls:
        mx = (w.start[0] + w.end[0]) // 2
        my = (w.start[1] + w.end[1]) // 2
        cv2.putText(annotated, w.id, (mx - 20, my - 8), FONT, 0.45, WALL_COLOR, 1, cv2.LINE_AA)

    # ── Draw door tags ─────────────────────────────────────────────────
    for t in result.tags:
        if t.tag_class.value == "door":
            cv2.circle(annotated, t.center, t.radius + 6, DOOR_COLOR, 2)
            cv2.putText(
                annotated, t.id,
                (t.center[0] - 15, t.center[1] - t.radius - 10),
                FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA,
            )

    # ── Draw window tags (flat-top hexagon outline) ──────────────────────
    for t in result.tags:
        if t.tag_class.value == "window":
            # Draw a flat-top hexagon matching the architectural symbol
            r = t.radius + 8
            pts = []
            for i in range(6):
                angle = i * np.pi / 3  # 0°, 60°, 120°, 180°, 240°, 300°
                px = int(t.center[0] + r * np.cos(angle))
                py = int(t.center[1] + r * np.sin(angle))
                pts.append([px, py])
            pts_arr = np.array(pts, np.int32).reshape((-1, 1, 2))
            cv2.polylines(annotated, [pts_arr], True, WINDOW_COLOR, 2)
            cv2.putText(
                annotated, t.id,
                (t.center[0] - 15, t.center[1] - t.radius - 12),
                FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA,
            )

    # ── Draw legend ────────────────────────────────────────────────────
    doors = [t for t in result.tags if t.tag_class.value == "door"]
    wins  = [t for t in result.tags if t.tag_class.value == "window"]

    lx, ly = 20, 30
    cv2.rectangle(annotated, (10, 10), (320, 110), (255, 255, 255), -1)
    cv2.rectangle(annotated, (10, 10), (320, 110), (0, 0, 0), 1)
    cv2.putText(annotated, "LEGEND", (lx, ly), FONT, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

    cv2.rectangle(annotated, (lx, ly + 8), (lx + 30, ly + 16), WALL_COLOR, -1)
    cv2.putText(annotated, f"Walls ({len(result.walls)})", (lx + 40, ly + 16), FONT, 0.4, WALL_COLOR, 1, cv2.LINE_AA)
    ly += 28

    cv2.circle(annotated, (lx + 12, ly + 4), 8, DOOR_COLOR, 2)
    cv2.putText(annotated, f"Door tags ({len(doors)})", (lx + 40, ly + 8), FONT, 0.4, DOOR_COLOR, 1, cv2.LINE_AA)
    ly += 28

    cv2.circle(annotated, (lx + 12, ly + 4), 8, WINDOW_COLOR, 2)
    cv2.putText(annotated, f"Window tags ({len(wins)})", (lx + 40, ly + 8), FONT, 0.4, WINDOW_COLOR, 1, cv2.LINE_AA)

    # ── Save ───────────────────────────────────────────────────────────
    if output_path is None:
        output_path = str(infile.with_stem(infile.stem + "_annotated").with_suffix(".png"))

    cv2.imwrite(output_path, annotated)

    # ── Print summary ──────────────────────────────────────────────────
    d = result.debug
    print(f"Saved → {output_path}  ({annotated.shape[1]}×{annotated.shape[0]})")
    print(f"  Walls:   {d.total_wall_segments}  (H={d.horizontal_walls}, V={d.vertical_walls})")
    print(f"  Doors:   {d.door_tags}  (double-door pairs: {d.double_door_pairs})")
    print(f"  Windows: {d.window_tags}")
    print(f"  Openings:{d.openings}  (gaps: {d.gaps_detected})")

    return output_path


# ── CLI ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Annotate a floor plan with CV detections.")
    parser.add_argument("input", nargs="?", default="data/Boxhaus_Page_3.pdf", help="Path to PDF or image")
    parser.add_argument("-o", "--output", default=None, help="Output PNG path (default: <input>_annotated.png)")
    parser.add_argument("--dpi", type=int, default=200, help="Render DPI for PDFs")
    parser.add_argument("--h-kernel", type=int, default=50, help="Horizontal morph kernel length")
    parser.add_argument("--v-kernel", type=int, default=50, help="Vertical morph kernel length")
    parser.add_argument("--crop-left", type=float, default=0.0)
    parser.add_argument("--crop-top", type=float, default=0.0)
    parser.add_argument("--crop-right", type=float, default=1.0)
    parser.add_argument("--crop-bottom", type=float, default=1.0)
    parser.add_argument("--sheet", default=None, help="Sheet number metadata")
    parser.add_argument("--floor-level", default=None, help="Floor level metadata")
    parser.add_argument("--address", default=None, help="Address metadata")
    args = parser.parse_args()

    annotate(
        args.input,
        args.output,
        dpi=args.dpi,
        h_kernel=args.h_kernel,
        v_kernel=args.v_kernel,
        crop_left=args.crop_left,
        crop_top=args.crop_top,
        crop_right=args.crop_right,
        crop_bottom=args.crop_bottom,
        sheet=args.sheet,
        floor_level=args.floor_level,
        address=args.address,
    )


if __name__ == "__main__":
    main()

"""
Preprocessing stage — image loading, binarisation, ROI estimation, and
directional wall isolation.

Public API
----------
load_image(file_bytes, mime_type) → np.ndarray  (BGR uint8)
binarise(gray)                    → np.ndarray  (binary uint8, 0/255)
build_structural_roi(binary)      → np.ndarray  (binary uint8, 0/255)
isolate_walls(binary)             → (h_mask, v_mask)
"""

from __future__ import annotations

import numpy as np
import cv2

# ---------------------------------------------------------------------------
# Tunables (exposed so the API can accept overrides later)
# ---------------------------------------------------------------------------
DEFAULT_H_KERNEL_LEN = 50    # px — horizontal morphological kernel width
DEFAULT_V_KERNEL_LEN = 50    # px — vertical morphological kernel height
ADAPTIVE_BLOCK_SIZE = 25     # must be odd
ADAPTIVE_C = 12              # constant subtracted from mean
STRUCTURAL_ROI_H_KERNEL_LEN = 24
STRUCTURAL_ROI_V_KERNEL_LEN = 24
STRUCTURAL_ROI_CLOSE_KERNEL_PX = 21
STRUCTURAL_ROI_DILATE_KERNEL_PX = 61
STRUCTURAL_ROI_MIN_COMPONENT_AREA_FRAC = 0.004


# ---------------------------------------------------------------------------
# PDF → image (requires pymupdf / fitz)
# ---------------------------------------------------------------------------

def _pdf_bytes_to_image(data: bytes, dpi: int = 200, page_number: int = 0) -> np.ndarray:
    """Render a specific page of a PDF to a BGR numpy array.

    Parameters
    ----------
    page_number : 0-indexed page to render (default 0 = first page).
    """
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    print(f"[preprocessing] PDF has {len(doc)} pages, rendering page {page_number}")
    if page_number >= len(doc):
        page_number = 0
    page = doc[page_number]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
        pix.height, pix.width, pix.n,
    )
    doc.close()
    # fitz returns RGB; OpenCV uses BGR
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------

def load_image(file_bytes: bytes, mime_type: str, dpi: int = 200, page_number: int = 0) -> np.ndarray:
    """
    Convert raw file bytes into a BGR ``np.ndarray``.

    Supports JPEG, PNG, WebP, GIF (first frame) via OpenCV,
    and PDF (specific page) via PyMuPDF.

    Parameters
    ----------
    page_number : 0-indexed page for PDFs (default 0).
    """
    if mime_type == "application/pdf":
        return _pdf_bytes_to_image(file_bytes, dpi=dpi, page_number=page_number)

    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"OpenCV could not decode image (mime={mime_type})")
    return img


def crop_drawing_area(
    img: np.ndarray,
    left_pct: float = 0.0,
    top_pct: float = 0.0,
    right_pct: float = 1.0,
    bottom_pct: float = 1.0,
) -> np.ndarray:
    """
    Crop to a caller-specified drawing area.

    Defaults intentionally preserve the full sheet. Downstream wall
    extraction relies on a content-aware structural ROI instead of fixed
    left/right crop assumptions, but explicit crop overrides remain
    available for diagnostics and manual tuning.
    """
    h, w = img.shape[:2]
    x1 = int(w * left_pct)
    y1 = int(h * top_pct)
    x2 = int(w * right_pct)
    y2 = int(h * bottom_pct)
    return img[y1:y2, x1:x2]


def binarise(gray: np.ndarray) -> np.ndarray:
    """
    Adaptive-threshold a grayscale image to a clean binary matrix.

    Returns a uint8 array where walls/lines = 0 (black) and
    background = 255 (white).
    """
    # Slight blur to suppress scanner noise
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,          # lines → 255
        ADAPTIVE_BLOCK_SIZE,
        ADAPTIVE_C,
    )
    return binary


def build_structural_roi(binary: np.ndarray) -> np.ndarray:
    """
    Estimate the dominant floor-plan region from long horizontal/vertical
    line structure and return it as a padded binary mask.

    The mask is intentionally loose: it should keep the full plan body and
    nearby openings while excluding detached legend and schedule blocks.
    """
    if binary.size == 0:
        return np.zeros_like(binary)

    h_seed, v_seed = isolate_walls(
        binary,
        h_kernel_len=STRUCTURAL_ROI_H_KERNEL_LEN,
        v_kernel_len=STRUCTURAL_ROI_V_KERNEL_LEN,
    )
    seed = cv2.bitwise_or(h_seed, v_seed)
    if np.count_nonzero(seed) == 0:
        return np.full_like(binary, 255)

    close_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (STRUCTURAL_ROI_CLOSE_KERNEL_PX, STRUCTURAL_ROI_CLOSE_KERNEL_PX),
    )
    dilate_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (STRUCTURAL_ROI_DILATE_KERNEL_PX, STRUCTURAL_ROI_DILATE_KERNEL_PX),
    )
    seed = cv2.morphologyEx(seed, cv2.MORPH_CLOSE, close_kernel)
    seed = cv2.dilate(seed, dilate_kernel, iterations=1)

    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(seed, connectivity=8)
    if n_labels <= 1:
        return np.full_like(binary, 255)

    min_component_area = max(
        1200,
        int(binary.shape[0] * binary.shape[1] * STRUCTURAL_ROI_MIN_COMPONENT_AREA_FRAC),
    )
    best_label = 0
    best_area = 0
    for label_idx in range(1, n_labels):
        area = int(stats[label_idx, cv2.CC_STAT_AREA])
        if area < min_component_area:
            continue
        if area > best_area:
            best_area = area
            best_label = label_idx

    if best_label == 0:
        best_label = int(np.argmax(stats[1:, cv2.CC_STAT_AREA]) + 1)

    roi = np.zeros_like(binary, dtype=np.uint8)
    roi[labels == best_label] = 255
    roi = cv2.dilate(roi, dilate_kernel, iterations=1)
    roi = cv2.morphologyEx(roi, cv2.MORPH_CLOSE, close_kernel)
    return roi


def isolate_walls(
    binary: np.ndarray,
    h_kernel_len: int = DEFAULT_H_KERNEL_LEN,
    v_kernel_len: int = DEFAULT_V_KERNEL_LEN,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Morphological Opening to separate horizontal and vertical wall lines.

    Parameters
    ----------
    binary : uint8 array where foreground (lines) = 255.
    h_kernel_len : width of the 1×N horizontal kernel.
    v_kernel_len : height of the N×1 vertical kernel.

    Returns
    -------
    (h_mask, v_mask) — two uint8 arrays (0/255) isolating each direction.
    """
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_kernel_len))

    h_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    v_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

    return h_mask, v_mask

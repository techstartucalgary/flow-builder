"""
Preprocessing stage — image loading, binarisation, morphological wall isolation.

Public API
----------
load_image(file_bytes, mime_type) → np.ndarray  (BGR uint8)
binarise(gray)                    → np.ndarray  (binary uint8, 0/255)
isolate_walls(binary)             → (h_mask, v_mask)
"""

from __future__ import annotations

import numpy as np
import cv2

# ---------------------------------------------------------------------------
# Tunables (exposed so the API can accept overrides later)
# ---------------------------------------------------------------------------
DEFAULT_H_KERNEL_LEN = 50   # px — horizontal morphological kernel width
DEFAULT_V_KERNEL_LEN = 50   # px — vertical morphological kernel height
ADAPTIVE_BLOCK_SIZE = 25     # must be odd
ADAPTIVE_C = 12              # constant subtracted from mean


# ---------------------------------------------------------------------------
# PDF → image (requires pymupdf / fitz)
# ---------------------------------------------------------------------------

def _pdf_bytes_to_image(data: bytes, dpi: int = 200) -> np.ndarray:
    """Render the first page of a PDF to a BGR numpy array."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    page = doc[0]
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

def load_image(file_bytes: bytes, mime_type: str, dpi: int = 200) -> np.ndarray:
    """
    Convert raw file bytes into a BGR ``np.ndarray``.

    Supports JPEG, PNG, WebP, GIF (first frame) via OpenCV,
    and PDF (first page) via PyMuPDF.
    """
    if mime_type == "application/pdf":
        return _pdf_bytes_to_image(file_bytes, dpi=dpi)

    arr = np.frombuffer(file_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"OpenCV could not decode image (mime={mime_type})")
    return img


def crop_drawing_area(
    img: np.ndarray,
    left_pct: float = 0.02,
    top_pct: float = 0.05,
    right_pct: float = 0.72,
    bottom_pct: float = 0.95,
) -> np.ndarray:
    """
    Crop to the floor-plan drawing area, excluding the title block,
    legend column, and margin notes.

    The default percentages assume a standard ARCH-D landscape sheet
    where the drawing occupies roughly the left 70 % and the title
    block / legend sit on the right.

    Parameters can be overridden per-project via the API.
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

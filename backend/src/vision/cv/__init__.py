"""
Computer-vision pipeline for deterministic floor-plan extraction.

Modules
-------
models          Pydantic data models (Wall, Opening, TagAnchor, …)
preprocessing   PDF→image conversion, binarisation, morphological isolation
wall_detection  Contour→line-segment vectorisation, gap detection
tag_detection   Hough circles (doors) and polygon approximation (windows)
pipeline        Top-level orchestrator that wires all stages together
"""

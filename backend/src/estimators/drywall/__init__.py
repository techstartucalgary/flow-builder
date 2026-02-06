"""Drywall estimation module."""

# Original calculator (basic)
from .calculator import DrywallCalculator, DrywallEstimate, Opening, WallSegment

# Enhanced calculator (category-specific with validation)
from .calculator_v2 import (
    DrywallCalculator as DrywallCalculatorV2,
    DrywallEstimate as DrywallEstimateV2,
    ValidationWarning,
    WallSegment as WallSegmentV2,
    Opening as OpeningV2,
)

__all__ = [
    # Basic calculator
    "DrywallCalculator",
    "DrywallEstimate",
    "WallSegment",
    "Opening",
    # Enhanced calculator (recommended)
    "DrywallCalculatorV2",
    "DrywallEstimateV2",
    "ValidationWarning",
    "WallSegmentV2",
    "OpeningV2",
]

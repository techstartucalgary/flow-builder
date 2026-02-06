"""Vision prompts for floor plan extraction."""

from .construction_takeoff import (
    COMPREHENSIVE_FLOORPLAN_PROMPT,
    QUICK_SUMMARY_PROMPT,
)

from .universal_extraction import (
    UNIVERSAL_EXTRACTION_PROMPT,
    VERIFICATION_PROMPT,
    LEGEND_FIRST_RULE,
    generate_extraction_prompt,
)

from .legend_driven_extraction import (
    LEGEND_DISCOVERY_PROMPT,
    SYMBOL_COUNTING_PROMPT,
    LEGEND_DRIVEN_MASTER_PROMPT,
    SYMBOL_IDENTIFICATION_GUIDE,
    SHAPE_VERIFICATION_PROMPT,
)

__all__ = [
    # Construction takeoff
    "COMPREHENSIVE_FLOORPLAN_PROMPT",
    "QUICK_SUMMARY_PROMPT",
    # Universal extraction (recommended)
    "UNIVERSAL_EXTRACTION_PROMPT",
    "VERIFICATION_PROMPT",
    "LEGEND_FIRST_RULE",
    "generate_extraction_prompt",
    # Legend-driven extraction
    "LEGEND_DISCOVERY_PROMPT",
    "SYMBOL_COUNTING_PROMPT",
    "LEGEND_DRIVEN_MASTER_PROMPT",
    "SYMBOL_IDENTIFICATION_GUIDE",
    "SHAPE_VERIFICATION_PROMPT",
]

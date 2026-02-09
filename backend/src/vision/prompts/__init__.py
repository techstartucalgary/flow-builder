"""Vision prompts for floor plan extraction."""

from .universal_extraction import (
    UNIVERSAL_EXTRACTION_PROMPT,
    VERIFICATION_PROMPT,
    LEGEND_FIRST_RULE,
    generate_extraction_prompt,
)

from .partition_extraction import (
    COMBINED_PARTITION_AND_DIMENSION_PROMPT,
)

__all__ = [
    "UNIVERSAL_EXTRACTION_PROMPT",
    "VERIFICATION_PROMPT",
    "LEGEND_FIRST_RULE",
    "generate_extraction_prompt",
    "COMBINED_PARTITION_AND_DIMENSION_PROMPT",
]

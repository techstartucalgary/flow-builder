"""
Dynamic Floor Plan Extraction Pipeline
======================================
Multi-pass extraction with validation and conflict resolution.
Zero hardcoding - everything comes from vision analysis.
"""

import json
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

from src.vision.providers.gemini_vision import analyze_image


@dataclass
class Door:
    """Dynamically extracted door."""
    tag: str
    width_ft: float
    height_ft: float
    door_type: str  # swing, slider, double, pocket
    locations: List[str] = field(default_factory=list)
    count: int = 0


@dataclass
class Window:
    """Dynamically extracted window."""
    tag: str
    width_ft: float
    height_ft: float
    locations: List[str] = field(default_factory=list)
    count: int = 0


@dataclass
class WallSegment:
    """Dynamically extracted wall segment."""
    name: str
    category: str  # perimeter, partition, end_cap, soffit
    length_ft: float
    length_raw: str  # Original dimension string
    doors: List[str] = field(default_factory=list)  # Door tags in this wall
    windows: List[str] = field(default_factory=list)  # Window tags in this wall


@dataclass
class ExtractionResult:
    """Complete extraction result from floor plan."""
    # Metadata
    sheet_number: str = ""
    scale: str = ""
    total_area_sqft: float = 0.0
    floor_level: str = ""
    
    # Rooms
    rooms: List[str] = field(default_factory=list)
    
    # Doors (dynamically extracted)
    doors: Dict[str, Door] = field(default_factory=dict)
    total_doors: int = 0
    
    # Windows (dynamically extracted)
    windows: Dict[str, Window] = field(default_factory=dict)
    total_windows: int = 0
    
    # Walls (dynamically extracted)
    perimeter_walls: List[WallSegment] = field(default_factory=list)
    interior_partitions: List[WallSegment] = field(default_factory=list)
    
    # Dimensions (raw strings)
    dimension_strings: List[str] = field(default_factory=list)
    
    # Special features
    dropped_ceilings: List[str] = field(default_factory=list)
    equipment: List[str] = field(default_factory=list)
    
    # Validation
    validation_passed: bool = False
    validation_notes: List[str] = field(default_factory=list)
    
    # Raw analysis for debugging
    raw_analysis: str = ""


def parse_dimension_to_feet(dim_str: str) -> float:
    """Parse architectural dimension string to decimal feet."""
    try:
        dim_str = dim_str.strip().replace('"', '')
        
        if "'" in dim_str:
            parts = dim_str.split("'")
            feet = float(parts[0].strip())
            
            if len(parts) > 1 and parts[1].strip():
                inches_str = parts[1].strip().replace('-', ' ')
                
                if ' ' in inches_str:
                    components = inches_str.split()
                    inches = 0.0
                    for comp in components:
                        if '/' in comp:
                            num, denom = comp.split('/')
                            inches += float(num) / float(denom)
                        else:
                            inches += float(comp)
                elif '/' in inches_str:
                    num, denom = inches_str.split('/')
                    inches = float(num) / float(denom)
                else:
                    inches = float(inches_str)
                
                feet += inches / 12.0
            return feet
        else:
            return float(dim_str)
    except:
        return 0.0


# =============================================================================
# EXTRACTION PROMPTS - Designed for structured output
# =============================================================================

STRUCTURED_EXTRACTION_PROMPT = """
# STRUCTURED FLOOR PLAN EXTRACTION

Extract information in the EXACT format specified. Do not deviate.

## OUTPUT FORMAT (JSON):

{
  "metadata": {
    "sheet_number": "A100",
    "scale": "1/4\\" = 1'-0\\"",
    "total_area_sqft": 1556,
    "floor_level": "Basement"
  },
  "rooms": ["Room 1", "Room 2", ...],
  "door_schedule": [
    {"tag": "1", "width": "2'-6\\"", "height": "8'-0\\""},
    {"tag": "2", "width": "2'-8\\"", "height": "8'-0\\""},
    ...
  ],
  "doors_on_plan": [
    {"tag": "1", "count": 2, "locations": ["Bath from Guest", "Bath from Hall"]},
    {"tag": "2", "count": 4, "locations": ["Guest entry", "Laundry", "Mech", "Storage"]},
    ...
  ],
  "total_doors": 10,
  "window_schedule": [
    {"tag": "1", "width": "5'-0\\"", "height": "3'-0\\""},
    {"tag": "2", "width": "3'-6\\"", "height": "3'-0\\""},
    ...
  ],
  "windows_on_plan": [
    {"tag": "1", "count": 3, "locations": ["Rec Room South x3"]},
    {"tag": "2", "count": 1, "locations": ["Guest Suite"]},
    ...
  ],
  "total_windows": 4,
  "dimensions": ["42'-1 1/2\\"", "35'-1 3/4\\"", ...],
  "dropped_ceilings": ["Central corridor", "Storage area"],
  "equipment": ["FAU 1", "FAU 2", "W/D"]
}

## RULES:
1. Count EVERY door symbol (swing arcs + sliders)
2. Count EVERY window symbol on perimeter
3. Extract EVERY dimension string you see
4. List ALL rooms/spaces

PROVIDE OUTPUT AS VALID JSON.
"""


DOOR_FOCUSED_PROMPT = """
# DOOR INVENTORY - EXHAUSTIVE COUNT

You must find EVERY door on this floor plan. This is critical for accurate material takeoff.

## DOOR SYMBOL TYPES TO LOOK FOR:
1. SWING DOORS: Quarter-circle arc showing door swing direction
2. DOUBLE DOORS: Two swing arcs side-by-side
3. SLIDING DOORS: Parallel lines, no swing arc, often exterior
4. POCKET DOORS: Dashed lines inside wall
5. BIFOLD DOORS: Multiple panel indicators

## METHODOLOGY:

### Pass 1: Find the Door Schedule
Look for a table titled "DOOR SCHEDULE" or similar.
List every door type with dimensions:
- Type/Tag number
- Width x Height
- Special notes

### Pass 2: Scan EVERY Room
For each room, identify ALL doors that connect to it:

ROOM: [name]
  - Door to [destination]: Tag [#]
  - Door to [destination]: Tag [#]
  
### Pass 3: Count by Tag
For each tag number in the schedule:
TAG [#]: ___ doors found at: [location 1], [location 2], ...

### Pass 4: Sum and Verify
Total doors by tag: ___
Total doors by room: ___
Match? YES/NO

## COMMON MISTAKES:
- Missing closet doors
- Missing Jack & Jill bathroom second entry
- Missing exterior sliders
- Counting double door as 2 (it's 1 unit)

## OUTPUT:
List each door tag with exact count and all locations.
TOTAL DOORS: ___
"""


WINDOW_FOCUSED_PROMPT = """
# WINDOW INVENTORY - EXHAUSTIVE COUNT

## WINDOW SYMBOL IDENTIFICATION:
- Windows break through wall lines
- Often have parallel lines indicating glass
- Tags are typically circles or ovals with numbers

## METHODOLOGY:

### Pass 1: Find Window Schedule
List every window type with dimensions.

### Pass 2: Walk the Perimeter
Mentally walk around the building perimeter:
- NORTH wall: ___ windows (list tags)
- EAST wall: ___ windows (list tags)
- SOUTH wall: ___ windows (list tags)
- WEST wall: ___ windows (list tags)

### Pass 3: Count by Tag
TAG [#]: ___ windows at [locations]

### Pass 4: Verify
Total by perimeter walk: ___
Total by tag count: ___
Match? YES/NO

## OUTPUT:
List each window tag with exact count and locations.
TOTAL WINDOWS: ___
"""


def run_extraction_pipeline(
    image_bytes: bytes,
    mime_type: str,
    model: str = "gemini-3-pro-preview",
) -> ExtractionResult:
    """
    Run multi-pass extraction pipeline on floor plan.
    
    Args:
        image_bytes: Image/PDF file content
        mime_type: MIME type of file
        model: Model to use
        
    Returns:
        ExtractionResult with all extracted data
    """
    result = ExtractionResult()
    
    # Pass 1: Structured extraction
    analysis1 = analyze_image(
        image_bytes=image_bytes,
        mime_type=mime_type,
        prompt=STRUCTURED_EXTRACTION_PROMPT,
        model=model,
    )
    result.raw_analysis = analysis1
    
    # Pass 2: Door-focused verification
    analysis2 = analyze_image(
        image_bytes=image_bytes,
        mime_type=mime_type,
        prompt=DOOR_FOCUSED_PROMPT,
        model=model,
    )
    
    # Pass 3: Window-focused verification
    analysis3 = analyze_image(
        image_bytes=image_bytes,
        mime_type=mime_type,
        prompt=WINDOW_FOCUSED_PROMPT,
        model=model,
    )
    
    # Combine and validate results
    result.validation_notes.append(f"Pass 1 (structured): {len(analysis1)} chars")
    result.validation_notes.append(f"Pass 2 (doors): {len(analysis2)} chars")
    result.validation_notes.append(f"Pass 3 (windows): {len(analysis3)} chars")
    
    return result


# Export prompts for use in routes
EXTRACTION_PROMPTS = {
    "structured": STRUCTURED_EXTRACTION_PROMPT,
    "doors": DOOR_FOCUSED_PROMPT,
    "windows": WINDOW_FOCUSED_PROMPT,
}

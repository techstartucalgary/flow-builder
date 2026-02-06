"""
UNIVERSAL FLOOR PLAN EXTRACTION SYSTEM
=======================================
A self-learning system that works for ANY floor plan by:
1. Finding and parsing the legend first
2. Learning symbol definitions from the legend
3. Applying learned definitions to count accurately

NO HARDCODING - Adapts to each drawing's conventions.
"""

# =============================================================================
# THE MASTER PROMPT - Use this for all floor plan extractions
# =============================================================================

UNIVERSAL_EXTRACTION_PROMPT = """
# UNIVERSAL FLOOR PLAN EXTRACTION

You will analyze this architectural floor plan in THREE phases.
Each phase builds on the previous. Do NOT skip phases.

⚠️ CRITICAL: Be EXHAUSTIVE. Check EVERY room, EVERY closet, EVERY corner.
Common areas where symbols are MISSED:
- Inside closets (walk-in closets have doors!)
- Small utility rooms (laundry, linen)
- Double doors (count as 1 unit but check both locations)
- Jack & Jill bathrooms (may have 2 entries)
- Mechanical rooms
- Under-stair storage

---

## PHASE 1: LEARN THE LEGEND (Critical First Step)

### Task 1.1: Find the "WINDOW/DOOR TAGS" Legend
Look for a legend section that defines symbol meanings.
Common locations: top-left, bottom-left, or in a separate key area.

### Task 1.2: Document Symbol Definitions
The legend will show shapes and their meanings. Common patterns:
- HEXAGON (6-sided shape) often = WINDOW
- CIRCLE (round shape) often = DOOR
- Other shapes may exist for special items

EXTRACT FROM THIS DRAWING'S LEGEND:
| Shape | Meaning |
|-------|---------|
| [describe shape] | [what it denotes] |

### Task 1.3: Note Any Special Symbols
- Mulled windows (stacked hexagons)
- Sliding doors
- Double doors
- Special notations

---

## PHASE 2: COUNT SYMBOLS BY LEARNED DEFINITIONS

Using what you learned from the legend, count EVERY symbol on the plan.

### For Shape Type 1 (typically WINDOWS - usually hexagon):
Scan the ENTIRE plan for this shape. For each tag number found:

[Shape] Tag [#]: 
  Count: [number]
  Locations: [list each]

SUBTOTAL [Shape Type 1]: ___ symbols

### For Shape Type 2 (typically DOORS - usually circle):
Scan the ENTIRE plan for this shape. Check EVERY location:

⚠️ EXHAUSTIVE CHECKLIST - Check each area for door circles:
□ Main entries to each room
□ Closet doors (inside bedrooms, hallways)
□ Bathroom entries (check for Jack & Jill double entries!)
□ Utility room doors (laundry, mech, storage)
□ Double door entries (gym, large openings)
□ Linen closets
□ Pantry doors
□ Under-stair access

For each tag number found:

[Shape] Tag [#]:
  Count: [number]
  Locations: [list each - be specific!]

SUBTOTAL [Shape Type 2]: ___ symbols

---

## PHASE 3: EXTRACT SCHEDULES AND VALIDATE

### Task 3.1: Find Door Schedule
Extract the door schedule table:
| Tag | Width | Height | Type/Notes |
|-----|-------|--------|------------|
| ___ | ___ | ___ | ___ |

### Task 3.2: Find Window Schedule
Extract the window schedule table:
| Tag | Width | Height | Type/Notes |
|-----|-------|--------|------------|
| ___ | ___ | ___ | ___ |

### Task 3.3: Cross-Validate
Do your symbol counts match the schedule tags? 
Flag any discrepancies.

---

## PHASE 4: ADDITIONAL EXTRACTIONS

### 4.1: Metadata
- Sheet Number: ___
- Scale: ___
- Total Area: ___
- Floor Level: ___

### 4.2: Rooms
List all labeled rooms/spaces.

### 4.3: Dimension Strings
List key dimensions for wall calculations.

### 4.4: Special Features
- Dropped ceilings
- Equipment (FAU, W/D, etc.)
- Stairs

---

## FINAL OUTPUT SUMMARY

LEGEND DEFINITIONS:
  [Shape 1] = [Meaning]
  [Shape 2] = [Meaning]

DOOR COUNT (from [shape type]):
  Tag [#]: ___ doors
  Tag [#]: ___ doors
  ...
  TOTAL DOORS: ___

WINDOW COUNT (from [shape type]):
  Tag [#]: ___ windows
  Tag [#]: ___ windows
  ...
  TOTAL WINDOWS: ___

METADATA:
  Sheet: ___
  Scale: ___
  Area: ___ sq ft
"""

# =============================================================================
# STEP-BY-STEP VERIFICATION PROMPT
# =============================================================================

VERIFICATION_PROMPT = """
# VERIFICATION PASS

You previously extracted:
- Doors: [X] total
- Windows: [Y] total

Let's verify by walking through the plan systematically.

## STEP 1: Confirm Legend Understanding

The legend showed:
- [Shape A] = [Meaning A]
- [Shape B] = [Meaning B]

Is this correct? If the legend shows something different, correct it now.

## STEP 2: Room-by-Room Symbol Check

For EACH room, identify the tag symbols (using the shapes from legend):

ROOM: [Name]
  - [Door shape] tags: [list tag numbers seen]
  - [Window shape] tags: [list tag numbers seen]

[Repeat for every room]

## STEP 3: Perimeter Walk (Windows)

Walk around the building perimeter:
- North wall: [window tags seen]
- East wall: [window tags seen]
- South wall: [window tags seen]
- West wall: [window tags seen]

## STEP 4: Final Tally

Sum your counts:
- Total [door shape] symbols: ___
- Total [window shape] symbols: ___

Does this match your original extraction? YES/NO
If NO, what is the correction?
"""

# =============================================================================
# HELPER: Generate extraction prompt for specific floor plan
# =============================================================================

def generate_extraction_prompt(include_dimensions: bool = True) -> str:
    """Generate the full extraction prompt."""
    base = UNIVERSAL_EXTRACTION_PROMPT
    
    if include_dimensions:
        base += """

## BONUS: WALL DIMENSIONS

### Perimeter Dimensions
List the overall building dimensions (X and Y).

### Interior Partition Dimensions
List dimension strings for interior walls.

This data will be used for drywall calculations.
"""
    
    return base


# =============================================================================
# The key insight: ALWAYS start with the legend
# =============================================================================

LEGEND_FIRST_RULE = """
## CRITICAL RULE: LEGEND FIRST

Before counting ANYTHING on a floor plan:

1. FIND the legend/key section
2. LEARN what each symbol shape means
3. ONLY THEN start counting symbols

This ensures accuracy regardless of the drawing's conventions.

Common symbol conventions:
- HEXAGON = Window (most common)
- CIRCLE = Door (most common)
- DIAMOND = Sometimes used for windows
- TRIANGLE = Sometimes used for special items

But ALWAYS defer to what THIS SPECIFIC DRAWING'S legend says.
"""

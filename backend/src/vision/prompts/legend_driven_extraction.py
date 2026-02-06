"""
LEGEND-DRIVEN FLOOR PLAN EXTRACTION
====================================
Step 1: Find and parse the legend to learn symbol meanings
Step 2: Use learned symbols to count doors/windows accurately
Step 3: Works for ANY floor plan by learning its specific legend

NO HARDCODING - System learns from each drawing's legend.
"""

# =============================================================================
# PHASE 0: LEGEND DISCOVERY
# =============================================================================

LEGEND_DISCOVERY_PROMPT = """
# PHASE 0: FIND AND LEARN THE LEGEND

Before counting anything, you MUST find the legend/key on this drawing.

## TASK: Locate the "WINDOW/DOOR TAGS" legend or similar section

Look for a section on the drawing that shows:
- Symbol shapes with labels
- What each shape means (DOOR vs WINDOW)

## EXPECTED LEGEND FORMAT:

Architectural drawings typically show:
- HEXAGON shape (6-sided) with X = typically WINDOW
- CIRCLE shape with X = typically DOOR
- Variations may exist (double hexagon for mulled windows, etc.)

## EXTRACT THE LEGEND:

For EACH symbol shown in the legend, document:

SYMBOL 1:
  shape: "hexagon" | "circle" | "diamond" | "other"
  meaning: "WINDOW" | "DOOR" | "other"
  notes: "any additional info like 'mulled to window above/below'"

SYMBOL 2:
  shape: ___
  meaning: ___
  notes: ___

## OUTPUT FORMAT:

LEGEND FOUND: YES/NO
LEGEND LOCATION: [where on the drawing]

SYMBOL DEFINITIONS:
| Shape | Meaning | Notes |
|-------|---------|-------|
| hexagon | WINDOW | single window |
| hexagon (stacked) | WINDOW | mulled to window above/below |
| circle | DOOR | standard door |

## THIS IS CRITICAL:
The rest of the extraction DEPENDS on correctly identifying which shape = door vs window.
If the legend shows hexagon = window and circle = door, USE THAT.
If the legend shows something different, USE WHAT THE LEGEND SAYS.
"""

# =============================================================================
# PHASE 1: SYMBOL COUNTING (After Learning Legend)
# =============================================================================

SYMBOL_COUNTING_PROMPT = """
# SYMBOL COUNTING - Using Learned Legend

Based on the legend you just read:
- HEXAGON shapes = WINDOWS
- CIRCLE shapes = DOORS

Now scan the ENTIRE floor plan and count:

## STEP 1: COUNT ALL CIRCLE SYMBOLS (DOORS)

For each CIRCLE (door) tag number found:

CIRCLE TAG [number]:
  count: [how many circles with this number]
  locations: [list each location]

## STEP 2: COUNT ALL HEXAGON SYMBOLS (WINDOWS)

For each HEXAGON (window) tag number found:

HEXAGON TAG [number]:
  count: [how many hexagons with this number]
  locations: [list each location]

## SUMMARY TABLE:

### DOORS (Circle symbols):
| Tag # | Count | Locations |
|-------|-------|-----------|
| ___ | ___ | ___ |

TOTAL CIRCLE (DOOR) SYMBOLS: ___

### WINDOWS (Hexagon symbols):
| Tag # | Count | Locations |
|-------|-------|-----------|
| ___ | ___ | ___ |

TOTAL HEXAGON (WINDOW) SYMBOLS: ___

## VERIFICATION:
- Walk through each room and verify door circles
- Walk the perimeter and verify window hexagons
"""

# =============================================================================
# MASTER PROMPT: COMBINED LEGEND + COUNTING
# =============================================================================

LEGEND_DRIVEN_MASTER_PROMPT = """
# LEGEND-DRIVEN FLOOR PLAN EXTRACTION

This is a TWO-PHASE extraction:
1. Learn from the legend what symbols mean
2. Count those specific symbols accurately

---

## PHASE 1: FIND THE LEGEND

Look for "WINDOW/DOOR TAGS" or similar legend section on the drawing.

Typically shows:
- A HEXAGON shape with X inside = WINDOW
- A CIRCLE shape with X inside = DOOR
- Possibly other variations

DOCUMENT WHAT YOU FIND:

LEGEND SYMBOLS:
| Shape | Meaning |
|-------|---------|
| ___ | ___ |

---

## PHASE 2: COUNT BY SHAPE

Now that you know which shape = which type, scan the floor plan:

### DOORS (look for CIRCLE shapes with numbers):

Circle Tag 1: ___ count, locations: ___
Circle Tag 2: ___ count, locations: ___
Circle Tag 7: ___ count, locations: ___
Circle Tag 16: ___ count, locations: ___
[Add any other circle tags you find]

**TOTAL DOORS (circles): ___**

### WINDOWS (look for HEXAGON shapes with numbers):

Hexagon Tag 1: ___ count, locations: ___
Hexagon Tag 2: ___ count, locations: ___
[Add any other hexagon tags you find]

**TOTAL WINDOWS (hexagons): ___**

---

## PHASE 3: MATCH TO SCHEDULE

Now match your counts to the door/window schedule:

DOOR SCHEDULE (from drawing):
| Tag | Width | Height | Count Found |
|-----|-------|--------|-------------|
| ___ | ___ | ___ | ___ |

WINDOW SCHEDULE (from drawing):
| Tag | Width | Height | Count Found |
|-----|-------|--------|-------------|
| ___ | ___ | ___ | ___ |

---

## FINAL VERIFICATION:

Total door circles counted: ___
Total window hexagons counted: ___

Do these match your room-by-room verification? YES/NO
"""

# =============================================================================
# DETAILED SYMBOL GUIDE FOR GEMINI
# =============================================================================

SYMBOL_IDENTIFICATION_GUIDE = """
# HOW TO IDENTIFY DOOR vs WINDOW SYMBOLS

## HEXAGON (6-sided polygon) = WINDOW
```
    ___
   /   \
  /  1  \    <-- This is a WINDOW tag
  \     /        (hexagon shape with number inside)
   \___/
```

## CIRCLE = DOOR
```
   ___
  /   \
 |  2  |    <-- This is a DOOR tag
  \___/         (circular shape with number inside)
```

## MULLED WINDOW (stacked hexagons) = WINDOW
```
    ___
   /   \
  /  X  \
  \     /
   \___/     <-- Two hexagons stacked = mulled window
    ___
   /   \
  /  X  \
  \___/
```

## HOW TO COUNT:

1. IGNORE the door swing arcs for now
2. Look ONLY for the TAG SYMBOLS (circles and hexagons with numbers)
3. Each unique circle = one door location
4. Each unique hexagon = one window location

## COMMON MISTAKES:
- Confusing hexagon for circle (count edges!)
- Missing tags hidden near dimensions
- Double-counting shared doors between rooms
"""

# =============================================================================
# VERIFICATION PROMPT
# =============================================================================

SHAPE_VERIFICATION_PROMPT = """
# SHAPE VERIFICATION - CONFIRM YOUR COUNTS

You identified:
- Circles (DOORS): [your count]
- Hexagons (WINDOWS): [your count]

Let's verify by checking EACH room:

## ROOM-BY-ROOM VERIFICATION

For each room, list the TAG SHAPES you see:

GUEST SUITE:
- Door tags (circles): ___
- Window tags (hexagons): ___

BATH 4:
- Door tags (circles): ___
- Window tags (hexagons): ___

GYM/YOGA:
- Door tags (circles): ___
- Window tags (hexagons): ___

LAUNDRY:
- Door tags (circles): ___

MECH:
- Door tags (circles): ___

STORAGE:
- Door tags (circles): ___

LINEN:
- Door tags (circles): ___

REC ROOM:
- Door tags (circles): ___
- Window tags (hexagons): ___

## PERIMETER WALK (Windows only):
- North wall hexagons: ___
- South wall hexagons: ___
- East wall hexagons: ___
- West wall hexagons: ___

## FINAL COUNTS:
Total CIRCLE tags (doors): ___
Total HEXAGON tags (windows): ___
"""

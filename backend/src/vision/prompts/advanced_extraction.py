"""
Advanced Floor Plan Extraction Prompts
======================================
Designed with multi-scale feature extraction, line weight classification,
and symbol masking principles.

Inspired by Feature Pyramid Networks (FPN) - we process at multiple 
"resolutions" of detail in sequence.
"""

# =============================================================================
# PHASE 1: LINE WEIGHT CLASSIFICATION
# The "Gold Filter" - distinguishes structural from partition lines
# =============================================================================

LINE_WEIGHT_ANALYSIS_PROMPT = """
## PHASE 1: LINE WEIGHT CLASSIFICATION

You are analyzing an architectural floor plan. Your FIRST task is to classify 
ALL lines by their weight/thickness. This is CRITICAL for accurate material takeoff.

### LINE WEIGHT CATEGORIES:

1. **THICK LINES (Heavy Weight)** - Foundation/Structural
   - Outer perimeter walls (concrete foundation)
   - Load-bearing walls
   - These form the building envelope
   - IGNORE these for interior partition calculations

2. **MEDIUM LINES (Standard Weight)** - Interior Partitions
   - Standard interior walls
   - Room dividers
   - These are drywalled on BOTH SIDES
   - COUNT these for partition calculations

3. **THIN LINES (Light Weight)** - Details
   - Dimension lines
   - Leader lines
   - Hatch patterns
   - Cabinet outlines

4. **DASHED LINES** - Hidden/Above
   - Dropped ceilings
   - Bulkheads/soffits
   - Items above cut plane
   - Hidden structural elements

### TASK:
For each wall segment visible, classify it as:
- PERIMETER (thick line, foundation)
- PARTITION (medium line, interior)
- SOFFIT/DROPPED (dashed line)

List every wall segment with:
- Start/end points or room boundaries
- Length (from dimension strings)
- Line weight classification
- Direction (X-axis horizontal, Y-axis vertical)
"""

# =============================================================================
# PHASE 2: SYMBOL MASKING & DOOR/WINDOW INVENTORY
# See through furniture and overlays to count openings accurately
# =============================================================================

SYMBOL_INVENTORY_PROMPT = """
## PHASE 2: COMPLETE DOOR & WINDOW INVENTORY

You MUST identify EVERY door and window symbol on this floor plan.
Symbols may be PARTIALLY HIDDEN behind labels, furniture, or other overlays.

### DOOR IDENTIFICATION RULES:

1. **Door Swing Arcs** - Look for quarter-circle arcs indicating door swing
2. **Door Tags** - Hexagon or circle with number (e.g., ⬡1, ⬡2, ⬡16)
3. **Same Tag = Same Size** - Multiple doors with same tag are same dimensions
4. **Location Verification** - Note which room EACH door serves

### WINDOW IDENTIFICATION RULES:

1. **Window Symbols** - Parallel lines in wall with breaks
2. **Window Tags** - Diamond or oval with number
3. **Count Carefully** - Windows often appear in groups

### CRITICAL: COUNT EVERY INSTANCE

For each door tag number, list:
- Tag number
- EXACT count of doors with that tag
- Location of EACH door (which rooms it connects)
- Dimensions from schedule

For each window tag number, list:
- Tag number  
- EXACT count of windows with that tag
- Location of EACH window (which wall/room)
- Dimensions from schedule

### COMMON MISTAKES TO AVOID:
- Missing doors that share a wall with two rooms
- Undercounting doors when multiple have same tag
- Missing windows hidden behind dimension strings
- Confusing door swings with other arc symbols

PROVIDE A COMPLETE INVENTORY TABLE.
"""

# =============================================================================
# PHASE 3: MULTI-SCALE ROOM ANALYSIS
# FPN-inspired: Large scale (rooms) → Medium scale (walls) → Small scale (tags)
# =============================================================================

MULTI_SCALE_ANALYSIS_PROMPT = """
## PHASE 3: MULTI-SCALE ROOM & WALL ANALYSIS

Analyze this floor plan at THREE SCALES simultaneously:

### SCALE 1: MACRO (Building Level)
- Overall building footprint dimensions
- Total area (from annotation if present)
- Number of distinct rooms
- Perimeter shape (rectangular, L-shaped, etc.)

### SCALE 2: MESO (Room Level)
For EACH room, identify:
- Room name/label
- Approximate dimensions (from nearby dimension strings)
- Bounding walls (which walls define this room)
- Number of doors entering/exiting this room
- Number of windows

### SCALE 3: MICRO (Element Level)
For EACH wall segment:
- Length (exact, from dimension strings)
- Type (perimeter vs partition)
- Height variations (standard ceiling, dropped ceiling, soffit)
- Openings in this wall (doors/windows with sizes)

### ROOM-BY-ROOM INVENTORY:

Create a table with columns:
| Room Name | Dimensions | Doors (tags) | Windows (tags) | Ceiling Type | Wall Lengths |
"""

# =============================================================================
# PHASE 4: PARTITION END CAPS (Y-DIRECTION "POKE OUTS")
# The small but labor-intensive details
# =============================================================================

END_CAP_ANALYSIS_PROMPT = """
## PHASE 4: PARTITION END CAPS ANALYSIS

Identify all locations where interior partitions create "end caps" - 
the Y-direction faces where walls terminate or change direction.

### END CAP TYPES:

1. **T-Intersections** - Where one wall meets another perpendicular wall
   - Creates one exposed end face
   
2. **L-Corners** - Where two walls meet at a corner
   - Creates two exposed end faces
   
3. **Free-Standing Ends** - Where a partition ends without meeting another wall
   - Creates one exposed end face (most labor-intensive)

### FOR EACH END CAP:
- Location (which partition, near which room)
- Width of exposed face (partition thickness, typically 4.5" to 6.5")
- Height (ceiling height minus any soffit)
- Whether corner bead is required

### CRITICAL:
These are SMALL in square footage but HIGH in labor cost.
Every exterior corner requires corner bead.
"""

# =============================================================================
# PHASE 5: DROPPED CEILING / SOFFIT ANALYSIS
# =============================================================================

SOFFIT_ANALYSIS_PROMPT = """
## PHASE 5: DROPPED CEILING & SOFFIT ANALYSIS

Identify all areas where the ceiling height changes (soffits, bulkheads, dropped ceilings).

### IDENTIFICATION METHODS:

1. **Diagonal Hatching** - Often indicates dropped ceiling
2. **Labels** - "DROPPED CLG", "BULKHEAD", "SOFFIT"
3. **Dashed Lines** - Hidden items above cut plane
4. **Different Hatch Patterns** - Compare ceiling patterns across rooms

### FOR EACH SOFFIT/DROPPED CEILING:
- Location (hallway, over cabinets, etc.)
- Linear feet (total perimeter of dropped area)
- Drop height (typically 12" to 24")
- Is it a full dropped ceiling or just a perimeter soffit?

### VERTICAL FACES TO DRYWALL:
- Length of each vertical face
- Height of drop
- Total square footage of soffit faces
- Linear feet of corner bead required (top + bottom transitions)
"""

# =============================================================================
# PHASE 6: DIMENSION LINE ASSOCIATION (OCR + Spatial Anchoring)
# GNN-inspired: Connect dimension text to actual wall segments
# =============================================================================

DIMENSION_ASSOCIATION_PROMPT = """
## PHASE 6: DIMENSION LINE ASSOCIATION

Most extraction fails because models see "17'-8\"" but don't know WHICH WALL it measures.
You must TRACE the dimension to its anchor points.

### DIMENSION LINE ANATOMY:

```
    Extension Line (vertical)
           │
           │    ┌─────── Dimension Text ("17'-8\"")
           │    │
           ▼    ▼
    ┌──────────────────┐
    │◄───── 17'-8\" ────►│
    ┴                   ┴
    Tick Mark          Tick Mark
    (Start Point)      (End Point)
```

### ASSOCIATION RULES:

1. **Follow the Extension Lines** - These vertical lines connect the dimension to the actual wall
2. **Tick Marks Define Boundaries** - The small perpendicular marks show EXACTLY where measurement starts/ends
3. **Stacked Dimensions** - Multiple dimension strings may share extension lines
4. **Overall vs Detail** - Largest dimension is "overall", smaller ones are "detail strings"

### FOR EACH DIMENSION STRING:

| Dimension | Wall/Segment | Start Point | End Point | String Position |
|-----------|--------------|-------------|-----------|-----------------|
| 42'-1 1/2"| Perimeter N  | NW corner   | NE corner | Overall (outer) |
| 17'-9"    | Guest Suite  | W wall      | Bath wall | Detail (inner)  |

### ASSOCIATION TABLE:
For every dimension visible, identify:
1. The exact text (e.g., "35'-1 3/4\"")
2. WHAT it measures (which wall segment or room width)
3. The start anchor point
4. The end anchor point
5. Whether it's an OVERALL or DETAIL dimension

### CONFLICTS TO FLAG:
- Dimensions that don't clearly connect to any wall
- Overlapping dimensions that might cause double-counting
- Dimensions where extension lines are ambiguous
"""

# =============================================================================
# PHASE 7: REFERENCE POINT CALIBRATION (Sanity Checking)
# Establish the "Main Datum" for scale verification
# =============================================================================

CALIBRATION_PROMPT = """
## PHASE 7: REFERENCE POINT CALIBRATION

Establish the MAIN DATUM - the authoritative reference dimension.

### STEP 1: FIND THE MAIN DATUM

The Main Datum is typically:
- The LONGEST overall dimension on each axis
- Located on the OUTERMOST dimension string
- Represents the total building footprint

Example:
- X-Axis Main Datum: 42'-1 1/2" (total width)
- Y-Axis Main Datum: 42'-11 1/2" (total depth)

### STEP 2: VERIFY INTERNAL CONSISTENCY

All detail dimensions should SUM to the overall dimension:
```
Overall: 42'-1 1/2"
Details: 13'-4 3/4" + 8'-10 5/8" + 5'-8 3/8" + 7'-1 7/8" + 6'-11 3/4" = ?
```

If the sum doesn't match (within 1" tolerance), FLAG THE CONFLICT.

### STEP 3: SCALE VERIFICATION

If a graphic scale is shown (e.g., "SCALE: 1/4\" = 1'-0\""):
1. Measure the scale bar in the image
2. Calculate pixels-per-foot ratio
3. Spot-check a few dimensions
4. Flag any dimension where visual length differs >10% from stated dimension

### OUTPUT:

**Main Datum X:** [dimension] at [location]
**Main Datum Y:** [dimension] at [location]
**Scale:** [stated scale]
**Consistency Check:**
  - X-axis sum: [calculated] vs [overall] = MATCH/CONFLICT
  - Y-axis sum: [calculated] vs [overall] = MATCH/CONFLICT

**Flagged Conflicts:** [list any discrepancies]
"""

# =============================================================================
# PHASE 8: JUNCTION DETECTION (Prevent Double-Counting)
# Identify L, T, and X junctions to properly segment walls
# =============================================================================

JUNCTION_DETECTION_PROMPT = """
## PHASE 8: JUNCTION DETECTION

To calculate wall areas correctly, we must identify where walls MEET.
This prevents double-counting corners.

### JUNCTION TYPES:

```
L-JUNCTION (Corner)          T-JUNCTION                 X-JUNCTION (Cross)
                             
    Wall A                      Wall A                      Wall A
    │                           │                           │
    │                           │                           │
    └────── Wall B         ─────┼───── Wall B          ─────┼───── Wall B
                                │                           │
                           (Wall C below)              (Wall C below)
```

### L-JUNCTION RULES:
- Two walls meet at 90°
- One wall TERMINATES at the junction
- The terminating wall creates an END CAP (Y-direction face)
- Corner bead required at outside corners

### T-JUNCTION RULES:
- One wall continues THROUGH
- One wall terminates at the through wall
- The terminating wall creates an END CAP
- The continuous wall has NO break in area calculation

### X-JUNCTION RULES:
- Two walls cross each other
- All four segments are SEPARATE calculations
- No end caps (walls continue through)
- Rare in residential construction

### JUNCTION INVENTORY:

For each junction found, document:

| Junction ID | Type | Location | Walls Involved | End Caps Created |
|-------------|------|----------|----------------|------------------|
| J1          | L    | NW corner| Perimeter N/W  | 0 (perimeter)    |
| J2          | T    | Guest/Hall| Spine + Guest wall | 1 (Guest wall end) |
| J3          | T    | Bath/Spine| Spine + Bath wall | 1 (Bath wall end) |

### DOUBLE-COUNT PREVENTION:

For each interior partition:
1. Identify its START junction
2. Identify its END junction
3. Measure from junction to junction
4. Wall length = Junction-to-Junction distance
5. DO NOT extend measurement into the intersecting wall
"""

# =============================================================================
# PHASE 9: THE SUBTRACTION RULE (Net vs Gross)
# Wall Segment = Total Distance - (Door Swings + Openings)
# =============================================================================

SUBTRACTION_RULE_PROMPT = """
## PHASE 9: THE SUBTRACTION RULE

Calculate NET framing by subtracting openings from gross wall lengths.

### THE FORMULA:

```
Net Wall Length = Gross Wall Length - Σ(Opening Widths)
Net Wall Area = (Gross Length × Height) - Σ(Opening Areas)
```

### FOR EACH WALL SEGMENT:

**Step 1: Identify Gross Length**
- From dimension string, junction to junction

**Step 2: Identify ALL Openings in This Wall**
- List every door in this wall segment
- List every window in this wall segment
- Get dimensions from schedule

**Step 3: Calculate Net**

Example Calculation:
```
Wall: Central Spine (Guest/Bath side to Rec Room)
Gross Length: 35'-1 3/4" = 35.1458 ft

Openings in this wall:
- Door Tag 2 @ 2'-8" = 2.667 ft (Guest Suite entry)
- Door Tag 2 @ 2'-8" = 2.667 ft (Bath 4 entry)

Net Length = 35.1458 - 2.667 - 2.667 = 29.812 ft

Gross Area = 35.1458 × 9' × 2 sides = 632.62 sq ft
Opening Deductions = (2.667 × 8' × 2) + (2.667 × 8' × 2) = 85.33 sq ft
Net Area = 632.62 - 85.33 = 547.29 sq ft
```

### WALL-BY-WALL CALCULATION TABLE:

| Wall Segment | Gross Length | Openings | Opening Total | Net Length | Height | Sides | Gross Area | Net Area |
|--------------|--------------|----------|---------------|------------|--------|-------|------------|----------|
| Central Spine| 35.15 ft     | 2×D2     | 5.33 ft       | 29.82 ft   | 9 ft   | 2     | 632.62     | 547.29   |
| Guest/Bath   | 17.75 ft     | 1×D2     | 2.67 ft       | 15.08 ft   | 9 ft   | 2     | 319.50     | 271.50   |

### IMPORTANT NOTES:

1. **Openings affect BOTH sides** - If a door is in a partition, subtract from BOTH sides
2. **Headers remain** - Area above doors/windows is still drywalled
3. **Sills remain** - Area below windows is still drywalled
4. **Only subtract OPENING area** - Not the full wall-to-ceiling
"""

# =============================================================================
# PHASE 10: PARTITION ENTITY LOGIC
# The complete picture of each wall as an "entity"
# =============================================================================

PARTITION_ENTITY_PROMPT = """
## PHASE 10: PARTITION ENTITY LOGIC

Treat each wall segment as a discrete "ENTITY" with complete properties.

### WALL ENTITY SCHEMA:

```python
WallEntity = {
    "id": "W001",
    "name": "Central Spine",
    "type": "partition",  # perimeter | partition | soffit_face | end_cap
    
    # Geometry
    "direction": "X",  # X (horizontal) or Y (vertical)
    "gross_length_ft": 35.1458,
    "height_ft": 9.0,
    "thickness_in": 4.5,  # 2x4 stud
    
    # Junctions
    "start_junction": "J5",
    "end_junction": "J8",
    
    # Openings (subtractions)
    "openings": [
        {"type": "door", "tag": "2", "width_ft": 2.667, "height_ft": 8.0, "location": "Guest entry"},
        {"type": "door", "tag": "2", "width_ft": 2.667, "height_ft": 8.0, "location": "Bath entry"},
    ],
    
    # Surfaces
    "sides": 2,  # 1 for perimeter, 2 for partition
    "side_a_room": "Guest Suite/Bath 4",
    "side_b_room": "Rec Room",
    
    # Calculations
    "gross_area_sqft": 632.62,
    "opening_area_sqft": 85.33,
    "net_area_sqft": 547.29,
    
    # Corner bead (from end caps)
    "creates_end_caps": false,
    "corner_bead_ft": 0.0,
    
    # Special conditions
    "ceiling_condition": "standard",  # standard | dropped | varies
    "notes": []
}
```

### CREATE ENTITY FOR EACH:

1. **Perimeter Walls** (4 entities for rectangular building)
2. **Interior Partitions** (each continuous segment)
3. **Partition End Caps** (Y-direction faces at terminations)
4. **Soffit Faces** (vertical drops at ceiling changes)

### ENTITY INVENTORY TABLE:

| ID | Name | Type | Direction | Gross Len | Height | Sides | Openings | Net Area |
|----|------|------|-----------|-----------|--------|-------|----------|----------|
| W001 | Perimeter North | perimeter | X | 42.12 | 9.0 | 1 | 0 | 379.12 |
| W002 | Perimeter South | perimeter | X | 42.12 | 9.0 | 1 | 3×Win | 334.12 |
| W003 | Central Spine | partition | X | 35.15 | 9.0 | 2 | 2×D2 | 547.29 |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

### FINAL VALIDATION:

Sum of all Net Areas should equal total drywall required (before waste factor).
"""

# =============================================================================
# MASTER PROMPT - COMPREHENSIVE EXTRACTION
# =============================================================================

COMPREHENSIVE_EXTRACTION_PROMPT = """
# ARCHITECTURAL FLOOR PLAN ANALYSIS - COMPREHENSIVE EXTRACTION
## For Precise Drywall Material Takeoff

You are a senior construction estimator analyzing this floor plan. 
Your goal is ABSOLUTE PRECISION in counting and measuring every element.

---

## PART A: LINE CLASSIFICATION (The "Gold Filter")

First, classify every visible line:

### PERIMETER (Foundation/Structural - THICK lines)
- Outer walls that form the building envelope
- These are typically shown with THICK/HEAVY line weight
- List total linear feet of perimeter

### PARTITIONS (Interior - MEDIUM lines)  
- Interior room dividers
- These get drywall on BOTH sides
- CAREFULLY distinguish from perimeter

### DASHED (Hidden/Above)
- Dropped ceilings, soffits, bulkheads
- Items above the floor plan cut plane

---

## PART B: COMPLETE DOOR INVENTORY

**CRITICAL: Count EVERY door symbol on the plan.**

For EACH unique door tag number:
1. Tag number
2. Total COUNT of doors with this tag
3. Dimensions (width × height) from schedule
4. List EACH location:
   - Door #1 of this tag: [location]
   - Door #2 of this tag: [location]
   - etc.

**Expected format:**
```
DOOR TAG 1: (dimensions from schedule)
  Count: X doors total
  Locations:
    1. [Room A to Room B]
    2. [Room C to Hallway]
    
DOOR TAG 2: (dimensions from schedule)
  Count: Y doors total
  Locations:
    1. [Room D entry]
    ...
```

---

## PART C: COMPLETE WINDOW INVENTORY

For EACH unique window tag:
1. Tag number
2. Total COUNT of windows with this tag
3. Dimensions from schedule
4. List EACH location

---

## PART D: ROOM-BY-ROOM ANALYSIS

For EACH labeled room:
- Room name
- Bounding dimensions
- Doors (list each by tag number)
- Windows (list each by tag number)
- Ceiling type (standard / dropped)
- Wall segments defining the room

---

## PART E: DIMENSION STRING EXTRACTION

List ALL dimension strings visible on the plan:
- Horizontal strings (top to bottom)
- Vertical strings (left to right)
- Interior dimensions
- Overall dimensions

Format: "35'-1 3/4\"" → exactly as shown

---

## PART F: SPECIAL FEATURES

1. **Dropped Ceilings/Soffits**
   - Areas with diagonal hatching or "DROPPED CLG" labels
   - Perimeter lengths
   - Drop heights (if noted)

2. **Partition End Caps**
   - Where partitions terminate
   - T-intersections
   - L-corners

3. **Structural Elements**
   - Columns (usually small squares in walls)
   - Beams (dashed lines)

---

## OUTPUT FORMAT

Provide a STRUCTURED response with clear sections for each part above.
Use tables where appropriate.
BE EXPLICIT about counts - do not assume, COUNT EVERY INSTANCE.

If something is unclear or ambiguous, FLAG IT explicitly.
"""

# =============================================================================
# DOOR/WINDOW FOCUSED RECOUNT PROMPT
# For verification when counts seem incorrect
# =============================================================================

DOOR_WINDOW_RECOUNT_PROMPT = """
# DOOR & WINDOW RECOUNT - VERIFICATION PASS

Go through this floor plan SYSTEMATICALLY and count every door and window.

## COUNTING METHOD:

### Step 1: Identify ALL door swing arcs
- A door swing is a quarter-circle arc
- Trace each arc to find the door tag
- Mark each one as you count it

### Step 2: Match tags to schedule
- Find the door schedule on the drawing
- Note dimensions for each tag number

### Step 3: Verify by room
For each room, verify doors:
- REC ROOM: How many doors enter this room? List each tag.
- GUEST SUITE: How many doors? List each tag.
- BATH 4: How many doors? List each tag.
- GYM/YOGA: How many doors? List each tag.
- MECH: How many doors? List each tag.
- LAUNDRY: How many doors? List each tag.
- STORAGE: How many doors? List each tag.
- LINEN: How many doors? List each tag.

### Step 4: Cross-verify totals
- Sum doors by tag across all rooms
- Sum doors by room across all tags
- These totals should match

## EXPECTED OUTPUT:

### DOOR INVENTORY
| Tag | Size (W×H) | Count | Locations |
|-----|------------|-------|-----------|
| 1   | X × X      | N     | Room A, Room B, ... |
| 2   | X × X      | N     | Room C, Room D, ... |
| ... | ...        | ...   | ... |

TOTAL DOORS: [sum]

### WINDOW INVENTORY  
| Tag | Size (W×H) | Count | Locations |
|-----|------------|-------|-----------|
| 1   | X × X      | N     | Wall A, Wall B, ... |
| ... | ...        | ...   | ... |

TOTAL WINDOWS: [sum]

### VERIFICATION
- Doors by tag total: X
- Doors by room total: X
- Match: YES/NO

If counts don't match, identify the discrepancy.
"""

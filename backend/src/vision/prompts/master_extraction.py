"""
MASTER FLOOR PLAN EXTRACTION SYSTEM
====================================
Zero hardcoding - everything extracted dynamically from vision.

Multi-phase extraction with cross-validation:
1. Scale & Metadata
2. Room Detection
3. Door Inventory (with verification)
4. Window Inventory (with verification)
5. Wall Segmentation
6. Dimension Association
7. Special Features
8. Final Validation
"""

# =============================================================================
# PHASE 1: SCALE & METADATA EXTRACTION
# =============================================================================

PHASE_1_SCALE_METADATA = """
# PHASE 1: SCALE & METADATA EXTRACTION

Extract all metadata and establish the drawing scale.

## TASK 1.1: Document Information
- Sheet number (e.g., "A100")
- Drawing title
- Project name (if visible)
- Date/revision info

## TASK 1.2: Scale Information
- Stated scale (e.g., "1/4\" = 1'-0\"")
- Graphic scale bar (if present)
- North arrow orientation

## TASK 1.3: Area Annotation
- Total area callout (e.g., "1,556 SQ. FT.")
- Floor level (Basement, Main, Upper)

## TASK 1.4: Legend/Key
List ALL legend items visible:
- Hatching patterns and their meanings
- Symbol definitions
- Material codes

## OUTPUT FORMAT (JSON-like):
```
METADATA:
  sheet_number: "___"
  title: "___"
  scale: "___"
  total_area_sqft: ___
  floor_level: "___"
  
LEGEND:
  - pattern: "diagonal hatch", meaning: "___"
  - pattern: "cross hatch", meaning: "___"
  - symbol: "___", meaning: "___"
```
"""

# =============================================================================
# PHASE 2: ROOM DETECTION
# =============================================================================

PHASE_2_ROOM_DETECTION = """
# PHASE 2: COMPLETE ROOM DETECTION

Identify EVERY labeled room/space on this floor plan.

## TASK 2.1: Find ALL Room Labels
Scan the entire drawing for room name text.
Include:
- Named rooms (REC ROOM, GUEST SUITE, etc.)
- Abbreviated spaces (MECH, LNDRY, etc.)
- Closets and storage
- Hallways/corridors
- Stairwells

## TASK 2.2: For EACH Room Found
Document:
1. Room name (exactly as labeled)
2. Approximate location (NW quadrant, center, etc.)
3. Rough dimensions if visible nearby
4. Ceiling type (standard, dropped, open to above)

## OUTPUT FORMAT:
```
ROOMS DETECTED: [count]

ROOM 1:
  name: "___"
  location: "___"
  ceiling: "standard" | "dropped" | "open"
  
ROOM 2:
  name: "___"
  ...
```

## VERIFICATION:
After listing all rooms, verify:
- Total room count matches what you see
- No duplicate entries
- No rooms missed in corners or under stairs
"""

# =============================================================================
# PHASE 3: DOOR INVENTORY (CRITICAL - MUST BE ACCURATE)
# =============================================================================

PHASE_3_DOOR_INVENTORY = """
# PHASE 3: COMPLETE DOOR INVENTORY

⚠️ THIS IS CRITICAL - COUNT EVERY SINGLE DOOR

## DETECTION METHOD:

### Step 1: Find ALL Door Swing Arcs
- Door swings appear as quarter-circle arcs
- Each arc = one door
- Trace EVERY arc you see

### Step 2: Find ALL Door Tags
- Tags are typically circles, hexagons, or diamonds with numbers
- Same tag number = same door size (from schedule)

### Step 3: Find the Door Schedule
- Usually in a table/legend area
- Lists tag number, width, height, type/description

### Step 4: Match Tags to Swings
- For each swing arc, find its corresponding tag
- If no tag visible, note as "untagged"

## COUNTING RULES:
- Double doors = 1 unit (but note as double)
- Sliding doors = count even without swing arc
- Closet doors = count these too
- Pocket doors = look for dashed lines in walls

## FOR EACH DOOR TAG:

TAG [number]:
  size_width: "___"
  size_height: "___"
  type: "swing" | "slider" | "double" | "pocket" | "bifold"
  total_count: [number]
  locations:
    1. [which room/wall]
    2. [which room/wall]
    ...

## VERIFICATION CHECKLIST:
After counting, verify by room:

□ REC ROOM: How many doors provide access? List each.
□ GUEST SUITE: How many doors? (entry + closet + bathroom)
□ BATH: How many doors? (could be Jack & Jill with 2 entries)
□ GYM/YOGA: How many doors?
□ MECH: How many doors?
□ LAUNDRY: How many doors?
□ STORAGE: How many doors?
□ LINEN/CLOSETS: How many doors?

## FINAL COUNT:
Sum all doors from all tags = TOTAL DOORS: ___

Cross-check: Sum doors by room should equal sum by tag.
"""

# =============================================================================
# PHASE 4: WINDOW INVENTORY
# =============================================================================

PHASE_4_WINDOW_INVENTORY = """
# PHASE 4: COMPLETE WINDOW INVENTORY

## DETECTION METHOD:

### Step 1: Find ALL Window Symbols
Windows appear as:
- Parallel lines breaking through wall lines
- May have center lines or mullion indicators
- Often on exterior walls only

### Step 2: Find ALL Window Tags
- Tags are typically diamonds, ovals, or circles with numbers
- Located near the window symbol

### Step 3: Find the Window Schedule
- Lists tag number, width, height, type

### Step 4: Count by Location
- Basement windows are typically smaller (egress requirements)
- Multiple windows may share a wall

## FOR EACH WINDOW TAG:

TAG [number]:
  size_width: "___"
  size_height: "___"  
  type: "fixed" | "casement" | "slider" | "awning"
  total_count: [number]
  locations:
    1. [which wall/room]
    2. [which wall/room]
    ...

## VERIFICATION:
Walk the perimeter mentally:
- North wall: ___ windows
- South wall: ___ windows
- East wall: ___ windows
- West wall: ___ windows

TOTAL WINDOWS: ___
"""

# =============================================================================
# PHASE 5: WALL SEGMENTATION
# =============================================================================

PHASE_5_WALL_SEGMENTATION = """
# PHASE 5: WALL SEGMENTATION

Identify every distinct wall segment.

## WALL CATEGORIES:

### Category A: PERIMETER WALLS (Foundation)
- Outer building envelope
- Typically THICK line weight
- Usually concrete/masonry in basement

### Category B: INTERIOR PARTITIONS
- Room dividers inside the building
- Typically MEDIUM line weight
- Wood/metal stud framing

### Category C: PARTITION END CAPS
- Where partitions terminate (Y-direction faces)
- Small area but need corner bead

### Category D: SOFFIT/BULKHEAD FACES
- Vertical faces at ceiling height changes
- Indicated by dashed lines or hatching

## FOR EACH WALL SEGMENT:

SEGMENT [ID]:
  category: "perimeter" | "partition" | "end_cap" | "soffit"
  direction: "X" (horizontal) | "Y" (vertical)
  length_dimension: "[exact string from plan]"
  start_point: "[description]"
  end_point: "[description]"
  doors_in_wall: [list of door tags]
  windows_in_wall: [list of window tags]
  ceiling_condition: "standard" | "dropped" | "varies"

## JUNCTION DETECTION:
List all wall intersections:
- L-junctions (corners)
- T-junctions (one wall terminates)
- X-junctions (walls cross)
"""

# =============================================================================
# PHASE 6: DIMENSION EXTRACTION
# =============================================================================

PHASE_6_DIMENSION_EXTRACTION = """
# PHASE 6: DIMENSION STRING EXTRACTION

Extract EVERY dimension visible on the plan.

## DIMENSION STRING FORMAT:
Architectural dimensions appear as: [feet]'-[inches] [fraction]"
Examples: 42'-1 1/2", 17'-9", 5'-0 1/2"

## EXTRACTION BY LOCATION:

### HORIZONTAL DIMENSIONS (Top of drawing, left to right):
OVERALL: "___"
STRING 1 (outermost): [list each segment]
STRING 2 (inner): [list each segment]
STRING 3 (detail): [list each segment]

### HORIZONTAL DIMENSIONS (Bottom of drawing):
OVERALL: "___"
STRING 1: [list each segment]
...

### VERTICAL DIMENSIONS (Left side, top to bottom):
OVERALL: "___"
STRING 1: [list each segment]
...

### VERTICAL DIMENSIONS (Right side):
OVERALL: "___"
STRING 1: [list each segment]
...

### INTERIOR DIMENSIONS:
[List any dimensions inside the floor plan]

## DIMENSION ASSOCIATION:
For each dimension, identify WHAT it measures:
- "42'-1 1/2\"" measures: [overall building width]
- "17'-9\"" measures: [Guest Suite to Bath wall]
...

## VALIDATION:
Check that detail dimensions sum to overall:
- Horizontal: [sum] vs [overall] = MATCH/MISMATCH
- Vertical: [sum] vs [overall] = MATCH/MISMATCH
"""

# =============================================================================
# PHASE 7: SPECIAL FEATURES
# =============================================================================

PHASE_7_SPECIAL_FEATURES = """
# PHASE 7: SPECIAL FEATURES EXTRACTION

## 7A: DROPPED CEILINGS / SOFFITS
For each area with ceiling height change:
- Location
- Extent (dimensions or description)
- Drop height (if noted)
- Hatching pattern used

## 7B: MECHANICAL EQUIPMENT
List all equipment symbols:
- FAU (Furnace)
- Water heater
- W/D (Washer/Dryer)
- Floor drains
- Exhaust/intake locations

## 7C: PLUMBING FIXTURES
- Toilets
- Sinks/vanities
- Tubs/showers
- Washer/dryer hookups

## 7D: STRUCTURAL ELEMENTS
- Columns (typically small squares)
- Beams (dashed lines)
- Load-bearing wall indicators

## 7E: STAIRS
- Direction (UP/DOWN arrow)
- Width
- Open to above?

## 7F: ANNOTATIONS & NOTES
List ALL text annotations:
- Construction notes
- Material callouts
- Reference markers (A400, etc.)
"""

# =============================================================================
# PHASE 8: FINAL VALIDATION & SUMMARY
# =============================================================================

PHASE_8_VALIDATION = """
# PHASE 8: FINAL VALIDATION & SUMMARY

## CROSS-VALIDATION CHECKS:

### Check 1: Door Count Verification
Total doors by tag: ___
Total doors by room: ___
MATCH: YES/NO

### Check 2: Window Count Verification  
Total windows by tag: ___
Total windows by wall: ___
MATCH: YES/NO

### Check 3: Dimension Consistency
Horizontal sum vs overall: ___
Vertical sum vs overall: ___
MATCH: YES/NO

### Check 4: Room Coverage
All rooms have identified walls: YES/NO
All rooms have door access: YES/NO

## CONFIDENCE FLAGS:
List any items with uncertainty:
- "Door tag X location unclear"
- "Dimension Y may be obscured"
- etc.

## FINAL SUMMARY:

DOCUMENT: [sheet number]
SCALE: [scale]
TOTAL AREA: [sqft]

ROOMS: [count]
  [list each]

DOORS: [total count]
  [breakdown by tag]

WINDOWS: [total count]
  [breakdown by tag]

PERIMETER LENGTH: [feet]
INTERIOR PARTITION LENGTH: [feet]
SOFFIT/DROPPED AREAS: [list]

READY FOR CALCULATION: YES/NO
"""

# =============================================================================
# MASTER PROMPT - SINGLE COMPREHENSIVE EXTRACTION
# =============================================================================

MASTER_EXTRACTION_PROMPT = """
# COMPREHENSIVE FLOOR PLAN EXTRACTION
## For Construction Material Takeoff

You are a senior construction estimator with 20+ years of experience.
Analyze this architectural floor plan with ABSOLUTE PRECISION.

---

## SECTION A: DOCUMENT METADATA

1. Sheet number: ___
2. Drawing title: ___
3. Scale: ___
4. Total area (if noted): ___ sq ft
5. Floor level: ___

---

## SECTION B: ROOM INVENTORY

List EVERY labeled room/space:

| # | Room Name | Location | Ceiling Type |
|---|-----------|----------|--------------|
| 1 | ___ | ___ | standard/dropped |
| 2 | ___ | ___ | ___ |
...

TOTAL ROOMS: ___

---

## SECTION C: DOOR SCHEDULE & INVENTORY

### C1: Door Schedule (from drawing)
| Tag | Width | Height | Type/Notes |
|-----|-------|--------|------------|
| ___ | ___ | ___ | ___ |
...

### C2: Door Count by Tag
⚠️ COUNT EVERY DOOR - including sliders, closets, double doors

| Tag | Count | Each Location |
|-----|-------|---------------|
| ___ | ___ | 1. ___, 2. ___, ... |
...

### C3: Door Verification by Room
| Room | Doors (list tags) | Count |
|------|-------------------|-------|
| ___ | ___ | ___ |
...

**TOTAL DOORS: ___**

---

## SECTION D: WINDOW SCHEDULE & INVENTORY

### D1: Window Schedule (from drawing)
| Tag | Width | Height | Type |
|-----|-------|--------|------|
| ___ | ___ | ___ | ___ |
...

### D2: Window Count by Tag
| Tag | Count | Each Location |
|-----|-------|---------------|
| ___ | ___ | 1. ___, 2. ___, ... |
...

**TOTAL WINDOWS: ___**

---

## SECTION E: DIMENSION STRINGS

### E1: Overall Dimensions
- Building Width (X): ___
- Building Depth (Y): ___

### E2: All Dimension Strings (list every one you see)
| Dimension | Measures What |
|-----------|---------------|
| ___ | ___ |
...

---

## SECTION F: WALL IDENTIFICATION

### F1: Perimeter Walls
| Wall | Length | Windows | Doors |
|------|--------|---------|-------|
| North | ___ | ___ | ___ |
| South | ___ | ___ | ___ |
| East | ___ | ___ | ___ |
| West | ___ | ___ | ___ |

### F2: Interior Partitions
| Partition | Length | Doors | Rooms Separated |
|-----------|--------|-------|-----------------|
| ___ | ___ | ___ | ___ |
...

---

## SECTION G: SPECIAL FEATURES

### G1: Dropped Ceilings/Soffits
| Area | Extent | Drop Height |
|------|--------|-------------|
| ___ | ___ | ___ |
...

### G2: Other Features
- Stairs: ___
- Equipment: ___
- Columns: ___

---

## SECTION H: VALIDATION

✓/✗ All doors counted and located
✓/✗ All windows counted and located  
✓/✗ All dimensions extracted
✓/✗ All rooms identified
✓/✗ Door count by tag = Door count by room

**EXTRACTION CONFIDENCE: HIGH / MEDIUM / LOW**

**ISSUES/UNCERTAINTIES:**
- ___
"""

# =============================================================================
# VERIFICATION PROMPT - RUN AFTER INITIAL EXTRACTION
# =============================================================================

VERIFICATION_PROMPT = """
# EXTRACTION VERIFICATION

Review your previous extraction and verify accuracy.

## DOOR VERIFICATION

You said there are [X] total doors. Let's verify:

For EACH room, count doors again:
1. [Room A]: ___ doors (tags: ___)
2. [Room B]: ___ doors (tags: ___)
...

Sum: ___ doors

Does this match your original count? YES/NO
If NO, identify the discrepancy.

## WINDOW VERIFICATION

You said there are [X] total windows. Let's verify:

Walk the perimeter:
- North wall: ___ windows
- South wall: ___ windows
- East wall: ___ windows
- West wall: ___ windows

Sum: ___ windows

Does this match? YES/NO

## DIMENSION VERIFICATION

Check that detail dimensions sum to overall:
Horizontal: ___ + ___ + ___ = ___ (Overall: ___)
Vertical: ___ + ___ + ___ = ___ (Overall: ___)

Match within 1"? YES/NO

## CORRECTED COUNTS (if any):
- Doors: ___
- Windows: ___
- Discrepancies found: ___
"""

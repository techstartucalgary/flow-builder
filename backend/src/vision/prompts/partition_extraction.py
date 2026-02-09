"""
INTERIOR PARTITION EXTRACTION PROMPT
=====================================
Specialized prompt for identifying interior partition walls,
categorizing by orientation (Vertical/Horizontal), and parsing dimensions.
"""

INTERIOR_PARTITION_EXTRACTION_PROMPT = """
# INTERIOR PARTITION WALL EXTRACTION

Your task: Identify ALL interior partition walls (NOT exterior walls), categorize by orientation, and extract dimensions.

## PHASE 1: DISTINGUISH WALL TYPES

### Exterior Walls (EXCLUDE from this analysis):
- These are the THICKEST lines on the plan
- Form the outer perimeter/boundary
- Usually 6" to 12" thick on the drawing
- Examples: North, South, East, West foundation walls

### Interior Partitions (INCLUDE - this is what we want):
- THINNER lines than exterior walls
- Divide interior spaces into rooms
- Usually 4" to 6" thick on drawing (standard 2x4 or 2x6 stud walls)
- Run BETWEEN rooms, not on the outer perimeter

## PHASE 2: CATEGORIZE BY ORIENTATION

For each interior partition, determine if it runs:
- **VERTICAL (V)**: Runs primarily North-South (up/down on the page)
- **HORIZONTAL (H)**: Runs primarily East-West (left/right on the page)

## PHASE 3: EXTRACT DIMENSIONS

For each interior partition:
1. **Find the dimension string** near that wall
   - Look for format: "12'-4"" or "8'-6 3/4"" 
   - Dimension strings are usually parallel to the wall
2. **Parse the measurement**:
   - Extract feet and inches
   - Convert fractions (1/2, 3/4, 1/4, etc.)
3. **Associate with wall segment**

## PHASE 4: OUTPUT FORMAT

List each interior partition:

```
INTERIOR PARTITIONS:

VERTICAL SEGMENTS (North-South):
1. [Room A] to [Room B] partition: [dimension] ft
   Location: [describe - e.g., "East side of Guest Suite"]
   Dimension marking: "[raw string from plan]"
   
2. [Next V partition]...

HORIZONTAL SEGMENTS (East-West):
1. [Room C] to [Room D] partition: [dimension] ft
   Location: [describe]
   Dimension marking: "[raw string]"

2. [Next H partition]...
```

## SPECIFIC GUIDANCE:

### What to INCLUDE:
✓ Walls separating Guest Suite from hallway
✓ Walls creating closets (walk-in closets have walls!)
✓ Bathroom interior walls (shower stalls, toilet rooms)
✓ Walls between utility rooms (Laundry, Mech, Storage)
✓ Partition creating Gym/Yoga space
✓ Any wall that is NOT on the outer perimeter

### What to EXCLUDE:
✗ The thick outer foundation/exterior walls
✗ Stair walls (structural, not partition)
✗ Any wall on the building perimeter

## EXAMPLE OUTPUT:

```
INTERIOR PARTITIONS:

VERTICAL SEGMENTS (North-South):
1. Guest Suite to Bath 4 partition: 12.4 ft
   Location: East wall of Guest Suite, separates suite from bathroom
   Dimension marking: "12'-4 3/4""
   
2. Hallway to Laundry partition: 6.0 ft
   Location: West side of hallway
   Dimension marking: "6'-0""

HORIZONTAL SEGMENTS (East-West):
1. Bath 4 north wall: 8.5 ft
   Location: Separates Bath 4 from hallway
   Dimension marking: "8'-6""

TOTALS:
- Vertical segments: [X] partitions, [Y.Y] total linear feet
- Horizontal segments: [X] partitions, [Y.Y] total linear feet
- TOTAL INTERIOR PARTITIONS: [Z.Z] linear feet
```

## CRITICAL REMINDERS:

1. **Line Weight**: Exterior walls are THICKER. Look for the thinner lines inside.
2. **Dimension Association**: Match each dimension string to its wall by proximity and parallelism
3. **Fraction Parsing**: "3/4" = 0.75, "1/2" = 0.5, "1/4" = 0.25
4. **Double-check**: Every interior room boundary should have a partition wall
5. **Systematic Scan**: Go room by room - Guest Suite, Bath, Gym, Laundry, Mech, Storage

Now analyze the floor plan and extract ALL interior partitions.
"""

COMBINED_PARTITION_AND_DIMENSION_PROMPT = """
# COMPLETE INTERIOR PARTITION ANALYSIS

## STEP 1: IDENTIFY LINE WEIGHTS

Scan the floor plan and classify walls:
- **THICK LINES** (6-12" on drawing) = Exterior/foundation walls → EXCLUDE
- **THIN LINES** (4-6" on drawing) = Interior partitions → INCLUDE

## STEP 2: EXTRACT INTERIOR PARTITIONS

For each interior partition (thin line dividing rooms):

### A. Determine Orientation:
- **V** (Vertical): Runs North-South (up/down on page)
- **H** (Horizontal): Runs East-West (left/right on page)

### B. Find Associated Dimension:
- Look for dimension string parallel to this wall
- Dimension strings format: "12'-4"" or "8'-6 3/4""

### C. Parse Dimension:
- Extract: Feet, Inches, Fraction
- Convert to decimal feet: Feet + (Inches/12) + (Fraction/12)

### D. Identify Rooms:
- What rooms does this partition separate?

## STEP 3: OUTPUT TABLE

```
INTERIOR PARTITION WALLS (Vertical & Horizontal)

ID | Orient | Rooms Separated              | Dimension String | Decimal Ft | Notes
---|--------|------------------------------|------------------|------------|----------
V1 | V      | Guest Suite / Bath 4         | "12'-4 3/4""     | 12.40      | East wall
V2 | V      | Hallway / Laundry            | "6'-0""          | 6.00       | West side
V3 | V      | Guest Suite closet wall      | "8'-6""          | 8.50       | Interior
H1 | H      | Bath 4 / Hallway             | "15'-0""         | 15.00      | North wall
H2 | H      | Mech / Hallway               | "8'-0""          | 8.00       | Separates utility
H3 | H      | Storage partition            | "10'-0""         | 10.00      | Under stairs
...

SUMMARY:
- Vertical (V) partitions: [count] segments = [total] linear ft
- Horizontal (H) partitions: [count] segments = [total] linear ft
- TOTAL INTERIOR PARTITIONS: [sum] linear ft

All interior partitions are DOUBLE-SIDED (both sides get drywall).
Gross drywall area = [sum] ft × 9.0 ft ceiling × 2 sides = [total] sq ft
```

## STEP 4: VALIDATION CHECKLIST

For each room, verify ALL partition walls are captured:
- [ ] Guest Suite: walls to Bath, Closet, Hallway
- [ ] Bath 4: interior walls separating areas
- [ ] Gym/Yoga: partition walls creating the space
- [ ] Laundry: walls separating from hallway
- [ ] Mech: walls around mechanical room
- [ ] Storage: walls creating storage area

Now analyze the floor plan and complete the extraction.
"""

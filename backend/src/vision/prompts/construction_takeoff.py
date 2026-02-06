"""Construction takeoff prompts for floor plan analysis."""

COMPREHENSIVE_FLOORPLAN_PROMPT = """
Analyze this construction floor plan and extract ALL details for material takeoff.
Be thorough and precise. If something is unclear, note it explicitly.

## Extract the following:

### 1. WALLS
- Identify all wall segments (foundation walls, partition studs, load-bearing, etc.)
- Note wall types, thicknesses, and materials if shown in legend
- List all wall dimensions (X and Y directions)
- Identify end-caps, corners, and vertical soffit faces

### 2. DIMENSIONS & MEASUREMENTS
- List ALL dimension strings shown on the plan
- Note overall dimensions and individual room dimensions
- Extract any height specifications (ceiling heights, dropped ceilings, bulkheads)

### 3. SCALE & UNITS
- Identify the drawing scale (e.g., 1/4"=1'-0")
- Note the units used (feet, inches, meters)

### 4. LEGENDS & SYMBOLS
- List all legend items (material codes, wall types, symbols)
- Note any special symbols (electrical, plumbing, HVAC)
- Identify color codes or hatch patterns

### 5. WINDOWS & DOORS
- List all window and door tags/labels
- Note schedules if present (sizes, types, quantities)
- Identify locations and rough openings

### 6. ROOMS & SPACES
- List all room labels and names
- Note any special areas (dropped ceilings, bulkheads, mechanical rooms)

### 7. TEXT ANNOTATIONS
- Extract ALL text, notes, and callouts visible on the plan
- Include revision notes, stamps, and general notes

### 8. SPECIAL FEATURES
- Identify any bulkheads, soffits, or ceiling variations
- Note structural elements (beams, columns, footings)

## Output Format:
Organize findings clearly under each category above.
Flag any ambiguities or illegible details.
"""

QUICK_SUMMARY_PROMPT = """
Provide a concise summary of this floor plan:
- Overall dimensions
- Number of rooms
- Key features
- Any special notes or considerations for construction takeoff
"""

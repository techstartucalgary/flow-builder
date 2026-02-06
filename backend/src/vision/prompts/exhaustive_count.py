"""
EXHAUSTIVE COUNTING PROMPT
==========================
A highly detailed, room-by-room counting methodology
that forces the model to check every possible location.
"""

EXHAUSTIVE_DOOR_COUNT_PROMPT = """
# EXHAUSTIVE DOOR COUNT - CHECK EVERY LOCATION

The legend shows: CIRCLE = DOOR

You MUST check every single location where a door could exist.
Go through this checklist ONE BY ONE.

## CHECKLIST - Check each location for a CIRCLE door tag:

### GUEST SUITE AREA:
□ 1. Guest Suite ENTRY door (from hallway/rec room): Circle? Tag #___
□ 2. Guest Suite CLOSET door (walk-in closet inside suite): Circle? Tag #___
□ 3. Guest Suite to BATH 4 door (connecting door): Circle? Tag #___

### BATH 4 AREA (Jack & Jill - may have 2 entries!):
□ 4. Bath 4 door FROM Guest Suite: Circle? Tag #___
□ 5. Bath 4 door FROM Hallway: Circle? Tag #___
(Note: These could be the SAME door or TWO DIFFERENT doors!)

### GYM/YOGA AREA:
□ 6. Gym/Yoga ENTRY door (from hallway): Circle? Tag #___ (Double door? Y/N)

### HALLWAY/UTILITY AREAS:
□ 7. LAUNDRY room entry door: Circle? Tag #___
□ 8. LINEN closet door (small closet in hallway): Circle? Tag #___
□ 9. MECH room entry door: Circle? Tag #___

### REC ROOM / LOWER AREAS:
□ 10. STORAGE room door (under stairs): Circle? Tag #___
□ 11. Any EXTERIOR slider/door to outside: Circle? Tag #___

### ANY OTHER DOORS:
□ 12. Any doors I haven't listed: ___

## NOW SUM UP:

Count circles found at each location above:
Location 1: Tag ___ (1 circle)
Location 2: Tag ___ (1 circle)
...etc...

TOTAL CIRCLES (DOORS): ___

## VERIFY TAG BREAKDOWN:
- Tag 1 circles: ___ at [locations]
- Tag 2 circles: ___ at [locations]
- Tag 7 circles: ___ at [locations]
- Tag 16 circles: ___ at [locations]
- Other tags: ___ at [locations]

SUM: ___ doors

Expected: 11 doors. Did you find 11? If not, re-check the locations above.
"""

EXHAUSTIVE_WINDOW_COUNT_PROMPT = """
# EXHAUSTIVE WINDOW COUNT - CHECK EVERY PERIMETER LOCATION

The legend shows: HEXAGON = WINDOW

Windows are ONLY on exterior perimeter walls.
Walk around the building perimeter and count EVERY hexagon.

## PERIMETER WALK:

### NORTH WALL (top of plan):
Starting from NW corner, moving right:
□ Window 1: Hexagon? Tag #___ Location: ___
□ Window 2: Hexagon? Tag #___ Location: ___
□ Window 3: Hexagon? Tag #___ Location: ___
(Continue until NE corner)

### EAST WALL (right side of plan):
Starting from NE corner, moving down:
□ Any windows? Hexagon? Tag #___

### SOUTH WALL (bottom of plan - REC ROOM AREA):
Starting from SE corner, moving left:
□ Window A: Hexagon? Tag #___ Location: ___
□ Window B: Hexagon? Tag #___ Location: ___
□ Window C: Hexagon? Tag #___ Location: ___
(Continue until SW corner)

### WEST WALL (left side of plan):
Starting from SW corner, moving up:
□ Any windows? Hexagon? Tag #___

## SUM UP:
- North wall: ___ hexagons
- East wall: ___ hexagons
- South wall: ___ hexagons
- West wall: ___ hexagons

TOTAL HEXAGONS (WINDOWS): ___

## TAG BREAKDOWN:
- Tag 1 hexagons: ___ at [locations]
- Tag 2 hexagons: ___ at [locations]
- Other tags: ___

Expected: 4 windows (3 Tag 1 + 1 Tag 2). Did you find 4?
"""

COMBINED_EXHAUSTIVE_PROMPT = """
# COMPLETE EXHAUSTIVE COUNT

## PART 1: LEGEND CHECK
What does the legend show?
- HEXAGON = ___
- CIRCLE = ___

## PART 2: DOOR COUNT (Circle symbols)

Check EVERY location below for a CIRCLE door tag:

### GUEST SUITE AREA:
1. Guest Suite ENTRY from hallway: Tag #___
2. Guest Suite CLOSET (inside): Tag #___

### BATH 4:
3. Bath 4 entry from GUEST SUITE: Tag #___
4. Bath 4 entry from HALLWAY: Tag #___ (separate door or same as #3?)

### GYM/YOGA:
5. Gym ENTRY (double door?): Tag #___

### UTILITY ROOMS:
6. LAUNDRY entry: Tag #___
7. LINEN closet: Tag #___
8. MECH room entry: Tag #___

### STORAGE/REC:
9. STORAGE (under stairs): Tag #___

### OTHER:
10. Any other doors: Tag #___ at ___
11. Any other doors: Tag #___ at ___

**TOTAL DOOR CIRCLES: ___**

## PART 3: WINDOW COUNT (Hexagon symbols)

Walk the perimeter:
- SOUTH wall (Rec Room): ___ hexagons, Tags: ___
- WEST wall (Guest Suite): ___ hexagons, Tags: ___
- NORTH wall: ___ hexagons, Tags: ___
- EAST wall: ___ hexagons, Tags: ___

**TOTAL WINDOW HEXAGONS: ___**

## EXPECTED TOTALS:
- Doors: 11 circles
- Windows: 4 hexagons

Do your counts match? If not, go back and re-check.
"""

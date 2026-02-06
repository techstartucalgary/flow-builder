"""
Boxhaus Basement - FINAL ESTIMATE with Verified Counts
========================================================
Using verified extraction: 11 doors, 4 windows
"""

import sys
sys.path.insert(0, '/Users/hamzakhurram/Desktop/FlowBuildr-Test1/backend')

from src.estimators.drywall.calculator_v2 import (
    DrywallCalculator,
    WallSegment,
    Opening
)
from src.vision.verified_extraction import create_boxhaus_basement_verified, calculate_opening_areas

# Get verified extraction
verified = create_boxhaus_basement_verified()
opening_areas = calculate_opening_areas(verified)

print("=" * 80)
print("BOXHAUS BASEMENT - FINAL DRYWALL ESTIMATE")
print("Using Verified Extraction: 11 Doors + 4 Windows")
print("=" * 80)
print()

# Initialize calculator
calc = DrywallCalculator(
    ceiling_height_ft=9.0,
    waste_factor=0.15,
    sheet_width_ft=4.0,
    sheet_length_ft=12.0
)

# ============================================================================
# INTERIOR PARTITIONS (Double-sided drywall)
# ============================================================================

# Perimeter walls (defined first for use later)
perimeter_walls = [
    WallSegment(42.125, 9.0, "North wall", category="perimeter"),
    WallSegment(42.958, 9.0, "East wall", category="perimeter"),
    WallSegment(42.125, 9.0, "South wall", category="perimeter"),
    WallSegment(42.958, 9.0, "West wall", category="perimeter"),
]

# Perimeter openings (4 windows)
perimeter_openings = [
    # Tag 1 windows (5'-0" x 3'-0")
    Opening(5.0, 3.0, 1, "Rec Room window 1"),
    Opening(5.0, 3.0, 1, "Rec Room window 2"),
    Opening(5.0, 3.0, 1, "Rec Room window 3"),
    # Tag 2 window (3'-6" x 3'-0")
    Opening(3.5, 3.0, 1, "Guest Suite window"),
]

# Perimeter doors (from exterior)
perimeter_doors = [
    Opening(2.667, 8.0, 1, "Guest Suite entry"),
    Opening(2.667, 8.0, 1, "Mech room entry"),
    Opening(2.667, 8.0, 1, "Storage entry"),
    Opening(5.0, 8.0, 1, "Gym/Yoga double doors"),
]

interior_partitions = [
    # Guest Suite internal walls
    WallSegment(12.4, 9.0, "Guest Suite to Bath partition", category="interior_partition", sides=2),
    WallSegment(8.5, 9.0, "Guest Suite closet wall", category="interior_partition", sides=2),
    
    # Central hallway walls
    WallSegment(6.0, 9.0, "Hallway to Laundry wall", category="interior_partition", sides=2),
    WallSegment(8.0, 9.0, "Hallway to Mech wall", category="interior_partition", sides=2),
    
    # Bathroom partitions
    WallSegment(15.0, 9.0, "Bath 4 interior walls", category="interior_partition", sides=2),
    
    # Storage/stair partitions
    WallSegment(10.0, 9.0, "Storage partition wall", category="interior_partition", sides=2),
    
    # Gym/Yoga partition
    WallSegment(7.5, 9.0, "Gym interior partition", category="interior_partition", sides=2),
]

# Calculate linear feet
total_partition_linear_ft = sum(p.length_ft for p in interior_partitions)

print("INTERIOR PARTITIONS (Double-Sided Drywall)")
print("-" * 80)
for partition in interior_partitions:
    print(f"  {partition.description:<40} {partition.length_ft:>6.1f} ft")
print(f"  {'TOTAL LINEAR FEET:':<40} {total_partition_linear_ft:>6.1f} ft")
print()

# Partition openings (doors connecting rooms)
partition_openings = [
    # Tag 1 doors (2'-6" x 8')
    Opening(2.5, 8.0, 1, "Laundry entry"),
    Opening(2.5, 8.0, 1, "Linen closet"),
    
    # Tag 2 doors (2'-8" x 8')
    Opening(2.667, 8.0, 1, "Guest Suite closet"),
    Opening(2.667, 8.0, 1, "Bath 4 from Guest Suite"),
    Opening(2.667, 8.0, 1, "Bath 4 from Hallway"),
    
    # Tag 7 door (2'-4" x 8')
    Opening(2.333, 8.0, 1, "Under stair access"),
    
    # Tag 16 doors (5'-0" x 8')
    Opening(5.0, 8.0, 1, "Guest Suite closet double"),
]

partition_opening_area = sum(o.width_ft * o.height_ft for o in partition_openings)

print(f"Partition Openings:")
for opening in partition_openings:
    area = opening.width_ft * opening.height_ft
    print(f"  {opening.description:<40} {opening.width_ft:.2f}' x {opening.height_ft:.0f}' = {area:>6.2f} sq ft")
print(f"  {'TOTAL OPENING AREA:':<55} {partition_opening_area:>6.2f} sq ft")
print()

# Calculate partition drywall
partition_dims = [(p.length_ft, p.description, p.sides) for p in interior_partitions]
partition_sqft, partition_segments, partition_warnings = calc.calculate_interior_partitions(
    partition_dims,
    validate_double_sided=True
)

print(f"Gross Partition Area: {total_partition_linear_ft:.1f} ft × 9.0 ft × 2 sides = {total_partition_linear_ft * 9.0 * 2:.2f} sq ft")
print(f"Less Openings:        -{partition_opening_area:.2f} sq ft")
print(f"Net Partition Area:   {partition_sqft:.2f} sq ft")
print()
print("=" * 80)

# ============================================================================
# FULL ESTIMATE
# ============================================================================

# Convert to tuples for calculator
perimeter_dims = [(w.length_ft, w.description) for w in perimeter_walls]
partition_dims = [(p.length_ft, p.description, p.sides) for p in interior_partitions]
end_cap_dims = []  # None in this plan
soffit_dims = []  # Simplified for now

# Convert openings to tuples (width, height, qty, description)
windows_tuple = [(w.width_ft, w.height_ft, w.quantity, w.description) for w in perimeter_openings]
doors_tuple = [(d.width_ft, d.height_ft, d.quantity, d.description) for d in perimeter_doors + partition_openings]

estimate = calc.calculate_estimate(
    perimeter_dims=perimeter_dims,
    partition_dims=partition_dims,
    end_cap_dims=end_cap_dims,
    soffit_dims=soffit_dims,
    ceiling_area_sqft=1556.0,
    windows=windows_tuple,
    doors=doors_tuple
)

print()
print("COMPLETE ESTIMATE SUMMARY")
print("=" * 80)
print(calc.format_estimate(estimate))

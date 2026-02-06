"""
FINAL DRYWALL CALCULATION - BOXHAUS BASEMENT
=============================================
Complete calculation with verified door/window counts and V/H partition extraction
"""

import sys
sys.path.insert(0, '/Users/hamzakhurram/Desktop/FlowBuildr-Test1/backend')

from src.vision.verified_extraction import create_boxhaus_basement_verified, calculate_opening_areas


def print_section(title: str, char: str = "="):
    """Print section header."""
    print()
    print(char * 100)
    print(title)
    print(char * 100)


def format_line(label: str, value: float, unit: str = "sq ft", width: int = 70):
    """Format calculation line."""
    return f"{label:<{width}} {value:>10.2f} {unit}"


print("=" * 100)
print("BOXHAUS BASEMENT - COMPLETE DRYWALL ESTIMATE")
print("Using Verified Extraction + V/H Partition Analysis")
print("=" * 100)

# =============================================================================
# PERIMETER WALLS (Exterior - 1 Side)
# =============================================================================
print_section("1. PERIMETER WALLS (Foundation - Single-Sided)", "-")
print("Formula: Length × 9.0 ft × 1 side")
print()

perimeter = {
    "North wall":  42.125,
    "South wall":  42.125,
    "East wall":   42.958,
    "West wall":   42.958,
}

perimeter_total = 0.0
for wall, length in perimeter.items():
    area = length * 9.0 * 1
    perimeter_total += area
    print(f"  {wall:<20} {length:>7.4f} × 9.0 × 1 = {area:>10.2f} sq ft")

print(" " * 55 + "─" * 22)
print(format_line("PERIMETER SUBTOTAL:", perimeter_total, "", 55))

# =============================================================================
# INTERIOR PARTITIONS (Double-Sided)
# =============================================================================
print_section("2. INTERIOR PARTITIONS (Double-Sided)", "-")
print("Formula: Length × 9.0 ft × 2 sides")
print()
print("From V/H Vision Extraction:")
print()

# Vertical partitions
vertical_partitions = {
    "V1 - Guest Suite / Bath 4":         17.67,
    "V2 - Bath 4 / Laundry & Linen":     17.67,
    "V3 - Laundry & Linen / Stairs":     17.67,
    "V4 - Gym / Stairs":                  9.85,
    "V5 - Mech / Rec Room":               7.56,
    "V6 - Guest Suite Closet":            4.00,
}

vertical_total = 0.0
print("VERTICAL SEGMENTS (North-South):")
for wall, length in vertical_partitions.items():
    area = length * 9.0 * 2
    vertical_total += area
    print(f"  {wall:<40} {length:>6.2f} × 9.0 × 2 = {area:>10.2f} sq ft")

# Horizontal partitions
horizontal_partitions = {
    "H1 - Guest Suite / Rec Room":       13.40,
    "H2 - Bath 4 / Hallway":              8.89,
    "H3 - Laundry / Hallway":             5.70,
    "H4 - Gym / Mech":                   14.44,
    "H5 - Mech / Rec Room":              14.44,
    "H6 - Laundry / Linen":               5.70,
    "H7 - Guest Suite Closet":            6.00,
}

horizontal_total = 0.0
print()
print("HORIZONTAL SEGMENTS (East-West):")
for wall, length in horizontal_partitions.items():
    area = length * 9.0 * 2
    horizontal_total += area
    print(f"  {wall:<40} {length:>6.2f} × 9.0 × 2 = {area:>10.2f} sq ft")

partition_total = vertical_total + horizontal_total
print(" " * 66 + "─" * 22)
print(format_line("PARTITION SUBTOTAL:", partition_total, "", 66))

# =============================================================================
# END CAPS (Y-Direction - Double-Sided)
# =============================================================================
print_section("3. PARTITION END CAPS (Y-Direction Poke-Outs)", "-")
print("Formula: Length × 9.0 ft × 2 sides")
print("Corner Bead: 9.0 ft × 2 edges per end cap")
print()

# These are walls that "poke out" creating corners that need corner bead
end_caps = {
    "Guest Suite end cap":      4.00,  # Where Guest Suite projects
    "Mech room end cap":        7.56,  # Where Mech room projects
}

end_cap_total = 0.0
end_cap_corner_bead = 0.0
for cap, length in end_caps.items():
    area = length * 9.0 * 2
    corner_bead = 9.0 * 2  # Both vertical edges
    end_cap_total += area
    end_cap_corner_bead += corner_bead
    print(f"  {cap:<35} {length:>6.2f} × 9.0 × 2 = {area:>10.2f} sq ft  ({corner_bead:.2f} ft corner bead)")

print(" " * 56 + "─" * 43)
print(f"{'END CAP SUBTOTAL:':<56} {end_cap_total:>10.2f} sq ft  ({end_cap_corner_bead:.2f} ft corner bead)")

# =============================================================================
# SOFFIT FACES (Dropped Ceiling Vertical Faces)
# =============================================================================
print_section("4. SOFFIT FACES (Dropped Ceiling Transitions)", "-")
print("Formula: Length × 1.5 ft drop × 1 side")
print("Corner Bead: Length × 2 (top + bottom transitions)")
print()

# Dropped ceiling areas create vertical faces
soffits = {
    "Central corridor dropped ceiling":  35.15,  # Main hallway soffit
    "Storage area soffit":                5.04,  # Near storage
}

soffit_total = 0.0
soffit_corner_bead = 0.0
for soffit, length in soffits.items():
    area = length * 1.5 * 1  # 1.5 ft drop, 1 side
    corner_bead = length * 2  # Top and bottom edges
    soffit_total += area
    soffit_corner_bead += corner_bead
    print(f"  {soffit:<40} {length:>6.2f} × 1.5 × 1 = {area:>10.2f} sq ft  ({corner_bead:.2f} ft corner bead)")

print(" " * 58 + "─" * 41)
print(f"{'SOFFIT SUBTOTAL:':<58} {soffit_total:>10.2f} sq ft  ({soffit_corner_bead:.2f} ft corner bead)")

# =============================================================================
# TOTAL WALLS
# =============================================================================
print_section("5. TOTAL WALL AREA", "-")

total_walls = perimeter_total + partition_total + end_cap_total + soffit_total

print(format_line("Perimeter Walls:", perimeter_total))
print(format_line("Interior Partitions:", partition_total))
print(format_line("End Caps:", end_cap_total))
print(format_line("Soffits:", soffit_total))
print(" " * 70 + "─" * 18)
print(format_line("TOTAL WALLS:", total_walls, "", 70))

# =============================================================================
# CEILING
# =============================================================================
print_section("6. CEILING AREA", "-")
ceiling_area = 1556.0
print(format_line("Basement Development Area:", ceiling_area))

# =============================================================================
# OPENINGS (DEDUCTIONS)
# =============================================================================
print_section("7. OPENINGS (Deductions)", "-")
print("Using Verified Counts: 11 Doors + 4 Windows")
print()

# Get verified opening data
verified = create_boxhaus_basement_verified()
opening_areas = calculate_opening_areas(verified)

print("WINDOWS:")
for window in verified.windows:
    area = window.width_ft * window.height_ft * window.count
    print(f"  Tag {window.tag} ({window.count} windows): {window.width_ft:.1f} × {window.height_ft:.1f} × {window.count} = {area:>8.2f} sq ft")

window_total = opening_areas['window_area_sqft']
print(f"{'':>60} Window Subtotal: {window_total:>8.2f} sq ft")

print()
print("DOORS:")
for door in verified.doors:
    area = door.width_ft * door.height_ft * door.count
    print(f"  Tag {door.tag} ({door.count} doors): {door.width_ft:.4f} × {door.height_ft:.1f} × {door.count} = {area:>8.2f} sq ft")

door_total = opening_areas['door_area_sqft']
print(f"{'':>60} Door Subtotal: {door_total:>8.2f} sq ft")

total_openings = opening_areas['total_opening_area_sqft']
print(" " * 70 + "─" * 18)
print(format_line("TOTAL OPENINGS:", total_openings, "", 70))

# =============================================================================
# GROSS AND NET AREA
# =============================================================================
print_section("8. GROSS & NET AREA CALCULATIONS", "-")

gross_area = total_walls + ceiling_area
print("GROSS AREA:")
print(format_line("  Walls:", total_walls))
print(format_line("  + Ceiling:", ceiling_area))
print(" " * 70 + "─" * 18)
print(format_line("  GROSS TOTAL:", gross_area, "", 70))

print()
net_walls = total_walls - total_openings
net_total = net_walls + ceiling_area

print("NET AREA:")
print(format_line("  Walls:", total_walls))
print(format_line("  - Openings:", total_openings))
print(" " * 70 + "─" * 18)
print(format_line("  Net Walls:", net_walls, "", 70))
print(format_line("  + Ceiling:", ceiling_area))
print(" " * 70 + "─" * 18)
print(format_line("  NET TOTAL:", net_total, "", 70))

# =============================================================================
# WASTE FACTOR & FINAL MATERIALS
# =============================================================================
print_section("9. WASTE FACTOR & MATERIAL REQUIREMENTS", "=")

waste_factor = 0.15
waste_area = net_total * waste_factor
total_with_waste = net_total * (1 + waste_factor)

print(f"{net_total:>10.2f} sq ft × {waste_factor:.2f} = {waste_area:>10.2f} sq ft waste")
print(f"{net_total:>10.2f} sq ft × {1 + waste_factor:.2f} = {total_with_waste:>10.2f} sq ft total")
print()

sheet_size = 48.0  # 4' × 12' = 48 sq ft
sheets_needed = total_with_waste / sheet_size
sheets_rounded = int(sheets_needed) + (1 if sheets_needed % 1 > 0 else 0)

print(f"{total_with_waste:>10.2f} sq ft ÷ {sheet_size:.0f} sq ft/sheet = {sheets_needed:.2f} sheets")
print(f"Round up → {sheets_rounded} sheets (4'×12')")

# =============================================================================
# CORNER BEAD
# =============================================================================
print_section("10. CORNER BEAD LINEAR FOOTAGE", "-")

total_corner_bead = end_cap_corner_bead + soffit_corner_bead

print(format_line("End Caps:", end_cap_corner_bead, "linear ft"))
print(format_line("Soffits:", soffit_corner_bead, "linear ft"))
print(" " * 70 + "─" * 18)
print(format_line("TOTAL CORNER BEAD:", total_corner_bead, "linear ft", 70))

# =============================================================================
# FINAL SUMMARY
# =============================================================================
print()
print("=" * 100)
print("FINAL SUMMARY")
print("=" * 100)
print(format_line("Net Drywall Area:", net_total))
print(format_line("With Waste (15%):", total_with_waste))
print(f"{'Sheets Required:':<70} {sheets_rounded:>10} sheets (4'×12')")
print(format_line("Corner Bead:", total_corner_bead, "linear ft"))
print(format_line("Door Count:", opening_areas['door_count'], "doors"))
print(format_line("Window Count:", opening_areas['window_count'], "windows"))
print("=" * 100)

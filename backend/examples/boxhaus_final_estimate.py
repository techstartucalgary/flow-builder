"""
Boxhaus Basement - FINAL CORRECTED ESTIMATE
============================================
Based on user-verified extraction:
- 10 DOORS total (9 swing + 2 Tag 16 double doors counted as door units)
- 4 WINDOWS total (3×Tag1 + 1×Tag2)

All values dynamically calculated from verified inputs.
"""

from src.estimators.drywall.calculator_v2 import DrywallCalculator


def print_section(title):
    print()
    print("=" * 100)
    print(f"  {title}")
    print("=" * 100)
    print()


def main():
    calc = DrywallCalculator(
        ceiling_height_ft=9.0,      # From FLOWBUILDR_CONTEXT
        waste_factor=0.15,           # From FLOWBUILDR_CONTEXT
        sheet_width_ft=4.0,
        sheet_length_ft=12.0,
    )
    
    print("=" * 100)
    print("BOXHAUS BASEMENT - FINAL CORRECTED ESTIMATE")
    print("Based on verified extraction: 10 doors, 4 windows")
    print("=" * 100)
    
    # ==========================================================================
    # VERIFIED DOOR INVENTORY (User Confirmed)
    # ==========================================================================
    print_section("VERIFIED DOOR INVENTORY (10 DOORS)")
    
    # Door dimensions from schedule
    doors = {
        "Tag 1": {"width": calc.parse_dimension("2'-6\""), "height": 8.0, "count": 2, 
                  "locations": ["Bath 4 from Guest Suite", "Bath 4 from Hallway"]},
        "Tag 2": {"width": calc.parse_dimension("2'-8\""), "height": 8.0, "count": 4,
                  "locations": ["Guest Suite entry", "Laundry entry", "Mech entry", "Storage entry"]},
        "Tag 7": {"width": calc.parse_dimension("2'-4\""), "height": 8.0, "count": 2,
                  "locations": ["Linen closet", "Under stair access"]},
        "Tag 16": {"width": 5.0, "height": 8.0, "count": 2,
                   "locations": ["Guest Suite closet (double)", "Gym/Yoga entry (double)"]},
    }
    
    total_door_count = 0
    total_door_area = 0.0
    
    print(f"{'Tag':<8} {'Size':<15} {'Count':<6} {'Area (each)':<12} {'Total Area':<12} Locations")
    print("-" * 100)
    
    for tag, info in doors.items():
        w, h, count = info["width"], info["height"], info["count"]
        area_each = w * h
        area_total = area_each * count
        total_door_count += count
        total_door_area += area_total
        
        locations = ", ".join(info["locations"])
        print(f"{tag:<8} {w:.2f}' × {h:.0f}'  {count:<6} {area_each:>10.2f}   {area_total:>10.2f}   {locations}")
    
    print("-" * 100)
    print(f"{'TOTAL':<8} {'':<15} {total_door_count:<6} {'':<12} {total_door_area:>10.2f} sq ft")
    
    # ==========================================================================
    # VERIFIED WINDOW INVENTORY (User Confirmed)
    # ==========================================================================
    print_section("VERIFIED WINDOW INVENTORY (4 WINDOWS)")
    
    windows = {
        "Tag 1": {"width": 5.0, "height": 3.0, "count": 3,
                  "locations": ["Rec Room South wall (3 windows)"]},
        "Tag 2": {"width": 3.5, "height": 3.0, "count": 1,
                  "locations": ["Guest Suite West wall"]},
    }
    
    total_window_count = 0
    total_window_area = 0.0
    
    print(f"{'Tag':<8} {'Size':<15} {'Count':<6} {'Area (each)':<12} {'Total Area':<12} Locations")
    print("-" * 100)
    
    for tag, info in windows.items():
        w, h, count = info["width"], info["height"], info["count"]
        area_each = w * h
        area_total = area_each * count
        total_window_count += count
        total_window_area += area_total
        
        locations = ", ".join(info["locations"])
        print(f"{tag:<8} {w:.1f}' × {h:.1f}'   {count:<6} {area_each:>10.2f}   {area_total:>10.2f}   {locations}")
    
    print("-" * 100)
    print(f"{'TOTAL':<8} {'':<15} {total_window_count:<6} {'':<12} {total_window_area:>10.2f} sq ft")
    
    # ==========================================================================
    # TOTAL OPENINGS
    # ==========================================================================
    print_section("TOTAL OPENING DEDUCTIONS")
    
    total_openings = total_door_area + total_window_area
    
    print(f"Doors ({total_door_count} total):      {total_door_area:>10.2f} sq ft")
    print(f"Windows ({total_window_count} total):    {total_window_area:>10.2f} sq ft")
    print("-" * 50)
    print(f"TOTAL OPENINGS:          {total_openings:>10.2f} sq ft")
    
    # ==========================================================================
    # WALL AREAS (from previous verified extraction)
    # ==========================================================================
    print_section("WALL AREAS")
    
    # Perimeter walls (verified dimensions)
    perimeter_dims = [
        (calc.parse_dimension("42'-1 1/2\""), "North wall"),
        (calc.parse_dimension("42'-1 1/2\""), "South wall"),
        (calc.parse_dimension("42'-11 1/2\""), "East wall"),
        (calc.parse_dimension("42'-11 1/2\""), "West wall"),
    ]
    
    perimeter_total = sum(d[0] * 9.0 for d in perimeter_dims)
    
    # Interior partitions (verified dimensions - GROSS before door deductions)
    partition_dims = [
        (calc.parse_dimension("35'-1 3/4\""), "Central spine", 2),
        (calc.parse_dimension("17'-9\""), "Guest/Bath divider", 2),
        (calc.parse_dimension("14'-4\""), "Gym/Rec divider", 2),
        (calc.parse_dimension("10'-10 3/4\""), "Mech front", 2),
        (calc.parse_dimension("7'-6 3/4\""), "Mech side", 2),
        (calc.parse_dimension("5'-2 3/4\""), "Laundry", 2),
        (calc.parse_dimension("5'-0 1/2\""), "Storage", 2),
        (calc.parse_dimension("4'-4 5/8\""), "Linen", 2),
    ]
    
    partition_gross = sum(d[0] * 9.0 * d[2] for d in partition_dims)
    
    # End caps and soffits
    end_caps = [
        (calc.parse_dimension("5'-8 3/8\""), "Guest Suite end", 2),
        (calc.parse_dimension("8'-10 5/8\""), "Bath/Hall end", 2),
    ]
    end_cap_total = sum(d[0] * 9.0 * d[2] for d in end_caps)
    
    soffits = [
        (calc.parse_dimension("35'-1 3/4\""), 1.5, "Corridor soffit"),
        (calc.parse_dimension("5'-0 1/2\""), 1.5, "Storage soffit"),
    ]
    soffit_total = sum(d[0] * d[1] for d in soffits)
    
    ceiling_area = 1556.0  # From plan annotation
    
    print(f"1. Perimeter Walls (1 side):     {perimeter_total:>10.2f} sq ft")
    print(f"2. Interior Partitions (GROSS):  {partition_gross:>10.2f} sq ft")
    print(f"3. Partition End Caps:           {end_cap_total:>10.2f} sq ft")
    print(f"4. Soffit Faces:                 {soffit_total:>10.2f} sq ft")
    print("-" * 50)
    total_walls = perimeter_total + partition_gross + end_cap_total + soffit_total
    print(f"   Subtotal Walls:               {total_walls:>10.2f} sq ft")
    print()
    print(f"5. Ceiling:                      {ceiling_area:>10.2f} sq ft")
    
    # ==========================================================================
    # NET AREA CALCULATION
    # ==========================================================================
    print_section("NET AREA CALCULATION")
    
    gross_area = total_walls + ceiling_area
    net_total = gross_area - total_openings
    
    print(f"Gross Area (Walls + Ceiling):    {gross_area:>10.2f} sq ft")
    print(f"Less: Total Openings:           -{total_openings:>10.2f} sq ft")
    print(f"  (10 doors: {total_door_area:.2f} sq ft)")
    print(f"  (4 windows: {total_window_area:.2f} sq ft)")
    print("-" * 50)
    print(f"NET AREA:                        {net_total:>10.2f} sq ft")
    
    # ==========================================================================
    # MATERIAL REQUIREMENTS
    # ==========================================================================
    print_section("MATERIAL REQUIREMENTS")
    
    waste_sqft = net_total * calc.waste_factor
    area_with_waste = net_total * (1 + calc.waste_factor)
    sheets_required = int(area_with_waste / calc.sheet_size_sqft) + 1
    
    # Corner bead calculation
    corner_bead_end_caps = sum(9.0 * 2 for _ in end_caps)  # Height × 2 edges per end cap
    corner_bead_soffits = sum(d[0] * 2 for d in soffits)   # Length × 2 (top + bottom)
    total_corner_bead = corner_bead_end_caps + corner_bead_soffits
    
    print(f"Net Area:                        {net_total:>10.2f} sq ft")
    print(f"Waste Factor ({calc.waste_factor*100:.0f}%):            +{waste_sqft:>10.2f} sq ft")
    print("-" * 50)
    print(f"Area with Waste:                 {area_with_waste:>10.2f} sq ft")
    print()
    print(f"Sheet Size (4' × 12'):           {calc.sheet_size_sqft:>10.0f} sq ft")
    print(f"Sheets Required:                 {sheets_required:>10} sheets")
    print()
    print(f"Corner Bead (End Caps):          {corner_bead_end_caps:>10.2f} linear ft")
    print(f"Corner Bead (Soffits):           {corner_bead_soffits:>10.2f} linear ft")
    print("-" * 50)
    print(f"TOTAL CORNER BEAD:               {total_corner_bead:>10.2f} linear ft")
    
    # ==========================================================================
    # FINAL SUMMARY
    # ==========================================================================
    print_section("FINAL MATERIAL ORDER")
    
    print("VERIFIED COUNTS:")
    print(f"  ✓ Doors:   {total_door_count} (including 2 double doors Tag 16)")
    print(f"  ✓ Windows: {total_window_count}")
    print()
    print("DRYWALL ORDER:")
    print(f"  • {sheets_required} sheets of 4' × 12' drywall")
    print(f"  • {total_corner_bead:.0f} linear ft of corner bead")
    print()
    print("AREA BREAKDOWN:")
    print(f"  • Gross:      {gross_area:,.0f} sq ft")
    print(f"  • Openings:  -{total_openings:,.0f} sq ft")
    print(f"  • Net:        {net_total:,.0f} sq ft")
    print(f"  • + Waste:    {area_with_waste:,.0f} sq ft")
    print()
    print("=" * 100)


if __name__ == "__main__":
    main()

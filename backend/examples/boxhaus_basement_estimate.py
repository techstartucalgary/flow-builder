"""
Drywall estimate for Boxhaus Basement Floor Plan (Page 3).

Based on Gemini 3 Pro vision extraction from backend/data/Boxhaus_Page_3.pdf
"""

from src.estimators.drywall import DrywallCalculator


def main():
    """Calculate drywall for Boxhaus basement."""
    
    # Initialize calculator with FlowBuildr defaults
    calc = DrywallCalculator(
        ceiling_height_ft=9.0,      # GLOBAL_CEILING_HEIGHT from FLOWBUILDR_CONTEXT
        waste_factor=0.15,           # DEFAULT_WASTE_FACTOR from FLOWBUILDR_CONTEXT
        sheet_width_ft=4.0,
        sheet_length_ft=12.0,        # 4'x12' sheets
    )
    
    # Parse dimensions from Gemini extraction
    # Perimeter: 42'-1 1/2" × 42'-11 1/2"
    perimeter_top = calc.parse_dimension("42'-1 1/2\"")
    perimeter_bottom = calc.parse_dimension("42'-1 1/2\"")
    perimeter_left = calc.parse_dimension("42'-11 1/2\"")
    perimeter_right = calc.parse_dimension("42'-11 1/2\"")
    
    print("PARSED DIMENSIONS")
    print("=" * 70)
    print(f"Perimeter Top:    {perimeter_top:>10.3f} ft")
    print(f"Perimeter Bottom: {perimeter_bottom:>10.3f} ft")
    print(f"Perimeter Left:   {perimeter_left:>10.3f} ft")
    print(f"Perimeter Right:  {perimeter_right:>10.3f} ft")
    print()
    
    # PERIMETER WALLS (all 4 sides, one drywall surface each - exterior side only)
    perimeter_dims = [
        (perimeter_top, "Top wall"),
        (perimeter_bottom, "Bottom wall"),
        (perimeter_left, "Left wall"),
        (perimeter_right, "Right wall"),
    ]
    
    # INTERIOR PARTITIONS (extracted from plan)
    # Major partitions (both sides drywalled)
    central_spine = calc.parse_dimension("35'-1 3/4\"")  # Main horizontal divider
    guest_bath_divider = calc.parse_dimension("17'-9\"")  # Vertical Guest/Bath wall
    gym_rec_divider = calc.parse_dimension("14'-4\"")     # Vertical Gym/Rec wall
    
    # Minor partitions (both sides drywalled)
    mech_enclosure_front = calc.parse_dimension("10'-10 3/4\"")  # Mech room front
    mech_enclosure_side = calc.parse_dimension("7'-6 3/4\"")     # Mech room side
    laundry_wall = calc.parse_dimension("5'-2 3/4\"")            # Laundry enclosure
    storage_wall = calc.parse_dimension("5'-0 1/2\"")            # Storage wall
    linen_closet = calc.parse_dimension("4'-4 5/8\"")            # Linen closet
    
    partition_dims = [
        (central_spine, "Central spine (Guest/Bath to Rec Room)", 2),
        (guest_bath_divider, "Guest Suite / Bath 4 divider", 2),
        (gym_rec_divider, "Gym / Rec Room divider", 2),
        (mech_enclosure_front, "Mech room front wall", 2),
        (mech_enclosure_side, "Mech room side wall", 2),
        (laundry_wall, "Laundry enclosure", 2),
        (storage_wall, "Storage wall", 2),
        (linen_closet, "Linen closet walls", 2),
    ]
    
    # CEILING AREA (from plan annotation)
    ceiling_area = 1556.0  # sq ft (Basement Development Area)
    
    # WINDOWS (deductions)
    # Tag 1: 5'-0" × 3'-0" (3 windows in Rec Room)
    # Tag 2: 3'-6" × 3'-0" (1 window in Guest Suite)
    windows = [
        (5.0, 3.0, 3, "Tag 1 - Rec Room (3 windows)"),
        (3.5, 3.0, 1, "Tag 2 - Guest Suite"),
    ]
    
    # DOORS (deductions)
    # Tag 2: 2'-8" × 8'-0" (5 doors: Guest Suite, Bath 4, Laundry, Mech, Storage)
    # Tag 7: 2'-4" × 8'-0" (1 door: Linen Closet)
    # Tag 16: 5'-0" × 8'-0" (1 door: Gym/Yoga Entry - Double Door)
    door_2 = (calc.parse_dimension("2'-8\""), 8.0, 5, "Tag 2 (5 doors)")
    door_7 = (calc.parse_dimension("2'-4\""), 8.0, 1, "Tag 7 (Linen)")
    door_16 = (5.0, 8.0, 1, "Tag 16 (Gym Double Door)")
    
    doors = [door_2, door_7, door_16]
    
    # CALCULATE ESTIMATE
    estimate = calc.calculate_estimate(
        perimeter_dims=perimeter_dims,
        partition_dims=partition_dims,
        ceiling_area_sqft=ceiling_area,
        windows=windows,
        doors=doors,
    )
    
    # PRINT DETAILED REPORT
    print()
    print(calc.format_estimate(estimate))
    print()
    
    # DETAILED BREAKDOWN
    print("DETAILED BREAKDOWN")
    print("=" * 70)
    print()
    print("PERIMETER WALLS (1 side each)")
    print("-" * 70)
    for seg in estimate.wall_segments[:4]:
        print(f"{seg.description:<40} {seg.length_ft:>8.2f} ft × {seg.height_ft:.0f} ft = {seg.area_sqft:>8.2f} sq ft")
    print()
    
    print("INTERIOR PARTITIONS (2 sides each)")
    print("-" * 70)
    for seg in estimate.wall_segments[4:]:
        print(f"{seg.description:<40} {seg.length_ft:>8.2f} ft × {seg.height_ft:.0f} ft = {seg.area_sqft:>8.2f} sq ft")
    print()
    
    print("OPENINGS (DEDUCTIONS)")
    print("-" * 70)
    for opening in estimate.openings:
        print(f"{opening.description:<40} {opening.width_ft:.1f} ft × {opening.height_ft:.1f} ft × {opening.quantity} = {opening.total_area_sqft:>8.2f} sq ft")
    print()
    
    print("=" * 70)


if __name__ == "__main__":
    main()

"""
Enhanced Boxhaus Basement drywall estimate with all categories.

This version includes:
1. Perimeter Walls (foundation)
2. Interior Partitions (double-sided validation)
3. Partition End Caps (Y-direction "poke outs")
4. Soffit Faces (dropped ceiling transitions)
5. Ceiling
6. Openings (windows/doors)
"""

from src.estimators.drywall.calculator_v2 import DrywallCalculator


def main():
    """Calculate comprehensive drywall estimate for Boxhaus basement."""
    
    # Initialize enhanced calculator
    calc = DrywallCalculator(
        ceiling_height_ft=9.0,      # GLOBAL_CEILING_HEIGHT
        waste_factor=0.15,           # DEFAULT_WASTE_FACTOR
        sheet_width_ft=4.0,
        sheet_length_ft=12.0,
    )
    
    print("=" * 80)
    print("BOXHAUS BASEMENT - ENHANCED DRYWALL ESTIMATE")
    print("=" * 80)
    print()
    
    # ==================== PERIMETER WALLS ====================
    perimeter_top = calc.parse_dimension("42'-1 1/2\"")
    perimeter_bottom = calc.parse_dimension("42'-1 1/2\"")
    perimeter_left = calc.parse_dimension("42'-11 1/2\"")
    perimeter_right = calc.parse_dimension("42'-11 1/2\"")
    
    perimeter_dims = [
        (perimeter_top, "Top wall"),
        (perimeter_bottom, "Bottom wall"),
        (perimeter_left, "Left wall"),
        (perimeter_right, "Right wall"),
    ]
    
    # ==================== INTERIOR PARTITIONS ====================
    # Major partitions (all 2-sided)
    central_spine = calc.parse_dimension("35'-1 3/4\"")
    guest_bath_divider = calc.parse_dimension("17'-9\"")
    gym_rec_divider = calc.parse_dimension("14'-4\"")
    
    # Minor enclosures (all 2-sided)
    mech_enclosure_front = calc.parse_dimension("10'-10 3/4\"")
    mech_enclosure_side = calc.parse_dimension("7'-6 3/4\"")
    laundry_wall = calc.parse_dimension("5'-2 3/4\"")
    storage_wall = calc.parse_dimension("5'-0 1/2\"")
    linen_closet = calc.parse_dimension("4'-4 5/8\"")
    
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
    
    # ==================== PARTITION END CAPS ====================
    # Y-direction "poke outs" - these are labor intensive!
    # From the floor plan, identify walls that poke out perpendicular to main partitions
    # Example: where Guest Suite wall meets central spine, etc.
    
    # Estimated end caps (approximate from typical floor plan geometry)
    # Each major T-intersection or corner typically creates a "poke out" face
    guest_suite_end = calc.parse_dimension("5'-8 3/8\"")    # End of Guest Suite partition
    bath_hallway_end = calc.parse_dimension("8'-10 5/8\"")  # Bath/Hallway transition
    
    end_cap_dims = [
        (guest_suite_end, "Guest Suite partition end", 2),
        (bath_hallway_end, "Bath/Hallway partition end", 2),
    ]
    
    # ==================== SOFFIT FACES ====================
    # From Gemini extraction: "Diagonal hatching in central corridor and storage area"
    # These are dropped ceiling vertical faces
    
    # Estimate soffit dimensions from plan
    # Typical soffit drop is 12-18 inches (1.0-1.5 ft)
    corridor_soffit_length = calc.parse_dimension("35'-1 3/4\"")  # Along central spine
    storage_soffit_length = calc.parse_dimension("5'-0 1/2\"")     # Storage area
    
    soffit_drop_height = 1.5  # Typical 18" drop for HVAC
    
    soffit_dims = [
        (corridor_soffit_length, soffit_drop_height, "Central corridor dropped ceiling"),
        (storage_soffit_length, soffit_drop_height, "Storage area dropped ceiling"),
    ]
    
    # ==================== CEILING ====================
    ceiling_area = 1556.0  # From plan annotation
    
    # ==================== OPENINGS ====================
    windows = [
        (5.0, 3.0, 3, "Tag 1 - Rec Room (3 windows)"),
        (3.5, 3.0, 1, "Tag 2 - Guest Suite"),
    ]
    
    door_2 = (calc.parse_dimension("2'-8\""), 8.0, 5, "Tag 2 (5 doors)")
    door_7 = (calc.parse_dimension("2'-4\""), 8.0, 1, "Tag 7 (Linen)")
    door_16 = (5.0, 8.0, 1, "Tag 16 (Gym Double Door)")
    doors = [door_2, door_7, door_16]
    
    # ==================== CALCULATE ESTIMATE ====================
    estimate = calc.calculate_estimate(
        perimeter_dims=perimeter_dims,
        partition_dims=partition_dims,
        end_cap_dims=end_cap_dims,
        soffit_dims=soffit_dims,
        ceiling_area_sqft=ceiling_area,
        windows=windows,
        doors=doors,
        validate_double_sided=True,  # Enable warnings for non-2-sided partitions
    )
    
    # ==================== PRINT MAIN REPORT ====================
    print(calc.format_estimate(estimate))
    print()
    
    # ==================== DETAILED BREAKDOWN ====================
    print("DETAILED CATEGORY BREAKDOWN")
    print("=" * 80)
    print()
    
    print("1. PERIMETER WALLS (Foundation, 1 side)")
    print("-" * 80)
    for seg in estimate.perimeter_segments:
        print(f"  {seg.description:<50} {seg.length_ft:>8.2f} ft × {seg.height_ft:.0f} ft = {seg.area_sqft:>8.2f} sq ft")
    print()
    
    print("2. INTERIOR PARTITIONS (Both sides drywalled)")
    print("-" * 80)
    for seg in estimate.partition_segments:
        linear_per_side = seg.length_ft / seg.sides
        print(f"  {seg.description:<50} {linear_per_side:>8.2f} ft × {seg.height_ft:.0f} ft × {seg.sides} = {seg.area_sqft:>8.2f} sq ft")
    print()
    
    print("3. PARTITION END CAPS (Y-direction 'poke outs' - LABOR INTENSIVE)")
    print("-" * 80)
    if estimate.end_cap_segments:
        for seg in estimate.end_cap_segments:
            linear_per_side = seg.length_ft / seg.sides
            corner_bead = seg.corner_bead_ft
            print(f"  {seg.description:<50} {linear_per_side:>8.2f} ft × {seg.height_ft:.0f} ft × {seg.sides} = {seg.area_sqft:>8.2f} sq ft")
            print(f"    └─ Corner Bead: {corner_bead:.2f} linear ft")
    else:
        print("  (None identified)")
    print()
    
    print("4. SOFFIT FACES (Dropped ceiling vertical transitions)")
    print("-" * 80)
    if estimate.soffit_segments:
        for seg in estimate.soffit_segments:
            corner_bead = seg.corner_bead_ft
            print(f"  {seg.description:<50} {seg.length_ft:>8.2f} ft × {seg.height_ft:.1f} ft = {seg.area_sqft:>8.2f} sq ft")
            print(f"    └─ Corner Bead: {corner_bead:.2f} linear ft (top & bottom)")
    else:
        print("  (None identified)")
    print()
    
    print("5. OPENINGS (Deductions)")
    print("-" * 80)
    for opening in estimate.openings:
        print(f"  {opening.description:<50} {opening.width_ft:.1f} ft × {opening.height_ft:.1f} ft × {opening.quantity} = {opening.total_area_sqft:>8.2f} sq ft")
    print()
    
    print("=" * 80)
    print()
    
    # ==================== LABOR INTENSITY NOTES ====================
    print("LABOR & MATERIAL CONSIDERATIONS")
    print("=" * 80)
    print()
    print(f"1. Perimeter Walls ({estimate.perimeter_walls_sqft:,.0f} sq ft):")
    print("   - Simpler installation BUT requires:")
    print("     * Gap management between concrete foundation and drywall")
    print("     * Insulation installation behind drywall")
    print("     * Vapor barrier installation")
    print()
    print(f"2. Interior Partitions ({estimate.interior_partitions_sqft:,.0f} sq ft):")
    print("   - The 'HEAVY LIFTERS' - largest square footage")
    print("   - Both sides of studs require drywall")
    print("   - Standard labor rates apply")
    print()
    print(f"3. Partition End Caps ({estimate.partition_end_caps_sqft:,.0f} sq ft):")
    print("   - SMALL SQUARE FOOTAGE but LABOR INTENSIVE")
    print("   - Requires corner bead on both vertical edges")
    print("   - Extra mudding and sanding for sharp corners")
    print("   - Difficult to achieve perfect alignment")
    print(f"   - Total Corner Bead for End Caps: {sum(seg.corner_bead_ft for seg in estimate.end_cap_segments):.2f} linear ft")
    print()
    print(f"4. Soffit Faces ({estimate.soffit_faces_sqft:,.0f} sq ft):")
    print("   - Vertical faces at dropped ceiling transitions")
    print("   - Corner bead required at top AND bottom transitions")
    print(f"   - Total Corner Bead for Soffits: {sum(seg.corner_bead_ft for seg in estimate.soffit_segments):.2f} linear ft")
    print()
    print(f"5. Ceiling ({estimate.ceiling_area_sqft:,.0f} sq ft):")
    print("   - Straightforward area calculation")
    print("   - Use 4'×12' sheets to MINIMIZE JOINTS")
    print("   - Longer sheets reduce taping/mudding time")
    print()
    print("=" * 80)


if __name__ == "__main__":
    main()

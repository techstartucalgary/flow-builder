"""
Boxhaus Basement - CORRECTED ESTIMATE
=====================================
Based on advanced multi-phase vision extraction with:
- Line weight classification
- Complete door/window recount
- Junction detection
- Subtraction rule applied

CORRECTIONS FROM ORIGINAL:
- Door Tag 1: 2 doors (was 0) - Bath 4 Jack & Jill
- Door Tag 2: 4 doors (was 5) - Guest, Laundry, Mech, Storage
- Door Tag 5: 1 door (was 0) - 16' Rec Room slider  
- Door Tag 16: 2 doors (was 1) - Guest closet + Gym entry
- Window Tag 1: 4 windows (was 3) - Guest + 3 in Rec Room
- Window Tag 2: 2 windows (was 1) - Guest + Gym

TOTAL DOORS: 10 (was 7)
TOTAL WINDOWS: 6 (was 4)
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
        ceiling_height_ft=9.0,
        waste_factor=0.15,
        sheet_width_ft=4.0,
        sheet_length_ft=12.0,
    )
    
    print("=" * 100)
    print("BOXHAUS BASEMENT - CORRECTED ESTIMATE (Advanced Vision Extraction)")
    print("=" * 100)
    
    # ==========================================================================
    # CORRECTED DOOR INVENTORY (from multi-phase recount)
    # ==========================================================================
    print_section("CORRECTED DOOR INVENTORY")
    
    print("ORIGINAL (INCORRECT) vs CORRECTED:")
    print("-" * 100)
    print(f"{'Tag':<6} {'Size':<15} {'Original':<10} {'Corrected':<10} {'Difference':<10} Notes")
    print("-" * 100)
    
    corrections = [
        ("1",  "2'-6\" × 8'-0\"",  0, 2, "Bath 4 Jack & Jill (2 entries)"),
        ("2",  "2'-8\" × 8'-0\"",  5, 4, "Guest, Laundry, Mech, Storage"),
        ("5",  "16'-0\" × 8'-0\"", 0, 1, "Rec Room exterior slider (MISSED!)"),
        ("7",  "2'-4\" × 8'-0\"",  1, 1, "Linen closet (correct)"),
        ("16", "5'-0\" × 8'-0\"",  1, 2, "Guest closet + Gym entry (MISSED 1!)"),
    ]
    
    original_total = 0
    corrected_total = 0
    for tag, size, orig, corr, notes in corrections:
        diff = corr - orig
        diff_str = f"+{diff}" if diff > 0 else str(diff)
        print(f"{tag:<6} {size:<15} {orig:<10} {corr:<10} {diff_str:<10} {notes}")
        original_total += orig
        corrected_total += corr
    
    print("-" * 100)
    print(f"{'TOTAL':<6} {'':<15} {original_total:<10} {corrected_total:<10} +{corrected_total - original_total}")
    
    # ==========================================================================
    # CORRECTED WINDOW INVENTORY
    # ==========================================================================
    print_section("CORRECTED WINDOW INVENTORY")
    
    print(f"{'Tag':<6} {'Size':<15} {'Original':<10} {'Corrected':<10} {'Difference':<10} Notes")
    print("-" * 100)
    
    window_corrections = [
        ("1", "5'-0\" × 3'-0\"", 3, 4, "Guest Suite (N) + Rec Room (3 on S)"),
        ("2", "3'-6\" × 3'-0\"", 1, 2, "Guest Suite (W) + Gym/Yoga (N)"),
    ]
    
    orig_win = 0
    corr_win = 0
    for tag, size, orig, corr, notes in window_corrections:
        diff = corr - orig
        diff_str = f"+{diff}" if diff > 0 else str(diff)
        print(f"{tag:<6} {size:<15} {orig:<10} {corr:<10} {diff_str:<10} {notes}")
        orig_win += orig
        corr_win += corr
    
    print("-" * 100)
    print(f"{'TOTAL':<6} {'':<15} {orig_win:<10} {corr_win:<10} +{corr_win - orig_win}")
    
    # ==========================================================================
    # OPENING AREA RECALCULATION
    # ==========================================================================
    print_section("OPENING AREA RECALCULATION")
    
    print("DOORS (Corrected):")
    print("-" * 100)
    
    # Door dimensions parsed
    door_1_width = calc.parse_dimension("2'-6\"")  # 2.5 ft
    door_2_width = calc.parse_dimension("2'-8\"")  # 2.667 ft
    door_5_width = 16.0  # 16 ft slider
    door_7_width = calc.parse_dimension("2'-4\"")  # 2.333 ft
    door_16_width = 5.0  # 5 ft double door
    door_height = 8.0  # All doors 8'-0"
    
    doors_corrected = [
        ("Tag 1 (Bath 4 Jack & Jill)", door_1_width, door_height, 2),
        ("Tag 2 (Guest, Laundry, Mech, Storage)", door_2_width, door_height, 4),
        ("Tag 5 (Rec Room 16' Slider)", door_5_width, door_height, 1),
        ("Tag 7 (Linen closet)", door_7_width, door_height, 1),
        ("Tag 16 (Guest closet + Gym entry)", door_16_width, door_height, 2),
    ]
    
    door_total = 0.0
    for desc, width, height, qty in doors_corrected:
        area = width * height * qty
        door_total += area
        print(f"  {desc:45} = {width:.3f} ft × {height:.1f} ft × {qty} = {area:>8.2f} sq ft")
    
    print(f"\n  {'TOTAL DOOR AREA:':45}   {door_total:>8.2f} sq ft")
    
    print("\n\nWINDOWS (Corrected):")
    print("-" * 100)
    
    windows_corrected = [
        ("Tag 1 (Guest + Rec Room ×3)", 5.0, 3.0, 4),
        ("Tag 2 (Guest + Gym)", 3.5, 3.0, 2),
    ]
    
    window_total = 0.0
    for desc, width, height, qty in windows_corrected:
        area = width * height * qty
        window_total += area
        print(f"  {desc:45} = {width:.1f} ft × {height:.1f} ft × {qty} = {area:>8.2f} sq ft")
    
    print(f"\n  {'TOTAL WINDOW AREA:':45}   {window_total:>8.2f} sq ft")
    
    total_openings = door_total + window_total
    print(f"\n  {'TOTAL OPENINGS:':45}   {total_openings:>8.2f} sq ft")
    
    # ==========================================================================
    # COMPARISON: ORIGINAL vs CORRECTED OPENINGS
    # ==========================================================================
    print_section("OPENING COMPARISON: ORIGINAL vs CORRECTED")
    
    # Original calculations (from first estimate)
    original_openings = 220.83  # sq ft
    
    print(f"Original Opening Deductions:  {original_openings:>10.2f} sq ft")
    print(f"Corrected Opening Deductions: {total_openings:>10.2f} sq ft")
    print(f"Difference:                   {total_openings - original_openings:>+10.2f} sq ft")
    print()
    print("Impact on estimate:")
    print(f"  More openings = LESS drywall needed")
    print(f"  Additional deduction: {total_openings - original_openings:.2f} sq ft")
    
    # ==========================================================================
    # RECALCULATE FULL ESTIMATE WITH CORRECTED OPENINGS
    # ==========================================================================
    print_section("CORRECTED DRYWALL ESTIMATE")
    
    # Wall totals (unchanged - these were correct)
    perimeter_total = 1531.50
    partition_total = 1806.19
    end_cap_total = 262.50
    soffit_total = 60.28
    ceiling_area = 1556.00
    
    total_walls = perimeter_total + partition_total + end_cap_total + soffit_total
    gross_area = total_walls + ceiling_area
    
    # CORRECTED net calculation
    net_wall_area = total_walls - total_openings
    net_total = net_wall_area + ceiling_area
    
    # Waste factor
    waste_sqft = net_total * calc.waste_factor
    area_with_waste = net_total * (1 + calc.waste_factor)
    
    # Sheets
    sheets_decimal = area_with_waste / calc.sheet_size_sqft
    sheets_required = int(sheets_decimal) + 1
    
    print("WALL CALCULATIONS (by Category):")
    print("-" * 100)
    print(f"  1. Perimeter Walls:           {perimeter_total:>10.2f} sq ft")
    print(f"  2. Interior Partitions:       {partition_total:>10.2f} sq ft")
    print(f"  3. Partition End Caps:        {end_cap_total:>10.2f} sq ft")
    print(f"  4. Soffit Faces:              {soffit_total:>10.2f} sq ft")
    print(f"     " + "-" * 40)
    print(f"     Subtotal Walls:            {total_walls:>10.2f} sq ft")
    print()
    print(f"  5. Ceiling:                   {ceiling_area:>10.2f} sq ft")
    print()
    print(f"  OPENINGS (CORRECTED):")
    print(f"     Doors (10 total):          {door_total:>10.2f} sq ft")
    print(f"     Windows (6 total):         {window_total:>10.2f} sq ft")
    print(f"     " + "-" * 40)
    print(f"     Total Openings:           -{total_openings:>10.2f} sq ft")
    
    print()
    print("NET AREA CALCULATION:")
    print("-" * 100)
    print(f"  Gross Area (Walls + Ceiling): {gross_area:>10.2f} sq ft")
    print(f"  Less Openings:               -{total_openings:>10.2f} sq ft")
    print(f"  " + "-" * 50)
    print(f"  Net Area:                     {net_total:>10.2f} sq ft")
    
    print()
    print("MATERIAL REQUIREMENTS:")
    print("-" * 100)
    print(f"  Net Area:                     {net_total:>10.2f} sq ft")
    print(f"  Waste Factor (15%):          +{waste_sqft:>10.2f} sq ft")
    print(f"  " + "-" * 50)
    print(f"  Area with Waste:              {area_with_waste:>10.2f} sq ft")
    print()
    print(f"  Sheet Size:                   {calc.sheet_size_sqft:>10.0f} sq ft (4' × 12')")
    print(f"  Sheets Required:              {sheets_required:>10} sheets")
    
    # ==========================================================================
    # FINAL COMPARISON
    # ==========================================================================
    print_section("FINAL COMPARISON: ORIGINAL vs CORRECTED")
    
    # Original values
    orig_net_total = 4995.64
    orig_with_waste = 5744.98
    orig_sheets = 120
    
    print(f"{'Metric':<30} {'Original':<15} {'Corrected':<15} {'Difference':<15}")
    print("-" * 100)
    print(f"{'Doors Counted':<30} {'7':<15} {'10':<15} {'+3 doors':<15}")
    print(f"{'Windows Counted':<30} {'4':<15} {'6':<15} {'+2 windows':<15}")
    print(f"{'Opening Deductions (sq ft)':<30} {original_openings:<15.2f} {total_openings:<15.2f} {total_openings - original_openings:+.2f} sq ft")
    print(f"{'Net Area (sq ft)':<30} {orig_net_total:<15.2f} {net_total:<15.2f} {net_total - orig_net_total:+.2f} sq ft")
    print(f"{'Area + Waste (sq ft)':<30} {orig_with_waste:<15.2f} {area_with_waste:<15.2f} {area_with_waste - orig_with_waste:+.2f} sq ft")
    print(f"{'Sheets Required':<30} {orig_sheets:<15} {sheets_required:<15} {sheets_required - orig_sheets:+} sheets")
    
    print()
    print("=" * 100)
    print("CONCLUSION:")
    print("=" * 100)
    print()
    print(f"  The advanced multi-phase extraction found {corrected_total - original_total} additional doors")
    print(f"  and {corr_win - orig_win} additional windows that were missed in the first pass.")
    print()
    print(f"  This increases opening deductions by {total_openings - original_openings:.2f} sq ft,")
    print(f"  reducing the net drywall required.")
    print()
    print(f"  CORRECTED MATERIAL ORDER:")
    print(f"  - {sheets_required} sheets of 4' × 12' drywall")
    print(f"  - 116.38 linear ft of corner bead")
    print()
    print("=" * 100)


if __name__ == "__main__":
    main()

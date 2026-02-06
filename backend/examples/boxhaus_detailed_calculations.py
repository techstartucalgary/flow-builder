"""
Boxhaus Basement - DETAILED CALCULATION BREAKDOWN
Shows every number and formula used in the drywall estimate.
"""

from src.estimators.drywall.calculator_v2 import DrywallCalculator


def print_section(title):
    """Print a section header."""
    print()
    print("=" * 100)
    print(f"  {title}")
    print("=" * 100)
    print()


def main():
    """Show detailed step-by-step calculations."""
    
    calc = DrywallCalculator(
        ceiling_height_ft=9.0,
        waste_factor=0.15,
        sheet_width_ft=4.0,
        sheet_length_ft=12.0,
    )
    
    print("=" * 100)
    print("BOXHAUS BASEMENT - DETAILED CALCULATION BREAKDOWN")
    print("=" * 100)
    print()
    print("CONSTANTS:")
    print(f"  Ceiling Height: {calc.ceiling_height_ft} ft (from FLOWBUILDR_CONTEXT.md)")
    print(f"  Waste Factor: {calc.waste_factor * 100}% (from FLOWBUILDR_CONTEXT.md)")
    print(f"  Sheet Size: {calc.sheet_size_sqft} sq ft (4' × 12')")
    
    # ==================== DIMENSION PARSING ====================
    print_section("STEP 1: PARSE DIMENSIONS FROM FLOOR PLAN")
    
    print("Raw dimensions from Gemini extraction:")
    print("-" * 100)
    
    dims_to_parse = [
        ("42'-1 1/2\"", "Perimeter Top/Bottom"),
        ("42'-11 1/2\"", "Perimeter Left/Right"),
        ("35'-1 3/4\"", "Central spine"),
        ("17'-9\"", "Guest/Bath divider"),
        ("14'-4\"", "Gym/Rec divider"),
        ("10'-10 3/4\"", "Mech front"),
        ("7'-6 3/4\"", "Mech side"),
        ("5'-2 3/4\"", "Laundry wall"),
        ("5'-0 1/2\"", "Storage wall"),
        ("4'-4 5/8\"", "Linen closet"),
        ("5'-8 3/8\"", "Guest Suite end"),
        ("8'-10 5/8\"", "Bath/Hallway end"),
        ("2'-8\"", "Door Tag 2"),
        ("2'-4\"", "Door Tag 7"),
    ]
    
    parsed_dims = {}
    for raw, desc in dims_to_parse:
        parsed = calc.parse_dimension(raw)
        parsed_dims[desc] = parsed
        
        # Show the parsing breakdown
        if "'" in raw:
            parts = raw.replace('"', '').split("'")
            feet = parts[0].strip()
            inches_part = parts[1].strip() if len(parts) > 1 and parts[1].strip() else "0"
            
            # Calculate inches
            if ' ' in inches_part:
                components = inches_part.replace('-', ' ').split()
                total_inches = 0.0
                for comp in components:
                    if '/' in comp:
                        num, denom = comp.split('/')
                        total_inches += float(num) / float(denom)
                    else:
                        total_inches += float(comp)
                inches_decimal = total_inches
            elif '/' in inches_part:
                num, denom = inches_part.split('/')
                inches_decimal = float(num) / float(denom)
            else:
                inches_decimal = float(inches_part) if inches_part else 0.0
            
            print(f"{raw:20} = {feet} ft + {inches_decimal:.4f} in")
            print(f"{' ' * 20} = {feet} ft + ({inches_decimal:.4f} / 12) ft")
            print(f"{' ' * 20} = {parsed:.4f} ft  [{desc}]")
            print()
    
    # ==================== PERIMETER WALLS ====================
    print_section("STEP 2: PERIMETER WALLS (Foundation - 1 Side Only)")
    
    print("Formula: Area = Length × Height × 1 side")
    print("-" * 100)
    
    perimeter_calcs = [
        ("Top wall", parsed_dims["Perimeter Top/Bottom"]),
        ("Bottom wall", parsed_dims["Perimeter Top/Bottom"]),
        ("Left wall", parsed_dims["Perimeter Left/Right"]),
        ("Right wall", parsed_dims["Perimeter Left/Right"]),
    ]
    
    perimeter_total = 0.0
    for desc, length in perimeter_calcs:
        area = length * calc.ceiling_height_ft
        perimeter_total += area
        print(f"{desc:30} = {length:.4f} ft × {calc.ceiling_height_ft:.1f} ft × 1 side")
        print(f"{' ' * 30} = {area:.2f} sq ft")
        print()
    
    print(f"{'PERIMETER SUBTOTAL:':30} = {perimeter_total:.2f} sq ft")
    
    # ==================== INTERIOR PARTITIONS ====================
    print_section("STEP 3: INTERIOR PARTITIONS (Both Sides Drywalled)")
    
    print("Formula: Area = Length × Height × 2 sides")
    print("-" * 100)
    
    partition_calcs = [
        ("Central spine (Guest/Bath to Rec Room)", parsed_dims["Central spine"]),
        ("Guest Suite / Bath 4 divider", parsed_dims["Guest/Bath divider"]),
        ("Gym / Rec Room divider", parsed_dims["Gym/Rec divider"]),
        ("Mech room front wall", parsed_dims["Mech front"]),
        ("Mech room side wall", parsed_dims["Mech side"]),
        ("Laundry enclosure", parsed_dims["Laundry wall"]),
        ("Storage wall", parsed_dims["Storage wall"]),
        ("Linen closet walls", parsed_dims["Linen closet"]),
    ]
    
    partition_total = 0.0
    for desc, length in partition_calcs:
        area = length * calc.ceiling_height_ft * 2
        partition_total += area
        print(f"{desc:45} = {length:.4f} ft × {calc.ceiling_height_ft:.1f} ft × 2 sides")
        print(f"{' ' * 45} = {area:.2f} sq ft")
        print()
    
    print(f"{'INTERIOR PARTITIONS SUBTOTAL:':45} = {partition_total:.2f} sq ft")
    print()
    print("✓ VALIDATION: All partitions are 2-sided (correct for interior walls)")
    
    # ==================== END CAPS ====================
    print_section("STEP 4: PARTITION END CAPS (Y-Direction 'Poke Outs')")
    
    print("Formula: Area = Length × Height × 2 sides")
    print("Corner Bead: Height × 2 (both vertical edges)")
    print("-" * 100)
    
    end_cap_calcs = [
        ("Guest Suite partition end", parsed_dims["Guest Suite end"]),
        ("Bath/Hallway partition end", parsed_dims["Bath/Hallway end"]),
    ]
    
    end_cap_total = 0.0
    corner_bead_end_caps = 0.0
    for desc, length in end_cap_calcs:
        area = length * calc.ceiling_height_ft * 2
        corner_bead = calc.ceiling_height_ft * 2
        end_cap_total += area
        corner_bead_end_caps += corner_bead
        
        print(f"{desc:45} = {length:.4f} ft × {calc.ceiling_height_ft:.1f} ft × 2 sides")
        print(f"{' ' * 45} = {area:.2f} sq ft")
        print(f"{' ' * 45}   Corner Bead: {calc.ceiling_height_ft:.1f} ft × 2 edges = {corner_bead:.2f} linear ft")
        print()
    
    print(f"{'END CAPS SUBTOTAL:':45} = {end_cap_total:.2f} sq ft")
    print(f"{'END CAPS CORNER BEAD:':45} = {corner_bead_end_caps:.2f} linear ft")
    print()
    print("⚠️  NOTE: Small square footage but LABOR INTENSIVE (extra mudding, difficult alignment)")
    
    # ==================== SOFFITS ====================
    print_section("STEP 5: SOFFIT FACES (Dropped Ceiling Vertical Transitions)")
    
    print("Formula: Area = Length × Drop Height × 1 side")
    print("Corner Bead: Length × 2 (top and bottom transitions)")
    print("-" * 100)
    
    soffit_drop = 1.5  # feet
    soffit_calcs = [
        ("Central corridor dropped ceiling", parsed_dims["Central spine"], soffit_drop),
        ("Storage area dropped ceiling", parsed_dims["Storage wall"], soffit_drop),
    ]
    
    soffit_total = 0.0
    corner_bead_soffits = 0.0
    for desc, length, drop in soffit_calcs:
        area = length * drop
        corner_bead = length * 2
        soffit_total += area
        corner_bead_soffits += corner_bead
        
        print(f"{desc:45} = {length:.4f} ft × {drop:.1f} ft × 1 side")
        print(f"{' ' * 45} = {area:.2f} sq ft")
        print(f"{' ' * 45}   Corner Bead: {length:.4f} ft × 2 (top + bottom) = {corner_bead:.2f} linear ft")
        print()
    
    print(f"{'SOFFIT SUBTOTAL:':45} = {soffit_total:.2f} sq ft")
    print(f"{'SOFFIT CORNER BEAD:':45} = {corner_bead_soffits:.2f} linear ft")
    print()
    print("NOTE: Typically hides HVAC ducting in corridors")
    
    # ==================== CEILING ====================
    print_section("STEP 6: CEILING AREA")
    
    ceiling_area = 1556.0
    print(f"Ceiling Area (from plan annotation): {ceiling_area:.2f} sq ft")
    print()
    print("NOTE: Use 4'×12' sheets to minimize joints (reduces taping/mudding time)")
    
    # ==================== WALL TOTALS ====================
    print_section("STEP 7: WALL TOTALS")
    
    total_walls = perimeter_total + partition_total + end_cap_total + soffit_total
    
    print(f"Perimeter Walls:        {perimeter_total:>12.2f} sq ft")
    print(f"Interior Partitions:    {partition_total:>12.2f} sq ft")
    print(f"Partition End Caps:     {end_cap_total:>12.2f} sq ft")
    print(f"Soffit Faces:           {soffit_total:>12.2f} sq ft")
    print("-" * 50)
    print(f"TOTAL WALLS:            {total_walls:>12.2f} sq ft")
    
    # ==================== OPENINGS ====================
    print_section("STEP 8: OPENINGS (Deductions)")
    
    print("Formula: Area = Width × Height × Quantity")
    print("-" * 100)
    
    # Windows
    print("WINDOWS:")
    window_calcs = [
        ("Tag 1 - Rec Room", 5.0, 3.0, 3),
        ("Tag 2 - Guest Suite", 3.5, 3.0, 1),
    ]
    
    window_total = 0.0
    for desc, width, height, qty in window_calcs:
        area = width * height * qty
        window_total += area
        print(f"  {desc:35} = {width:.1f} ft × {height:.1f} ft × {qty} = {area:.2f} sq ft")
    
    print()
    print("DOORS:")
    door_calcs = [
        ("Tag 2 (5 doors)", parsed_dims["Door Tag 2"], 8.0, 5),
        ("Tag 7 (Linen)", parsed_dims["Door Tag 7"], 8.0, 1),
        ("Tag 16 (Gym Double Door)", 5.0, 8.0, 1),
    ]
    
    door_total = 0.0
    for desc, width, height, qty in door_calcs:
        area = width * height * qty
        door_total += area
        print(f"  {desc:35} = {width:.4f} ft × {height:.1f} ft × {qty} = {area:.2f} sq ft")
    
    openings_total = window_total + door_total
    print()
    print(f"{'TOTAL OPENINGS:':39} = {openings_total:.2f} sq ft")
    
    # ==================== NET AREA ====================
    print_section("STEP 9: NET AREA CALCULATION")
    
    gross_area = total_walls + ceiling_area
    net_wall_area = total_walls - openings_total
    net_total = net_wall_area + ceiling_area
    
    print("Gross Area (before openings):")
    print(f"  Total Walls:            {total_walls:>12.2f} sq ft")
    print(f"  + Ceiling:              {ceiling_area:>12.2f} sq ft")
    print(f"  " + "-" * 40)
    print(f"  Gross Area:             {gross_area:>12.2f} sq ft")
    print()
    print("Net Area (after deducting openings):")
    print(f"  Total Walls:            {total_walls:>12.2f} sq ft")
    print(f"  - Openings:             {openings_total:>12.2f} sq ft")
    print(f"  " + "-" * 40)
    print(f"  Net Wall Area:          {net_wall_area:>12.2f} sq ft")
    print(f"  + Ceiling:              {ceiling_area:>12.2f} sq ft")
    print(f"  " + "-" * 40)
    print(f"  NET TOTAL AREA:         {net_total:>12.2f} sq ft")
    
    # ==================== WASTE FACTOR ====================
    print_section("STEP 10: WASTE FACTOR APPLICATION")
    
    waste_sqft = net_total * calc.waste_factor
    area_with_waste = net_total * (1 + calc.waste_factor)
    
    print(f"Net Total Area:         {net_total:>12.2f} sq ft")
    print(f"Waste Factor:           {calc.waste_factor * 100:>12.1f}%")
    print()
    print("Calculation:")
    print(f"  Waste = {net_total:.2f} sq ft × {calc.waste_factor}")
    print(f"        = {waste_sqft:.2f} sq ft")
    print()
    print(f"  Total = {net_total:.2f} sq ft × (1 + {calc.waste_factor})")
    print(f"        = {net_total:.2f} sq ft × {1 + calc.waste_factor}")
    print(f"        = {area_with_waste:.2f} sq ft")
    
    # ==================== SHEET CALCULATION ====================
    print_section("STEP 11: DRYWALL SHEETS REQUIRED")
    
    sheets_decimal = area_with_waste / calc.sheet_size_sqft
    sheets_required = int(sheets_decimal) + 1
    
    print(f"Sheet Size:             {calc.sheet_size_sqft:>12.0f} sq ft (4' × 12')")
    print(f"Area with Waste:        {area_with_waste:>12.2f} sq ft")
    print()
    print("Calculation:")
    print(f"  Sheets = {area_with_waste:.2f} sq ft ÷ {calc.sheet_size_sqft:.0f} sq ft/sheet")
    print(f"         = {sheets_decimal:.2f} sheets")
    print(f"         = {sheets_required} sheets (rounded up)")
    print()
    print(f"NOTE: Always round UP to ensure sufficient material")
    
    # ==================== CORNER BEAD ====================
    print_section("STEP 12: CORNER BEAD TOTAL")
    
    total_corner_bead = corner_bead_end_caps + corner_bead_soffits
    
    print(f"End Caps Corner Bead:   {corner_bead_end_caps:>12.2f} linear ft")
    print(f"Soffit Corner Bead:     {corner_bead_soffits:>12.2f} linear ft")
    print("-" * 50)
    print(f"TOTAL CORNER BEAD:      {total_corner_bead:>12.2f} linear ft")
    print()
    print("NOTE: Corner bead required for:")
    print("  - End caps: Both vertical edges of 'poke out' walls")
    print("  - Soffits: Top and bottom transitions at dropped ceilings")
    
    # ==================== FINAL SUMMARY ====================
    print_section("FINAL SUMMARY")
    
    print("MATERIAL REQUIREMENTS:")
    print("-" * 100)
    print(f"  Drywall Sheets (4'×12'):     {sheets_required:>8} sheets")
    print(f"  Corner Bead:                 {total_corner_bead:>8.2f} linear ft")
    print()
    print("SQUARE FOOTAGE BREAKDOWN:")
    print("-" * 100)
    print(f"  1. Perimeter Walls:          {perimeter_total:>10.2f} sq ft  (Foundation - 1 side)")
    print(f"  2. Interior Partitions:      {partition_total:>10.2f} sq ft  (Heavy lifters - 2 sides)")
    print(f"  3. Partition End Caps:       {end_cap_total:>10.2f} sq ft  (Labor intensive)")
    print(f"  4. Soffit Faces:             {soffit_total:>10.2f} sq ft  (Dropped ceiling)")
    print(f"  5. Ceiling:                  {ceiling_area:>10.2f} sq ft  (4'×12' sheets preferred)")
    print(f"     " + "-" * 40)
    print(f"     Gross Total:              {gross_area:>10.2f} sq ft")
    print(f"     Less Openings:            {openings_total:>10.2f} sq ft")
    print(f"     Net Total:                {net_total:>10.2f} sq ft")
    print(f"     + 15% Waste:              {waste_sqft:>10.2f} sq ft")
    print(f"     " + "-" * 40)
    print(f"     FINAL AREA:               {area_with_waste:>10.2f} sq ft")
    print()
    print("=" * 100)


if __name__ == "__main__":
    main()

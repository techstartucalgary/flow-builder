"""
Boxhaus Basement - IMPROVED INTERIOR PARTITION CALCULATION
=========================================================
Applies the Subtraction Rule per wall segment:
  Net Wall Area = Gross Area - Door Opening Areas

Each partition is calculated with:
1. Gross length (from dimension strings)
2. Doors IN that specific wall identified
3. Door areas subtracted
4. Net area calculated
"""

from src.estimators.drywall.calculator_v2 import DrywallCalculator


def print_section(title):
    print()
    print("=" * 110)
    print(f"  {title}")
    print("=" * 110)
    print()


def main():
    calc = DrywallCalculator(
        ceiling_height_ft=9.0,
        waste_factor=0.15,
        sheet_width_ft=4.0,
        sheet_length_ft=12.0,
    )
    
    print("=" * 110)
    print("BOXHAUS BASEMENT - IMPROVED INTERIOR PARTITION CALCULATIONS")
    print("Subtraction Rule: Net Area = (Gross Length × Height × 2) - (Door Width × Door Height × 2)")
    print("=" * 110)
    
    # Door dimensions
    door_1_w = calc.parse_dimension("2'-6\"")   # 2.5 ft
    door_2_w = calc.parse_dimension("2'-8\"")   # 2.667 ft
    door_7_w = calc.parse_dimension("2'-4\"")   # 2.333 ft
    door_16_w = 5.0                              # 5 ft
    door_h = 8.0                                 # All doors 8'-0"
    
    print_section("DOOR INVENTORY FOR PARTITION ASSIGNMENT")
    
    print("Doors to assign to partitions:")
    print("-" * 110)
    print(f"  Tag 1:  2 doors @ {door_1_w:.3f} ft × {door_h:.1f} ft = Bath 4 Jack & Jill (2 entries)")
    print(f"  Tag 2:  4 doors @ {door_2_w:.3f} ft × {door_h:.1f} ft = Guest, Laundry, Mech, Storage entries")
    print(f"  Tag 7:  1 door  @ {door_7_w:.3f} ft × {door_h:.1f} ft = Linen closet")
    print(f"  Tag 16: 2 doors @ {door_16_w:.3f} ft × {door_h:.1f} ft = Guest closet + Gym entry")
    print()
    print("  Note: Tag 5 (16' slider) is in PERIMETER wall, not interior partition")
    
    print_section("PARTITION-BY-PARTITION CALCULATION WITH DOOR DEDUCTIONS")
    
    height = 9.0
    sides = 2
    
    # Define partitions with their doors
    partitions = [
        {
            "name": "Central Spine (Guest/Bath corridor to Rec Room)",
            "length": calc.parse_dimension("35'-1 3/4\""),
            "doors": [
                ("Tag 2 - Guest Suite entry", door_2_w, door_h),
                ("Tag 1 - Bath 4 from hallway", door_1_w, door_h),
            ],
        },
        {
            "name": "Guest Suite / Bath 4 Divider",
            "length": calc.parse_dimension("17'-9\""),
            "doors": [
                ("Tag 1 - Bath 4 from Guest Suite", door_1_w, door_h),
                ("Tag 16 - Guest Suite closet", door_16_w, door_h),
            ],
        },
        {
            "name": "Gym / Rec Room Divider",
            "length": calc.parse_dimension("14'-4\""),
            "doors": [
                ("Tag 16 - Gym/Yoga entry", door_16_w, door_h),
            ],
        },
        {
            "name": "Mech Room Front Wall",
            "length": calc.parse_dimension("10'-10 3/4\""),
            "doors": [
                ("Tag 2 - Mech room entry", door_2_w, door_h),
            ],
        },
        {
            "name": "Mech Room Side Wall",
            "length": calc.parse_dimension("7'-6 3/4\""),
            "doors": [],  # No doors in this wall
        },
        {
            "name": "Laundry Enclosure",
            "length": calc.parse_dimension("5'-2 3/4\""),
            "doors": [
                ("Tag 2 - Laundry entry", door_2_w, door_h),
            ],
        },
        {
            "name": "Storage Wall",
            "length": calc.parse_dimension("5'-0 1/2\""),
            "doors": [
                ("Tag 2 - Storage entry", door_2_w, door_h),
            ],
        },
        {
            "name": "Linen Closet Walls",
            "length": calc.parse_dimension("4'-4 5/8\""),
            "doors": [
                ("Tag 7 - Linen closet door", door_7_w, door_h),
            ],
        },
    ]
    
    total_gross = 0.0
    total_door_deductions = 0.0
    total_net = 0.0
    
    for i, p in enumerate(partitions, 1):
        name = p["name"]
        length = p["length"]
        doors = p["doors"]
        
        # Gross calculation
        gross_area = length * height * sides
        
        # Door deductions (doors cut through BOTH sides)
        door_deduction = 0.0
        for door_name, dw, dh in doors:
            door_area = dw * dh * sides  # Both sides
            door_deduction += door_area
        
        # Net calculation
        net_area = gross_area - door_deduction
        
        # Accumulate totals
        total_gross += gross_area
        total_door_deductions += door_deduction
        total_net += net_area
        
        print(f"PARTITION {i}: {name}")
        print("-" * 110)
        print(f"  Gross Length:     {length:.4f} ft")
        print(f"  Height:           {height:.1f} ft")
        print(f"  Sides:            {sides}")
        print()
        print(f"  GROSS AREA:       {length:.4f} ft × {height:.1f} ft × {sides} sides = {gross_area:>10.2f} sq ft")
        print()
        
        if doors:
            print(f"  DOOR DEDUCTIONS (doors cut through both sides of partition):")
            for door_name, dw, dh in doors:
                door_area = dw * dh * sides
                print(f"    - {door_name}:")
                print(f"        {dw:.3f} ft × {dh:.1f} ft × {sides} sides = {door_area:>8.2f} sq ft")
            print(f"    " + "-" * 50)
            print(f"    Total Door Deduction:                    {door_deduction:>8.2f} sq ft")
        else:
            print(f"  DOOR DEDUCTIONS: None (no doors in this wall)")
            print(f"    Total Door Deduction:                    {door_deduction:>8.2f} sq ft")
        
        print()
        print(f"  NET AREA:         {gross_area:.2f} - {door_deduction:.2f} = {net_area:>10.2f} sq ft")
        print()
        print()
    
    # Summary
    print_section("INTERIOR PARTITIONS SUMMARY")
    
    print(f"{'Partition':<50} {'Gross':<12} {'Doors':<12} {'Net':<12}")
    print("-" * 110)
    
    for p in partitions:
        name = p["name"][:48]  # Truncate if needed
        length = p["length"]
        gross = length * height * sides
        door_ded = sum(dw * dh * sides for _, dw, dh in p["doors"])
        net = gross - door_ded
        print(f"{name:<50} {gross:>10.2f}   {door_ded:>10.2f}   {net:>10.2f}")
    
    print("-" * 110)
    print(f"{'TOTALS':<50} {total_gross:>10.2f}   {total_door_deductions:>10.2f}   {total_net:>10.2f}")
    
    print()
    print("COMPARISON:")
    print("-" * 110)
    print(f"  Original calculation (no door deductions):    {total_gross:>10.2f} sq ft")
    print(f"  Door deductions from partitions:             -{total_door_deductions:>10.2f} sq ft")
    print(f"  Corrected Interior Partition Area:            {total_net:>10.2f} sq ft")
    print()
    print(f"  Savings from proper door attribution:         {total_door_deductions:>10.2f} sq ft")
    
    print_section("VALIDATION: DOOR COUNT CHECK")
    
    total_doors = sum(len(p["doors"]) for p in partitions)
    print(f"  Doors assigned to partitions: {total_doors}")
    print(f"  Expected partition doors:     9 (Tags 1×2 + 2×4 + 7×1 + 16×2 = 9)")
    print(f"  Note: Tag 5 (16' slider) is in perimeter wall, not counted here")
    print()
    
    if total_doors == 9:
        print("  ✓ VALIDATION PASSED: All 9 partition doors accounted for")
    else:
        print(f"  ⚠️  VALIDATION ISSUE: Expected 9, found {total_doors}")
    
    print()
    print("=" * 110)


if __name__ == "__main__":
    main()

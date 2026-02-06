"""
Interior Partition Data Model with V/H Orientation
===================================================
Extracted from Boxhaus Basement using Gemini 3 Pro Vision
"""

from dataclasses import dataclass
from typing import List, Literal


@dataclass
class InteriorPartition:
    """Represents an interior partition wall with orientation."""
    id: str
    orientation: Literal["V", "H"]  # Vertical or Horizontal
    rooms_separated: str
    dimension_string: str  # Raw from plan (e.g., "12'-4 3/4"")
    length_ft: float  # Parsed decimal feet
    notes: str = ""
    
    @property
    def area_single_side(self) -> float:
        """Calculate single-side area (length × 9ft height)."""
        return self.length_ft * 9.0
    
    @property
    def area_double_sided(self) -> float:
        """Calculate double-sided area for drywall."""
        return self.length_ft * 9.0 * 2.0


@dataclass
class PartitionSummary:
    """Summary of interior partitions by orientation."""
    vertical_partitions: List[InteriorPartition]
    horizontal_partitions: List[InteriorPartition]
    
    @property
    def vertical_count(self) -> int:
        return len(self.vertical_partitions)
    
    @property
    def horizontal_count(self) -> int:
        return len(self.horizontal_partitions)
    
    @property
    def total_count(self) -> int:
        return self.vertical_count + self.horizontal_count
    
    @property
    def vertical_linear_ft(self) -> float:
        return sum(p.length_ft for p in self.vertical_partitions)
    
    @property
    def horizontal_linear_ft(self) -> float:
        return sum(p.length_ft for p in self.horizontal_partitions)
    
    @property
    def total_linear_ft(self) -> float:
        return self.vertical_linear_ft + self.horizontal_linear_ft
    
    @property
    def total_drywall_area_sqft(self) -> float:
        """Total double-sided drywall area."""
        return self.total_linear_ft * 9.0 * 2.0


def boxhaus_basement_partitions() -> PartitionSummary:
    """
    Interior partitions extracted from Boxhaus Basement
    using Gemini 3 Pro Vision model.
    
    Based on vision extraction 2026-02-01.
    """
    vertical = [
        InteriorPartition(
            id="V1",
            orientation="V",
            rooms_separated="Guest Suite/Storage vs. Bath/Laundry/Hall",
            dimension_string="17'-9\" + 7'-6 1/2\"",
            length_ft=25.29,
            notes="Vertical spine separating left rooms from central core"
        ),
        InteriorPartition(
            id="V2",
            orientation="V",
            rooms_separated="Bath/Laundry vs. Linen/Stairs",
            dimension_string="17'-9\"",
            length_ft=17.75,
            notes="Vertical wall defining left side of stair/linen core"
        ),
        InteriorPartition(
            id="V3",
            orientation="V",
            rooms_separated="Linen/Stairs vs. Gym/Mech",
            dimension_string="14'-4\" + 10'-10 3/4\"",
            length_ft=25.23,
            notes="Vertical wall defining right side of stair core"
        ),
    ]
    
    horizontal = [
        InteriorPartition(
            id="H1",
            orientation="H",
            rooms_separated="Guest Suite vs. Storage",
            dimension_string="13'-4 3/4\"",
            length_ft=13.40,
            notes="Horizontal wall between Guest Suite and Storage closet"
        ),
        InteriorPartition(
            id="H2",
            orientation="H",
            rooms_separated="Storage vs. Rec Room",
            dimension_string="13'-4 3/4\"",
            length_ft=13.40,
            notes="Horizontal wall separating Storage from Rec Room"
        ),
        InteriorPartition(
            id="H3",
            orientation="H",
            rooms_separated="Bath 4 vs. Laundry",
            dimension_string="8'-10 5/8\"",
            length_ft=8.89,
            notes="Horizontal wall separating bathroom from laundry"
        ),
        InteriorPartition(
            id="H4",
            orientation="H",
            rooms_separated="Laundry vs. Hall/Corridor",
            dimension_string="8'-10 5/8\"",
            length_ft=8.89,
            notes="Horizontal wall separating Laundry from corridor"
        ),
        InteriorPartition(
            id="H5",
            orientation="H",
            rooms_separated="Linen Closet (Front)",
            dimension_string="5'-8 3/8\"",
            length_ft=5.70,
            notes="Front wall of linen closet"
        ),
        InteriorPartition(
            id="H6",
            orientation="H",
            rooms_separated="Linen Closet (Back)",
            dimension_string="5'-8 3/8\"",
            length_ft=5.70,
            notes="Rear wall of linen closet"
        ),
        InteriorPartition(
            id="H7",
            orientation="H",
            rooms_separated="Gym vs. Mech Room",
            dimension_string="7'-1 7/8\" + 6'-11 3/4\"",
            length_ft=14.14,
            notes="Horizontal wall separating Gym from Mechanical"
        ),
        InteriorPartition(
            id="H8",
            orientation="H",
            rooms_separated="Mech Room vs. Rec Room",
            dimension_string="14'-5 1/4\"",
            length_ft=14.44,
            notes="Horizontal wall separating Mech from Rec Room"
        ),
    ]
    
    return PartitionSummary(
        vertical_partitions=vertical,
        horizontal_partitions=horizontal
    )


def print_partition_report(summary: PartitionSummary):
    """Print detailed partition report."""
    print("=" * 100)
    print("INTERIOR PARTITION ANALYSIS - BOXHAUS BASEMENT")
    print("=" * 100)
    print()
    
    # Vertical partitions
    print("VERTICAL PARTITIONS (North-South)")
    print("-" * 100)
    print(f"{'ID':<6} {'Rooms Separated':<45} {'Dimension':<18} {'Linear Ft':>10}")
    print("-" * 100)
    for p in summary.vertical_partitions:
        print(f"{p.id:<6} {p.rooms_separated:<45} {p.dimension_string:<18} {p.length_ft:>10.2f}")
    print("-" * 100)
    print(f"{'VERTICAL TOTAL:':<71} {summary.vertical_linear_ft:>10.2f} ft")
    print()
    
    # Horizontal partitions
    print("HORIZONTAL PARTITIONS (East-West)")
    print("-" * 100)
    print(f"{'ID':<6} {'Rooms Separated':<45} {'Dimension':<18} {'Linear Ft':>10}")
    print("-" * 100)
    for p in summary.horizontal_partitions:
        print(f"{p.id:<6} {p.rooms_separated:<45} {p.dimension_string:<18} {p.length_ft:>10.2f}")
    print("-" * 100)
    print(f"{'HORIZONTAL TOTAL:':<71} {summary.horizontal_linear_ft:>10.2f} ft")
    print()
    
    # Summary
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)
    print(f"Vertical (V) partitions:    {summary.vertical_count:>3} segments = {summary.vertical_linear_ft:>7.2f} linear ft")
    print(f"Horizontal (H) partitions:  {summary.horizontal_count:>3} segments = {summary.horizontal_linear_ft:>7.2f} linear ft")
    print("-" * 100)
    print(f"TOTAL INTERIOR PARTITIONS:  {summary.total_count:>3} segments = {summary.total_linear_ft:>7.2f} linear ft")
    print()
    print("DRYWALL CALCULATION (Double-Sided):")
    print("-" * 100)
    print(f"Linear feet:        {summary.total_linear_ft:>10.2f} ft")
    print(f"Wall height:        {9.0:>10.1f} ft")
    print(f"Sides:              {2:>10} (both sides)")
    print(f"Gross area:         {summary.total_drywall_area_sqft:>10.2f} sq ft")
    print()
    print("=" * 100)


if __name__ == "__main__":
    summary = boxhaus_basement_partitions()
    print_partition_report(summary)

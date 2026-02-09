"""Drywall square footage calculator for construction takeoff."""

from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class WallSegment:
    """Represents a wall segment with length and height."""
    length_ft: float
    height_ft: float
    description: str = ""
    
    @property
    def area_sqft(self) -> float:
        """Calculate wall area in square feet."""
        return self.length_ft * self.height_ft


@dataclass
class Opening:
    """Represents a window or door opening."""
    width_ft: float
    height_ft: float
    quantity: int = 1
    description: str = ""
    
    @property
    def total_area_sqft(self) -> float:
        """Calculate total opening area (all quantities)."""
        return self.width_ft * self.height_ft * self.quantity


@dataclass
class DrywallEstimate:
    """Complete drywall estimate with breakdown."""
    # Wall calculations
    perimeter_walls_sqft: float
    interior_partitions_sqft: float
    total_wall_area_sqft: float
    
    # Ceiling calculations
    ceiling_area_sqft: float
    
    # Openings
    total_openings_sqft: float
    
    # Net area
    net_wall_area_sqft: float
    gross_area_sqft: float  # walls + ceiling before openings
    net_total_sqft: float   # walls + ceiling after openings
    
    # Material calculations
    waste_factor: float
    area_with_waste_sqft: float
    sheet_size_sqft: float
    sheets_required: int
    
    # Breakdown details
    wall_segments: List[WallSegment]
    openings: List[Opening]


class DrywallCalculator:
    """Calculate drywall requirements from floor plan data."""
    
    def __init__(
        self,
        ceiling_height_ft: float = 9.0,
        waste_factor: float = 0.15,
        sheet_width_ft: float = 4.0,
        sheet_length_ft: float = 12.0,
    ):
        """
        Initialize calculator with defaults.
        
        Args:
            ceiling_height_ft: Wall height (default 9' from FLOWBUILDR_CONTEXT)
            waste_factor: Waste percentage (default 15% = 0.15)
            sheet_width_ft: Sheet width (default 4')
            sheet_length_ft: Sheet length (default 12')
        """
        self.ceiling_height_ft = ceiling_height_ft
        self.waste_factor = waste_factor
        self.sheet_size_sqft = sheet_width_ft * sheet_length_ft
    
    def parse_dimension(self, dim_str: str) -> float:
        """
        Parse dimension string like "42'-1 1/2\"" to decimal feet.
        
        Args:
            dim_str: Dimension string (e.g., "42'-1 1/2\"")
            
        Returns:
            Decimal feet (e.g., 42.125)
        """
        # Remove extra whitespace and quotes
        dim_str = dim_str.strip().replace('"', '')
        
        # Split by apostrophe to get feet and inches
        if "'" in dim_str:
            parts = dim_str.split("'")
            feet = float(parts[0].strip())
            
            if len(parts) > 1 and parts[1].strip():
                # Parse inches (might include fractions)
                inches_str = parts[1].strip().replace('-', ' ')
                
                # Handle fractions like "1 1/2"
                if ' ' in inches_str:
                    components = inches_str.split()
                    inches = 0.0
                    for comp in components:
                        if '/' in comp:
                            num, denom = comp.split('/')
                            inches += float(num) / float(denom)
                        else:
                            inches += float(comp)
                elif '/' in inches_str:
                    num, denom = inches_str.split('/')
                    inches = float(num) / float(denom)
                else:
                    inches = float(inches_str)
                
                feet += inches / 12.0
        else:
            # No apostrophe, assume it's just feet
            feet = float(dim_str)
        
        return feet
    
    def calculate_perimeter_walls(
        self,
        perimeter_dims: List[Tuple[float, str]],
    ) -> Tuple[float, List[WallSegment]]:
        """
        Calculate total perimeter wall area.
        
        Args:
            perimeter_dims: List of (length_ft, description) tuples
            
        Returns:
            Tuple of (total_sqft, segments_list)
        """
        segments = []
        total_sqft = 0.0
        
        for length_ft, desc in perimeter_dims:
            segment = WallSegment(
                length_ft=length_ft,
                height_ft=self.ceiling_height_ft,
                description=f"Perimeter - {desc}"
            )
            segments.append(segment)
            total_sqft += segment.area_sqft
        
        return total_sqft, segments
    
    def calculate_interior_partitions(
        self,
        partition_dims: List[Tuple[float, str, int]],
    ) -> Tuple[float, List[WallSegment]]:
        """
        Calculate total interior partition area.
        
        Args:
            partition_dims: List of (length_ft, description, sides) tuples
                           sides = 1 for one side, 2 for both sides
            
        Returns:
            Tuple of (total_sqft, segments_list)
        """
        segments = []
        total_sqft = 0.0
        
        for length_ft, desc, sides in partition_dims:
            segment = WallSegment(
                length_ft=length_ft * sides,  # Both sides if 2
                height_ft=self.ceiling_height_ft,
                description=f"Partition - {desc} ({sides} side{'s' if sides > 1 else ''})"
            )
            segments.append(segment)
            total_sqft += segment.area_sqft
        
        return total_sqft, segments
    
    def calculate_openings(
        self,
        windows: List[Tuple[float, float, int, str]],
        doors: List[Tuple[float, float, int, str]],
    ) -> Tuple[float, List[Opening]]:
        """
        Calculate total opening deductions.
        
        Args:
            windows: List of (width_ft, height_ft, quantity, description)
            doors: List of (width_ft, height_ft, quantity, description)
            
        Returns:
            Tuple of (total_sqft, openings_list)
        """
        openings = []
        total_sqft = 0.0
        
        for width, height, qty, desc in windows:
            opening = Opening(
                width_ft=width,
                height_ft=height,
                quantity=qty,
                description=f"Window - {desc}"
            )
            openings.append(opening)
            total_sqft += opening.total_area_sqft
        
        for width, height, qty, desc in doors:
            opening = Opening(
                width_ft=width,
                height_ft=height,
                quantity=qty,
                description=f"Door - {desc}"
            )
            openings.append(opening)
            total_sqft += opening.total_area_sqft
        
        return total_sqft, openings
    
    def calculate_estimate(
        self,
        perimeter_dims: List[Tuple[float, str]],
        partition_dims: List[Tuple[float, str, int]],
        ceiling_area_sqft: float,
        windows: List[Tuple[float, float, int, str]],
        doors: List[Tuple[float, float, int, str]],
    ) -> DrywallEstimate:
        """
        Calculate complete drywall estimate.
        
        Args:
            perimeter_dims: Perimeter wall dimensions
            partition_dims: Interior partition dimensions
            ceiling_area_sqft: Total ceiling area
            windows: Window openings
            doors: Door openings
            
        Returns:
            Complete DrywallEstimate with breakdown
        """
        # Calculate wall areas
        perimeter_sqft, perimeter_segments = self.calculate_perimeter_walls(perimeter_dims)
        partitions_sqft, partition_segments = self.calculate_interior_partitions(partition_dims)
        total_wall_sqft = perimeter_sqft + partitions_sqft
        
        # Calculate openings
        openings_sqft, openings_list = self.calculate_openings(windows, doors)
        
        # Net calculations
        gross_area = total_wall_sqft + ceiling_area_sqft
        net_wall_area = total_wall_sqft - openings_sqft
        net_total = net_wall_area + ceiling_area_sqft
        
        # Material calculations
        area_with_waste = net_total * (1 + self.waste_factor)
        sheets_required = int(area_with_waste / self.sheet_size_sqft) + 1
        
        return DrywallEstimate(
            perimeter_walls_sqft=perimeter_sqft,
            interior_partitions_sqft=partitions_sqft,
            total_wall_area_sqft=total_wall_sqft,
            ceiling_area_sqft=ceiling_area_sqft,
            total_openings_sqft=openings_sqft,
            net_wall_area_sqft=net_wall_area,
            gross_area_sqft=gross_area,
            net_total_sqft=net_total,
            waste_factor=self.waste_factor,
            area_with_waste_sqft=area_with_waste,
            sheet_size_sqft=self.sheet_size_sqft,
            sheets_required=sheets_required,
            wall_segments=perimeter_segments + partition_segments,
            openings=openings_list,
        )
    
    def format_estimate(self, estimate: DrywallEstimate) -> str:
        """Format estimate as readable text report."""
        lines = [
            "=" * 70,
            "DRYWALL MATERIAL ESTIMATE",
            "=" * 70,
            "",
            "WALL CALCULATIONS",
            "-" * 70,
            f"Perimeter Walls:        {estimate.perimeter_walls_sqft:>10,.2f} sq ft",
            f"Interior Partitions:    {estimate.interior_partitions_sqft:>10,.2f} sq ft",
            f"  Subtotal Walls:       {estimate.total_wall_area_sqft:>10,.2f} sq ft",
            "",
            "CEILING CALCULATIONS",
            "-" * 70,
            f"Ceiling Area:           {estimate.ceiling_area_sqft:>10,.2f} sq ft",
            "",
            "OPENINGS (DEDUCTIONS)",
            "-" * 70,
            f"Windows & Doors:       -{estimate.total_openings_sqft:>10,.2f} sq ft",
            "",
            "NET AREA",
            "-" * 70,
            f"Gross Area (Walls + Ceiling):  {estimate.gross_area_sqft:>10,.2f} sq ft",
            f"Less Openings:                 {estimate.total_openings_sqft:>10,.2f} sq ft",
            f"Net Area:                      {estimate.net_total_sqft:>10,.2f} sq ft",
            "",
            "MATERIAL REQUIREMENTS",
            "-" * 70,
            f"Waste Factor:           {estimate.waste_factor * 100:>10.1f}%",
            f"Area + Waste:           {estimate.area_with_waste_sqft:>10,.2f} sq ft",
            f"Sheet Size:             {estimate.sheet_size_sqft:>10.0f} sq ft (4'x12')",
            f"Sheets Required:        {estimate.sheets_required:>10} sheets",
            "",
            "=" * 70,
        ]
        
        return "\n".join(lines)

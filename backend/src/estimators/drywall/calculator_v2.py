"""Enhanced drywall calculator with category-specific tracking and validation."""

from dataclasses import dataclass, field
from typing import List, Tuple


@dataclass
class WallSegment:
    """Represents a wall segment with length and height."""
    length_ft: float
    height_ft: float
    description: str = ""
    category: str = "wall"  # perimeter, partition, end_cap, soffit
    sides: int = 1
    
    @property
    def area_sqft(self) -> float:
        """Calculate wall area in square feet."""
        return self.length_ft * self.height_ft
    
    @property
    def corner_bead_ft(self) -> float:
        """Calculate corner bead linear feet needed."""
        if self.category == "end_cap":
            # End caps have corner bead on both sides of the "poking out" wall
            return self.height_ft * 2
        elif self.category == "soffit":
            # Soffits need corner bead at top and bottom transitions
            return self.length_ft * 2
        return 0.0


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
class ValidationWarning:
    """Validation warning for manual review."""
    severity: str  # "info", "warning", "error"
    category: str
    message: str


@dataclass
class DrywallEstimate:
    """Complete drywall estimate with breakdown by category."""
    # Category-specific calculations
    perimeter_walls_sqft: float
    interior_partitions_sqft: float
    partition_end_caps_sqft: float
    ceiling_area_sqft: float
    soffit_faces_sqft: float
    
    # Totals
    total_wall_area_sqft: float
    total_openings_sqft: float
    
    # Net area
    net_wall_area_sqft: float
    gross_area_sqft: float  # All surfaces before openings
    net_total_sqft: float   # All surfaces after openings
    
    # Material calculations
    waste_factor: float
    area_with_waste_sqft: float
    sheet_size_sqft: float
    sheets_required: int
    
    # Corner bead (linear feet)
    corner_bead_linear_ft: float
    
    # Breakdown details
    perimeter_segments: List[WallSegment]
    partition_segments: List[WallSegment]
    end_cap_segments: List[WallSegment]
    soffit_segments: List[WallSegment]
    openings: List[Opening]
    
    # Validations
    validation_warnings: List[ValidationWarning] = field(default_factory=list)


class DrywallCalculator:
    """Calculate drywall requirements with category-specific tracking."""
    
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
        Calculate perimeter wall area (foundation walls).
        
        NOTE: Perimeter walls require special attention to:
        - Gap between concrete foundation and drywall
        - Insulation installation
        - Vapor barrier placement
        
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
                description=f"Perimeter - {desc}",
                category="perimeter",
                sides=1,
            )
            segments.append(segment)
            total_sqft += segment.area_sqft
        
        return total_sqft, segments
    
    def calculate_interior_partitions(
        self,
        partition_dims: List[Tuple[float, str, int]],
        validate_double_sided: bool = True,
    ) -> Tuple[float, List[WallSegment], List[ValidationWarning]]:
        """
        Calculate interior partition area (the "heavy lifters").
        
        NOTE: Interior partitions represent the MOST drywall square footage
        since both sides of the studs are typically finished.
        
        Args:
            partition_dims: List of (length_ft, description, sides) tuples
                           sides = 1 for one side, 2 for both sides
            validate_double_sided: If True, warn when sides != 2
            
        Returns:
            Tuple of (total_sqft, segments_list, warnings)
        """
        segments = []
        warnings = []
        total_sqft = 0.0
        
        for length_ft, desc, sides in partition_dims:
            # Validation check
            if validate_double_sided and sides != 2:
                warnings.append(ValidationWarning(
                    severity="warning",
                    category="interior_partition",
                    message=f"⚠️  VERIFY: '{desc}' marked as {sides}-sided. "
                            f"Interior partitions are usually 2-sided. "
                            f"Confirm if this is an exception (e.g., against existing wall)."
                ))
            
            segment = WallSegment(
                length_ft=length_ft * sides,  # Multiply by sides for total linear feet
                height_ft=self.ceiling_height_ft,
                description=f"Partition - {desc} ({sides} side{'s' if sides > 1 else ''})",
                category="partition",
                sides=sides,
            )
            segments.append(segment)
            total_sqft += segment.area_sqft
        
        return total_sqft, segments, warnings
    
    def calculate_partition_end_caps(
        self,
        end_cap_dims: List[Tuple[float, str, int]],
    ) -> Tuple[float, List[WallSegment]]:
        """
        Calculate partition end caps (Y-direction "poking out" walls).
        
        NOTE: While square footage is SMALL, these are LABOR-INTENSIVE:
        - Require corner bead on both vertical edges
        - Extra mudding to ensure sharp, straight corners
        - Difficult to achieve perfect alignment
        
        Args:
            end_cap_dims: List of (length_ft, description, sides) tuples
                         Usually 2 sides (both faces of the "poke out")
            
        Returns:
            Tuple of (total_sqft, segments_list)
        """
        segments = []
        total_sqft = 0.0
        
        for length_ft, desc, sides in end_cap_dims:
            segment = WallSegment(
                length_ft=length_ft * sides,
                height_ft=self.ceiling_height_ft,
                description=f"End Cap - {desc} ({sides} side{'s' if sides > 1 else ''})",
                category="end_cap",
                sides=sides,
            )
            segments.append(segment)
            total_sqft += segment.area_sqft
        
        return total_sqft, segments
    
    def calculate_soffit_faces(
        self,
        soffit_dims: List[Tuple[float, float, str]],
    ) -> Tuple[float, List[WallSegment]]:
        """
        Calculate soffit/bulkhead vertical faces (dropped ceiling transitions).
        
        NOTE: Soffits add both square footage AND corner bead requirements:
        - Vertical "step" faces where ceiling height changes
        - Require corner bead at top and bottom transitions
        - Often located in corridors hiding HVAC ducts
        
        Args:
            soffit_dims: List of (length_ft, drop_height_ft, description) tuples
            
        Returns:
            Tuple of (total_sqft, segments_list)
        """
        segments = []
        total_sqft = 0.0
        
        for length_ft, drop_height_ft, desc in soffit_dims:
            segment = WallSegment(
                length_ft=length_ft,
                height_ft=drop_height_ft,
                description=f"Soffit - {desc}",
                category="soffit",
                sides=1,
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
        end_cap_dims: List[Tuple[float, str, int]],
        soffit_dims: List[Tuple[float, float, str]],
        ceiling_area_sqft: float,
        windows: List[Tuple[float, float, int, str]],
        doors: List[Tuple[float, float, int, str]],
        validate_double_sided: bool = True,
    ) -> DrywallEstimate:
        """
        Calculate complete drywall estimate with category breakdown.
        
        Args:
            perimeter_dims: Perimeter wall dimensions
            partition_dims: Interior partition dimensions
            end_cap_dims: Partition end cap dimensions
            soffit_dims: Soffit/bulkhead dimensions
            ceiling_area_sqft: Total ceiling area
            windows: Window openings
            doors: Door openings
            validate_double_sided: Enable validation warnings
            
        Returns:
            Complete DrywallEstimate with category breakdown
        """
        # Calculate each category
        perimeter_sqft, perimeter_segments = self.calculate_perimeter_walls(perimeter_dims)
        partitions_sqft, partition_segments, warnings = self.calculate_interior_partitions(
            partition_dims, validate_double_sided
        )
        end_caps_sqft, end_cap_segments = self.calculate_partition_end_caps(end_cap_dims)
        soffits_sqft, soffit_segments = self.calculate_soffit_faces(soffit_dims)
        
        # Calculate openings
        openings_sqft, openings_list = self.calculate_openings(windows, doors)
        
        # Calculate totals
        total_wall_sqft = perimeter_sqft + partitions_sqft + end_caps_sqft + soffits_sqft
        gross_area = total_wall_sqft + ceiling_area_sqft
        net_wall_area = total_wall_sqft - openings_sqft
        net_total = net_wall_area + ceiling_area_sqft
        
        # Material calculations
        area_with_waste = net_total * (1 + self.waste_factor)
        sheets_required = int(area_with_waste / self.sheet_size_sqft) + 1
        
        # Calculate corner bead
        corner_bead_ft = sum(seg.corner_bead_ft for seg in end_cap_segments + soffit_segments)
        
        return DrywallEstimate(
            perimeter_walls_sqft=perimeter_sqft,
            interior_partitions_sqft=partitions_sqft,
            partition_end_caps_sqft=end_caps_sqft,
            ceiling_area_sqft=ceiling_area_sqft,
            soffit_faces_sqft=soffits_sqft,
            total_wall_area_sqft=total_wall_sqft,
            total_openings_sqft=openings_sqft,
            net_wall_area_sqft=net_wall_area,
            gross_area_sqft=gross_area,
            net_total_sqft=net_total,
            waste_factor=self.waste_factor,
            area_with_waste_sqft=area_with_waste,
            sheet_size_sqft=self.sheet_size_sqft,
            sheets_required=sheets_required,
            corner_bead_linear_ft=corner_bead_ft,
            perimeter_segments=perimeter_segments,
            partition_segments=partition_segments,
            end_cap_segments=end_cap_segments,
            soffit_segments=soffit_segments,
            openings=openings_list,
            validation_warnings=warnings,
        )
    
    def format_estimate(self, estimate: DrywallEstimate) -> str:
        """Format estimate as readable text report."""
        lines = [
            "=" * 80,
            "DRYWALL MATERIAL ESTIMATE (Category Breakdown)",
            "=" * 80,
            "",
        ]
        
        # Validation warnings first
        if estimate.validation_warnings:
            lines.extend([
                "⚠️  VALIDATION WARNINGS",
                "-" * 80,
            ])
            for warning in estimate.validation_warnings:
                lines.append(f"  {warning.message}")
            lines.extend(["", ""])
        
        # Category breakdown
        lines.extend([
            "WALL CALCULATIONS (by Category)",
            "-" * 80,
            f"1. Perimeter Walls:           {estimate.perimeter_walls_sqft:>10,.2f} sq ft",
            f"   (Foundation walls, 1 side, requires insulation/vapor barrier)",
            "",
            f"2. Interior Partitions:       {estimate.interior_partitions_sqft:>10,.2f} sq ft",
            f"   (Heavy lifters - both sides drywalled)",
            "",
            f"3. Partition End Caps:        {estimate.partition_end_caps_sqft:>10,.2f} sq ft",
            f"   (Y-direction 'poke outs' - LABOR INTENSIVE, corner bead both sides)",
            "",
            f"4. Soffit Faces:              {estimate.soffit_faces_sqft:>10,.2f} sq ft",
            f"   (Dropped ceiling vertical faces, corner bead top & bottom)",
            "",
            f"   Subtotal Walls:            {estimate.total_wall_area_sqft:>10,.2f} sq ft",
            "",
            "CEILING CALCULATIONS",
            "-" * 80,
            f"5. Ceiling Area:              {estimate.ceiling_area_sqft:>10,.2f} sq ft",
            f"   (Prefer 4'x12' sheets to minimize joints)",
            "",
            "OPENINGS (DEDUCTIONS)",
            "-" * 80,
            f"Windows & Doors:             -{estimate.total_openings_sqft:>10,.2f} sq ft",
            "",
            "NET AREA",
            "-" * 80,
            f"Gross Area (All Surfaces):     {estimate.gross_area_sqft:>10,.2f} sq ft",
            f"Less Openings:                 {estimate.total_openings_sqft:>10,.2f} sq ft",
            f"Net Area:                      {estimate.net_total_sqft:>10,.2f} sq ft",
            "",
            "MATERIAL REQUIREMENTS",
            "-" * 80,
            f"Waste Factor:                  {estimate.waste_factor * 100:>10.1f}%",
            f"Area + Waste:                  {estimate.area_with_waste_sqft:>10,.2f} sq ft",
            f"Sheet Size:                    {estimate.sheet_size_sqft:>10.0f} sq ft (4'x12')",
            f"Sheets Required:               {estimate.sheets_required:>10} sheets",
            "",
            "ACCESSORIES",
            "-" * 80,
            f"Corner Bead (Linear Feet):     {estimate.corner_bead_linear_ft:>10,.2f} ft",
            f"   (End caps + soffit transitions)",
            "",
            "=" * 80,
        ])
        
        return "\n".join(lines)

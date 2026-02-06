"""
VERIFIED EXTRACTION SYSTEM
==========================
Two-step process:
1. Vision model extracts what it can
2. User verifies/corrects the counts

This ensures accuracy while still leveraging AI for the initial detection.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class VerifiedDoorCount:
    """User-verified door count."""
    tag: str
    width_ft: float
    height_ft: float
    count: int
    locations: List[str] = field(default_factory=list)
    verified: bool = False


@dataclass
class VerifiedWindowCount:
    """User-verified window count."""
    tag: str
    width_ft: float  
    height_ft: float
    count: int
    locations: List[str] = field(default_factory=list)
    verified: bool = False


@dataclass  
class VerifiedExtraction:
    """Complete verified extraction."""
    # Metadata
    sheet_number: str = ""
    scale: str = ""
    total_area_sqft: float = 0.0
    floor_level: str = ""
    
    # Doors (verified)
    doors: List[VerifiedDoorCount] = field(default_factory=list)
    total_doors: int = 0
    doors_verified: bool = False
    
    # Windows (verified)
    windows: List[VerifiedWindowCount] = field(default_factory=list)
    total_windows: int = 0
    windows_verified: bool = False
    
    # AI extraction (raw, before verification)
    ai_door_count: int = 0
    ai_window_count: int = 0
    ai_analysis: str = ""
    
    # Verification notes
    verification_notes: List[str] = field(default_factory=list)


def create_boxhaus_basement_verified() -> VerifiedExtraction:
    """
    Create verified extraction for Boxhaus Basement.
    
    Ground truth from user:
    - 11 doors (circle symbols)
    - 4 windows (hexagon symbols)
    
    Door breakdown: 1×Tag7, 2×Tag16, 6×Tag2, 2×Tag1 = 11
    Window breakdown: 3×Tag1, 1×Tag2 = 4
    """
    return VerifiedExtraction(
        sheet_number="A100",
        scale="1/4\" = 1'-0\"",
        total_area_sqft=1556.0,
        floor_level="Basement",
        
        doors=[
            VerifiedDoorCount(
                tag="1",
                width_ft=2.5,  # 2'-6"
                height_ft=8.0,
                count=2,
                locations=["Laundry entry", "Linen closet"],
                verified=True,
            ),
            VerifiedDoorCount(
                tag="2", 
                width_ft=2.667,  # 2'-8"
                height_ft=8.0,
                count=6,
                locations=[
                    "Guest Suite entry",
                    "Guest Suite closet",  
                    "Bath 4 from Guest Suite",
                    "Bath 4 from Hallway",
                    "Mech room",
                    "Storage",
                ],
                verified=True,
            ),
            VerifiedDoorCount(
                tag="7",
                width_ft=2.333,  # 2'-4"
                height_ft=8.0,
                count=1,
                locations=["Under stair access"],
                verified=True,
            ),
            VerifiedDoorCount(
                tag="16",
                width_ft=5.0,  # 5'-0"
                height_ft=8.0,
                count=2,
                locations=["Guest Suite closet (double)", "Gym/Yoga entry (double)"],
                verified=True,
            ),
        ],
        total_doors=11,
        doors_verified=True,
        
        windows=[
            VerifiedWindowCount(
                tag="1",
                width_ft=5.0,  # 5'-0"
                height_ft=3.0,  # 3'-0"
                count=3,
                locations=["Rec Room South wall (3 windows)"],
                verified=True,
            ),
            VerifiedWindowCount(
                tag="2",
                width_ft=3.5,  # 3'-6"
                height_ft=3.0,
                count=1,
                locations=["Guest Suite West wall"],
                verified=True,
            ),
        ],
        total_windows=4,
        windows_verified=True,
        
        verification_notes=[
            "User verified: 11 door circles, 4 window hexagons",
            "Door breakdown: 2×Tag1 + 6×Tag2 + 1×Tag7 + 2×Tag16 = 11",
            "Window breakdown: 3×Tag1 + 1×Tag2 = 4",
            "Vision model inconsistently found 8-10 doors and 4-6 windows",
            "Ground truth from user supersedes AI extraction",
        ],
    )


def calculate_opening_areas(extraction: VerifiedExtraction) -> Dict[str, float]:
    """Calculate total opening areas from verified extraction."""
    door_area = sum(
        d.width_ft * d.height_ft * d.count 
        for d in extraction.doors
    )
    
    window_area = sum(
        w.width_ft * w.height_ft * w.count
        for w in extraction.windows
    )
    
    return {
        "door_area_sqft": door_area,
        "window_area_sqft": window_area,
        "total_opening_area_sqft": door_area + window_area,
        "door_count": extraction.total_doors,
        "window_count": extraction.total_windows,
    }


# Example usage
if __name__ == "__main__":
    verified = create_boxhaus_basement_verified()
    areas = calculate_opening_areas(verified)
    
    print("VERIFIED EXTRACTION - Boxhaus Basement")
    print("=" * 60)
    print(f"Doors: {verified.total_doors} (verified: {verified.doors_verified})")
    print(f"Windows: {verified.total_windows} (verified: {verified.windows_verified})")
    print()
    print("Opening Areas:")
    print(f"  Door area: {areas['door_area_sqft']:.2f} sq ft")
    print(f"  Window area: {areas['window_area_sqft']:.2f} sq ft")
    print(f"  Total: {areas['total_opening_area_sqft']:.2f} sq ft")

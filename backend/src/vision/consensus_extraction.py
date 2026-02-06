"""
Consensus-Based Floor Plan Extraction
=====================================
Runs multiple extraction passes and builds consensus.
Identifies discrepancies for human review.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Any
from collections import Counter

from src.vision.providers.gemini_vision import analyze_image


@dataclass
class ExtractionPass:
    """Single extraction pass result."""
    pass_number: int
    doors_by_tag: Dict[str, int]  # tag -> count
    total_doors: int
    windows_by_tag: Dict[str, int]  # tag -> count
    total_windows: int
    raw_response: str


@dataclass
class ConsensusResult:
    """Consensus from multiple passes."""
    # Final counts (consensus or flagged)
    doors_by_tag: Dict[str, int]
    total_doors: int
    windows_by_tag: Dict[str, int]
    total_windows: int
    
    # Consensus status
    door_consensus: bool
    window_consensus: bool
    
    # Individual pass results
    passes: List[ExtractionPass] = field(default_factory=list)
    
    # Discrepancies (for human review)
    door_discrepancies: List[str] = field(default_factory=list)
    window_discrepancies: List[str] = field(default_factory=list)


# Different prompts to get varied perspectives
PASS_PROMPTS = [
    # Pass 1: Room-by-room
    """Count doors BY ROOM. For each room, list doors with their tags:
- GUEST SUITE: ___ doors (tags: ___)
- BATH 4: ___ doors (tags: ___)
- GYM/YOGA: ___ doors (tags: ___)
- LAUNDRY: ___ doors (tags: ___)
- MECH: ___ doors (tags: ___)
- STORAGE: ___ doors (tags: ___)
- LINEN: ___ doors (tags: ___)
- REC ROOM: ___ doors (tags: ___)
TOTAL DOORS: ___

Windows BY WALL:
- NORTH: ___ windows
- SOUTH: ___ windows
- EAST: ___ windows
- WEST: ___ windows
TOTAL WINDOWS: ___""",
    
    # Pass 2: Tag-by-tag
    """Count doors BY TAG NUMBER:
TAG 1 (if exists): ___ doors
TAG 2 (if exists): ___ doors
TAG 5 (if exists): ___ doors
TAG 7 (if exists): ___ doors
TAG 16 (if exists): ___ doors
Other tags: ___
TOTAL DOORS: ___

Windows BY TAG:
TAG 1: ___ windows
TAG 2: ___ windows
TOTAL WINDOWS: ___""",
    
    # Pass 3: Symbol counting
    """Count door SYMBOLS on the plan:
- Quarter-circle swing arcs: ___
- Sliding door symbols: ___
- Double door pairs: ___
TOTAL DOOR OPENINGS: ___

Count window SYMBOLS on perimeter:
TOTAL WINDOWS: ___"""
]


def extract_counts_from_text(text: str) -> Tuple[int, int]:
    """Extract total door and window counts from analysis text."""
    import re
    
    # Find door count
    door_patterns = [
        r'TOTAL DOORS[:\s=]+(\d+)',
        r'(\d+)\s+(?:total\s+)?doors',
        r'doors[:\s=]+(\d+)',
    ]
    
    door_count = 0
    for pattern in door_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            door_count = int(match.group(1))
            break
    
    # Find window count
    window_patterns = [
        r'TOTAL WINDOWS[:\s=]+(\d+)',
        r'(\d+)\s+(?:total\s+)?windows',
        r'windows[:\s=]+(\d+)',
    ]
    
    window_count = 0
    for pattern in window_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            window_count = int(match.group(1))
            break
    
    return door_count, window_count


def run_consensus_extraction(
    image_bytes: bytes,
    mime_type: str,
    num_passes: int = 3,
    model: str = "gemini-3-pro-preview",
) -> ConsensusResult:
    """
    Run multiple extraction passes and build consensus.
    
    Args:
        image_bytes: Image/PDF content
        mime_type: MIME type
        num_passes: Number of extraction passes
        model: Model to use
        
    Returns:
        ConsensusResult with validated counts
    """
    passes = []
    door_counts = []
    window_counts = []
    
    for i, prompt in enumerate(PASS_PROMPTS[:num_passes]):
        analysis = analyze_image(
            image_bytes=image_bytes,
            mime_type=mime_type,
            prompt=prompt,
            model=model,
        )
        
        doors, windows = extract_counts_from_text(analysis)
        
        passes.append(ExtractionPass(
            pass_number=i + 1,
            doors_by_tag={},  # Would need more parsing
            total_doors=doors,
            windows_by_tag={},
            total_windows=windows,
            raw_response=analysis,
        ))
        
        door_counts.append(doors)
        window_counts.append(windows)
    
    # Build consensus
    door_counter = Counter(door_counts)
    window_counter = Counter(window_counts)
    
    # Most common value
    consensus_doors = door_counter.most_common(1)[0][0] if door_counter else 0
    consensus_windows = window_counter.most_common(1)[0][0] if window_counter else 0
    
    # Check if consensus is unanimous
    door_consensus = len(set(door_counts)) == 1
    window_consensus = len(set(window_counts)) == 1
    
    # Note discrepancies
    door_discrepancies = []
    window_discrepancies = []
    
    if not door_consensus:
        door_discrepancies.append(
            f"Door count varied: {door_counts}. Using consensus: {consensus_doors}"
        )
    
    if not window_consensus:
        window_discrepancies.append(
            f"Window count varied: {window_counts}. Using consensus: {consensus_windows}"
        )
    
    return ConsensusResult(
        doors_by_tag={},
        total_doors=consensus_doors,
        windows_by_tag={},
        total_windows=consensus_windows,
        door_consensus=door_consensus,
        window_consensus=window_consensus,
        passes=passes,
        door_discrepancies=door_discrepancies,
        window_discrepancies=window_discrepancies,
    )


def format_consensus_report(result: ConsensusResult) -> str:
    """Format consensus result as readable report."""
    lines = [
        "=" * 80,
        "CONSENSUS EXTRACTION REPORT",
        "=" * 80,
        "",
        f"TOTAL DOORS: {result.total_doors}",
        f"  Consensus: {'✓ UNANIMOUS' if result.door_consensus else '⚠️ VARIED'}",
        "",
        f"TOTAL WINDOWS: {result.total_windows}",
        f"  Consensus: {'✓ UNANIMOUS' if result.window_consensus else '⚠️ VARIED'}",
        "",
    ]
    
    if result.door_discrepancies:
        lines.append("DOOR DISCREPANCIES:")
        for d in result.door_discrepancies:
            lines.append(f"  - {d}")
        lines.append("")
    
    if result.window_discrepancies:
        lines.append("WINDOW DISCREPANCIES:")
        for d in result.window_discrepancies:
            lines.append(f"  - {d}")
        lines.append("")
    
    lines.append("INDIVIDUAL PASS RESULTS:")
    for p in result.passes:
        lines.append(f"  Pass {p.pass_number}: {p.total_doors} doors, {p.total_windows} windows")
    
    lines.append("")
    lines.append("=" * 80)
    
    return "\n".join(lines)

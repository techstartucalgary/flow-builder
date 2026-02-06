# FlowBuildr Context

## What the App Is
FlowBuildr is an automated construction takeoff and material estimation platform.
It uses computer vision + architectural logic to transform 2D floor plans into
precise, actionable material lists.

Unlike traditional estimation tools that rely on broad area multipliers,
FlowBuildr identifies individual wall entities (X and Y directions, end-caps,
and vertical soffit faces) and cross-references window/door schedules to produce
an absolute precise net square footage. The output bridges complex blueprints
to final ordering lists for drywall, framing, and finishing materials.

## MVP Roadmap (Core Milestones)
1. Vision Detection Engine
   - Identify architectural symbols: foundation walls, partition studs, legend
     areas such as "Dropped Ceilings."
2. Scale & Schedule Parser
   - Extract measurements from dimension strings.
   - Map window/door tags to schedules for automated deductions.
3. Entity Logic Engine
   - Treat every wall segment as an entity.
   - Compute surface area from height constants.
   - Account for bulkheads and "poking out" partitions.
4. Takeoff Review Dashboard
   - UI to verify detected walls and override material types
     (e.g., Moisture-Resistant / Greenboard).
5. Material Reporting
   - Final summary export with precise square footage, waste-factored sheet
     counts (e.g., 4'x12'), and accessory requirements (e.g., corner bead LF).

## Construction Defaults
GLOBAL_CEILING_HEIGHT=9.0
DEFAULT_WASTE_FACTOR=0.15
DRY_WALL_SHEET_SIZE=48_144  # Size in sq inches (4'x12')

## Operating Principles (Avoid Hallucinations)
- If a detail is not explicitly known, do not assume; flag it as a question.
- Use the roadmap and defaults above as the authoritative baseline.
- Prefer simple, auditable steps over clever but opaque logic.

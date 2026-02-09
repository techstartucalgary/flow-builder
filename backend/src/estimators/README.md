# Material Estimators

## Drywall Calculator

### Overview
The drywall calculator provides precise square footage estimates with category-specific tracking and labor intensity notes.

### Two Versions Available

#### 1. Basic Calculator (`calculator.py`)
Simple area calculations with basic categorization.

```python
from src.estimators.drywall import DrywallCalculator

calc = DrywallCalculator(
    ceiling_height_ft=9.0,
    waste_factor=0.15,
    sheet_width_ft=4.0,
    sheet_length_ft=12.0,
)

estimate = calc.calculate_estimate(
    perimeter_dims=[(42.0, "North wall")],
    partition_dims=[(30.0, "Main divider", 2)],
    ceiling_area_sqft=1500.0,
    windows=[(5.0, 3.0, 2, "Standard windows")],
    doors=[(3.0, 8.0, 1, "Entry door")],
)
```

#### 2. Enhanced Calculator (`calculator_v2.py`) ⭐ RECOMMENDED
Category-specific tracking with validation and corner bead calculations.

```python
from src.estimators.drywall.calculator_v2 import DrywallCalculator

calc = DrywallCalculator(
    ceiling_height_ft=9.0,
    waste_factor=0.15,
    sheet_width_ft=4.0,
    sheet_length_ft=12.0,
)

estimate = calc.calculate_estimate(
    perimeter_dims=[(42.0, "North wall")],
    partition_dims=[(30.0, "Main divider", 2)],
    end_cap_dims=[(6.0, "Partition end", 2)],
    soffit_dims=[(20.0, 1.5, "Corridor soffit")],
    ceiling_area_sqft=1500.0,
    windows=[(5.0, 3.0, 2, "Standard windows")],
    doors=[(3.0, 8.0, 1, "Entry door")],
    validate_double_sided=True,
)
```

### Category Breakdown

The enhanced calculator tracks 5 distinct categories:

#### 1. **Perimeter Walls** (Foundation)
- **Labor**: Simpler installation
- **Special Requirements**:
  - Gap between concrete foundation and drywall
  - Insulation installation
  - Vapor barrier placement
- **Sides**: 1 (interior face only)

#### 2. **Interior Partitions** (Heavy Lifters)
- **Labor**: Standard labor rates
- **Special Requirements**:
  - Both sides of studs require drywall
  - Largest square footage component
- **Sides**: 2 (both sides)
- **Validation**: Warns if sides ≠ 2

#### 3. **Partition End Caps** (Y-Direction "Poke Outs")
- **Labor**: LABOR INTENSIVE (despite small square footage)
- **Special Requirements**:
  - Corner bead on both vertical edges
  - Extra mudding and sanding for sharp corners
  - Difficult to achieve perfect alignment
- **Sides**: 2 (both faces)
- **Corner Bead**: `height × 2` linear feet

#### 4. **Soffit Faces** (Dropped Ceiling Transitions)
- **Labor**: Moderate complexity
- **Special Requirements**:
  - Vertical "step" faces where ceiling height changes
  - Corner bead at top AND bottom transitions
  - Often hides HVAC ducting
- **Sides**: 1
- **Corner Bead**: `length × 2` linear feet (top + bottom)

#### 5. **Ceiling**
- **Labor**: Standard
- **Optimization**: Use 4'×12' sheets to minimize joints
- **Note**: Fewer joints = less taping/mudding time

### Validation Features

The enhanced calculator includes automatic validation:

```python
# Example validation warning:
⚠️  VERIFY: 'Main hallway wall' marked as 1-sided. 
Interior partitions are usually 2-sided. 
Confirm if this is an exception (e.g., against existing wall).
```

### Material Calculations

Both calculators provide:
- Net square footage (after opening deductions)
- Waste factor application (default 15%)
- Sheet count (4'×12' sheets)
- Corner bead linear feet (enhanced calculator only)

### Example Output

```
DRYWALL MATERIAL ESTIMATE (Category Breakdown)
================================================================================

WALL CALCULATIONS (by Category)
--------------------------------------------------------------------------------
1. Perimeter Walls:             1,531.50 sq ft
   (Foundation walls, 1 side, requires insulation/vapor barrier)

2. Interior Partitions:         1,806.19 sq ft
   (Heavy lifters - both sides drywalled)

3. Partition End Caps:            262.50 sq ft
   (Y-direction 'poke outs' - LABOR INTENSIVE, corner bead both sides)

4. Soffit Faces:                   60.28 sq ft
   (Dropped ceiling vertical faces, corner bead top & bottom)

   Subtotal Walls:              3,660.47 sq ft

CEILING CALCULATIONS
--------------------------------------------------------------------------------
5. Ceiling Area:                1,556.00 sq ft
   (Prefer 4'x12' sheets to minimize joints)

NET AREA
--------------------------------------------------------------------------------
Net Area:                        4,995.64 sq ft

MATERIAL REQUIREMENTS
--------------------------------------------------------------------------------
Waste Factor:                        15.0%
Area + Waste:                    5,744.98 sq ft
Sheets Required:                      120 sheets

ACCESSORIES
--------------------------------------------------------------------------------
Corner Bead (Linear Feet):         116.38 ft
```

### See Also
- `examples/boxhaus_basement_estimate.py` - Basic calculator example
- `examples/boxhaus_basement_enhanced.py` - Enhanced calculator example

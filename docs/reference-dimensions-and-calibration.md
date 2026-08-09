# Reference Dimensions And Calibration Notes

This note records the real-world references used for the current stadium and built-in Beyblade test presets. The simulator still uses simplified proxy physics; these dimensions are calibration anchors, not claims of exact CAD reproduction.

## Stadium References

The active default stadium is the Takara Tomy Beyblade X Xtreme Stadium BX-10 because current Beyblade X competitive references describe it as the standard stadium. BB-10 remains available as a legacy reference stadium with well-published arena, ridge, wall, and exit-gap measurements.

| Preset | In-App ID | Reference Dimensions | Sim Interpretation |
| --- | --- | --- | --- |
| BB-10 Attack Type | `bb10-attack-standard` | 34 cm diameter, 25 cm tornado ridge diameter, 15 cm exit gaps, 15.5 cm wall length, 3 cm depth | Legacy reference arena; three open KO gaps, segmented wall colliders, low-restitution floor/rim |
| Burst Standard Type B-09 | `burst-standard-b09` | Retail dimensions commonly listed around 45.7 x 45.7 x 10.2 cm; standard Burst stadium has inner ridge and three exits | Larger three-pocket variant for later selection work |
| DB Standard Type B-183 | `db-standard-b183` | Approx. 54.5 cm length, 48 cm width, 16.5 cm height, 31.5 cm tornado ridge, two ring-out pockets | Wide two-pocket stadium with larger outer area |
| Xtreme Stadium BX-10 | `xtreme-bx10` | Approx. 44 cm length, 45.5 cm width, 15.5 cm height, 21 cm tornado ridge, two over-zone pockets and one wide exit | Default X-style arena with grouped pockets on one side |

Current implementation files:

- `src/simulation/stadiumConfig.ts` stores the measurements, derived world-scale dimensions, pocket arcs, rim friction, and floor friction.
- `src/simulation/stadiumSurface.ts` generates the shared central-basin and banked-rim bowl profile used by rendering and physics.
- `src/scene/createArena.ts` renders the active stadium as a molded bowl with stronger depth shading, an outer shell, a rounded lip, visible wall gaps, pocket guards, and a tornado ridge.
- `src/simulation/physicsCore.ts` uses analytic bowl contact for the floor, plus Rapier ridge, wall, pocket guard, and bey proxy colliders.

## Built-In Test Beys

The Import tab includes six repeatable reference models. Each reference generates a colored, layered Beyblade-style STL in memory and can be saved into the library with a physics profile. Older saved reference records with matching filenames are re-rendered with the improved procedural model when selected.

| Reference Bey | Why Included | Diameter / Radius | Total Weight | Contact Profile |
| --- | --- | --- | --- | --- |
| Dran Sword 3-60F | Popular Beyblade X attack starter | 48.25 mm / 24.13 mm | Approx. 43.0 g | 3 points, high attack bias |
| Hells Scythe 4-60T | Early balance staple | 47.99 mm / 24.00 mm | Approx. 41.2 g | 4 points, balanced bias |
| Phoenix Wing 9-60GF | Heavy attack benchmark | 49.00 mm / 24.50 mm | Approx. 46.25 g | 3 points, high recoil |
| Shark Edge 3-60LF | Aggressive two-contact attack blade | 48.88 mm / 24.44 mm | Approx. 43.0 g | 2 points, very high attack bias |
| Wizard Arrow 4-80B | Smooth stamina benchmark | 48.09 mm / 24.05 mm | Approx. 40.9 g | 2 points, low recoil |
| Wizard Rod 5-70DB | Modern stamina/meta benchmark | 50.40 mm / 25.20 mm | Approx. 45.2 g | 5 points, low attack bias |

Implementation file:

- `src/model/referenceBeyblades.ts` stores the reference dimensions, generated STL geometry, total weight, launch defaults, tip type, friction/damping, and contact profile.
- `src/model/proceduralBeybladeStl.ts` builds the layered driver, disk, lobed attack ring, and center-cap geometry used by the sample and reference models.

## Contact Profile

The simulator now distinguishes strike behavior from visual mesh shape with three editable values:

- `attackPoints`: approximate number of contact lobes requested by the battle proxy. Runtime colliders are capped for responsiveness.
- `attackBias`: moves strike colliders farther outward and makes the body feel less like a smooth disk.
- `recoilCoefficient`: controls how lively side impacts feel while keeping restitution low enough to avoid trampoline behavior.

These values are intentionally separate from STL geometry. That keeps imported Tinkercad files stable while still making attack, balance, and stamina references behave differently in battle mode.

## Source Links

- BB-10 Attack Type stadium dimensions: https://mfbeyblade.fandom.com/wiki/Beystadium_Attack_Type
- Burst Standard Type B-09 general shape and exits: https://beyblade.fandom.com/wiki/Beystadium_Standard_Type_%28Burst%29
- B-09 retail dimensions reference: https://www.desertcart.in/products/48231869-beyblade-burst-b-09-bay-stadium-standard-type
- DB Standard Type B-183 dimensions: https://beyblade.wiki/beyblade-db-stadium/
- Xtreme Stadium BX-10 dimensions and pocket layout: https://beyblade.wiki/xtreme-stadium/
- Additional Xtreme Stadium measurement discussion: https://worldbeyblade.org/Thread-Hasbro-Xtreme-Beystadium-vs-Takara-Tomy-Xtreme-Stadium-Discussion-Thread
- Beyblade Planner measured blade dimensions: https://beybladeplanner.com/
- Dran Sword stock weight: https://beyblade.wiki/dran-sword/
- Hells Scythe stock weight: https://beyblade.wiki/hells-scythe/
- Phoenix Wing stock and part weights: https://beyblade.wiki/phoenix-wing/ and https://beybase.com/bx-23-phoenix-wing-beyblade-review/
- Shark Edge stock weight and contact-shape notes: https://beyblade.wiki/shark-edge-3-60lf/ and https://beyblade.wiki/shark-edge-blade/
- Wizard Arrow stock weight: https://beyblade.wiki/wizard-arrow/
- Wizard Rod stock/component weights and meta context: https://beyblade.wiki/wizard-rod/ and https://beybase.com/beyblade-x-buyers-guide-best-combos/

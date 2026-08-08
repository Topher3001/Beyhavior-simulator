# Beyblade Physics Simulator Build Plan

## Project Vision

Build a lightweight desktop-friendly physics simulator for Beyblade-style tops. The simulator should import 3D design files for display, let users define physical properties manually, simulate a single spinning top in an arena, and eventually run battles between two saved designs.

The recommended first version is a browser-based app using Three.js for rendering and a JavaScript/WASM physics engine for rigid-body simulation. It can later be wrapped as a small desktop app with Tauri if native packaging becomes useful.

## Core Assumptions

- Imported STL/OBJ files are used primarily as visual models.
- Physical behavior is controlled by an editable physics profile attached to each design.
- Weight, center of mass, radius, height, tip shape, friction, drag, and launch parameters are user-adjustable.
- Center of mass can start as an estimate from model bounds, then be adjusted manually.
- The first useful simulator does not need perfect real-world accuracy. It should be consistent, tunable, and visually understandable.

## Recommended Technical Direction

- App shell: Vite + TypeScript
- Renderer: Three.js
- Physics engine: Rapier 3D
- File import: STL first, then OBJ, then optional GLB/glTF
- Local storage: IndexedDB
- UI: Plain React or lightweight TypeScript UI, depending on preference
- Desktop packaging, later: Tauri

## Data Model

### Design Asset

Each imported design should store:

- Unique ID
- Display name
- Source file type
- Original file blob
- Thumbnail image
- Created date
- Updated date
- Linked physics profile

### Physics Profile

Each design should have editable simulation values:

- Total weight in grams
- Visual scale factor
- Approximate radius in millimeters
- Approximate height in millimeters
- Center of mass offset: X, Y, Z
- Moment of inertia estimate
- Tip type: flat, sharp, ball, rubber, custom
- Tip friction coefficient
- Ring friction coefficient
- Air drag coefficient
- Spin damping coefficient
- Default launch RPM
- Default launch angle
- Default launch position

## Build Phases

### Phase 1: Project Foundation

Goal: Create a working local web app that can render a basic 3D scene.

Tasks:

- Initialize the project with Vite and TypeScript.
- Add Three.js.
- Create a full-window 3D viewport.
- Add orbit camera controls.
- Add a simple arena placeholder.
- Add a simple test top using primitive geometry.

Done when:

- The app runs locally in a browser.
- A basic arena and placeholder top are visible.
- The camera can rotate, pan, and zoom.

Estimated time: 0.5-1 day.

### Phase 2: 3D File Import And Display

Goal: Import a design file and show it as the beyblade visual model.

Tasks:

- Add STL import.
- Add OBJ import after STL works.
- Normalize imported model orientation and scale.
- Center imported models on the arena.
- Show model bounds and dimensions.
- Generate a basic thumbnail for saved designs.

Done when:

- A user can import an STL file from Tinkercad.
- The imported model appears in the viewport.
- The model can be scaled and centered reliably.

Estimated time: 1-2 days.

### Phase 3: Local Design Library

Goal: Save imported designs and select them later.

Tasks:

- Add IndexedDB storage.
- Save original imported file blobs.
- Save thumbnails.
- Save design metadata.
- Add a design selection panel.
- Add delete and rename actions.

Done when:

- Imported designs remain available after closing and reopening the browser.
- A user can select a saved design and load it into the viewport.

Estimated time: 1-2 days.

### Phase 4: Physics Profile Editor

Goal: Attach editable physical properties to each design.

Tasks:

- Add weight input.
- Add radius and height inputs.
- Add center-of-mass X/Y/Z controls.
- Add tip type selection.
- Add friction and damping controls.
- Add launch RPM, launch angle, and launch position controls.
- Estimate starting center of mass from model bounds.
- Display center of mass as a visible marker in the scene.

Done when:

- Each saved design has a reusable physics profile.
- Changing profile values visibly changes simulation setup.
- Center of mass can be adjusted by the user.

Estimated time: 2-4 days.

### Phase 5: Single-Top Simulation

Goal: Simulate one beyblade spinning in the arena.

Tasks:

- Add Rapier 3D.
- Create an arena collider.
- Create a simplified beyblade physics body.
- Use the imported model only as the visual mesh attached to the physics body.
- Apply launch spin and launch angle.
- Model contact with the tip.
- Add spin damping, air drag, and friction.
- Detect when the top stops spinning.
- Add reset, launch, pause, and step controls.

Done when:

- A single top can be launched, wobble, precess, lose energy, and stop.
- Weight, center of mass, friction, and launch RPM have noticeable effects.
- The simulation is stable enough for repeated tests.

Estimated time: 4-7 days.

### Phase 6: Two-Bey Battle MVP

Goal: Simulate two saved designs against each other.

Tasks:

- Add two launch slots.
- Allow separate physics profiles and launch settings.
- Spawn both tops in the arena.
- Add simplified ring colliders for collisions.
- Detect ring-out, stopped top, and winner.
- Add battle reset and repeat controls.
- Save basic battle results.

Done when:

- Two designs can be selected and launched together.
- Collisions affect movement and spin.
- The app can declare a simple battle result.

Estimated time: 5-10 days.

### Phase 7: Calibration And UX Polish

Goal: Make the simulator pleasant and useful for repeated testing.

Tasks:

- Add presets for common tip types.
- Add launch presets.
- Add charts for spin speed, tilt, position, and contact events.
- Add slow motion and fixed-time-step replay.
- Add export/import for design profiles.
- Improve visual styling and layout.
- Add mobile-width layout only if useful.

Done when:

- A user can quickly compare designs.
- Test results are understandable.
- The simulator feels like a tool, not only a demo.

Estimated time: 3-7 days.

## Initial MVP Scope

The first MVP should include:

- STL import
- 3D model display
- One saved design library
- Physics profile editor
- One spinning top simulation
- Arena floor
- Launch/reset/pause controls
- Adjustable weight and center of mass

Avoid in the first MVP:

- Perfect mesh-derived physics
- Multiplayer or online features
- Full CAD editing
- Highly realistic material simulation
- Native desktop packaging

## Suggested Starting Goals

These are the first goals to start building, in order:

1. Create the Vite + TypeScript app.
2. Render a Three.js scene with an arena and placeholder top.
3. Add camera controls and basic lighting.
4. Add STL import and display.
5. Add model scale, centering, and bounds calculation.
6. Add a physics profile form with weight, radius, height, center of mass, friction, and launch RPM.
7. Store one imported design and its physics profile in IndexedDB.
8. Add Rapier and simulate a primitive spinning top before using imported visuals.
9. Attach imported visual mesh to the primitive physics body.
10. Tune single-top behavior until weight, center of mass, and friction visibly matter.
11. Add the second beyblade only after single-top behavior is stable.

## Acceptance Criteria For The First Useful Version

The first useful version is complete when:

- A user can import a Tinkercad STL file.
- The model appears in the 3D viewport.
- The user can enter weight and adjust center of mass.
- The user can launch a single top in an arena.
- The top visibly spins, wobbles, slows, and stops.
- The design and physical settings can be saved and reloaded.

## Risks And Mitigations

Risk: Arbitrary STL geometry causes unstable physics.

Mitigation: Use simplified colliders and treat STL as visual-only.

Risk: Simulation feels unrealistic.

Mitigation: Add visible tuning parameters and compare behavior against simple real-world tests.

Risk: Center of mass estimation is inaccurate.

Mitigation: Start with bounds-based estimation and expose manual adjustment.

Risk: Browser storage limits become a problem.

Mitigation: Store compressed assets or move to file-system storage when using Tauri.

Risk: Two-bey collisions are chaotic or unstable.

Mitigation: Use simplified collision geometry and add battle mode only after single-top physics is solid.

## Longer-Term Enhancements

- Compound part system: layer, disk, driver/tip
- Per-part weights and materials
- More accurate inertia calculations
- Arena shape editor
- Replay export
- Batch testing
- Tournament mode
- Side-by-side design comparison
- Tauri desktop build
- Optional cloud sync

## High-Level Timeline

Fast prototype: 3-5 days.

Useful single-top MVP: 1-2 weeks.

Two-bey battle MVP: 2-4 weeks.

More physically accurate simulator: 6-10+ weeks.


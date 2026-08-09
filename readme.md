# Beyblade Physics Simulator

A lightweight browser-based simulator for importing Beyblade-style 3D designs, assigning editable physics profiles, and testing single-top or two-top battle behavior in a Three.js arena.

The app is built with Vite, TypeScript, Three.js, IndexedDB, and Rapier 3D. Imported STL/OBJ files are treated as visual models. Physics is driven by simplified proxy colliders and user-editable profile values such as weight, radius, height, center of mass, friction, damping, and launch settings.

## Current Status

Implemented through Phase 7 of the project plan:

- Full-window Three.js scene with orbit controls and arena display.
- STL and OBJ import for visual design files.
- Local IndexedDB design library with save, load, rename, and delete.
- Editable physics profiles for saved designs.
- Center-of-mass marker and profile presets.
- Single-top Rapier simulation with launch, pause, step, reset, telemetry, and replay traces.
- Two-bey battle MVP with left/right slots, collisions, winner/draw detection, and basic result history.
- Results tab with charts, replay controls, contact events, and profile JSON export/import.

## Running Locally

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm run dev
```

Build for production:

```bash
pnpm run build
```

Preview the production build:

```bash
pnpm run preview
```

By default, the local app is served at:

```text
http://127.0.0.1:5173/
```

## Basic Workflow

1. Open the app in the browser.
2. Use the Import tab to load an STL or OBJ design, or load the sample STL.
3. Save the imported model into the local Library.
4. Select a saved design and edit its Physics profile.
5. Launch it in the Sim tab for a single-top test.
6. Select two saved designs in the Battle tab for a head-to-head run.
7. Review charts, replay traces, and battle history in Results.

## Physics Model

The imported STL/OBJ mesh is visual-only. This keeps arbitrary CAD geometry from destabilizing the physics engine.

Each design gets a simplified physics proxy:

- A dynamic rigid body with explicit mass properties.
- A cylinder-like body collider.
- A small tip collider for stadium contact.
- A wider ring collider in battle mode for bey-to-bey impacts.
- Profile-driven friction, damping, center of mass, inertia estimate, launch RPM, launch angle, and launch position.

This is intended to be stable and tunable rather than perfectly physically accurate.

## Stadium Behavior

The arena uses a fixed floor collider and segmented fixed rim colliders. Recent stability tuning prevents the stadium from behaving like a trampoline:

- Floor and tip restitution are set to zero.
- Rim, body, and battle-ring restitution are kept very low.
- The broad body/ring collider is raised so normal spinning contact is primarily through the tip.
- A ground-contact stabilizer caps upward velocity and prevents vertical energy runaway.

If a top starts bouncing again, first check high launch angles, extreme center-of-mass offsets, very large radius/height values, or custom friction/damping settings.

## Storage

Designs and battle result summaries are stored locally in the browser using IndexedDB.

Saved design records include:

- Display name and source file metadata.
- Original STL/OBJ blob.
- Thumbnail.
- Imported dimensions and visual scale.
- Physics profile.

Data is local to the browser and device. There is no cloud sync.

## Project Plan

The phased build plan lives in:

```text
docs/beyblade-simulator-build-plan.md
```

Near-term useful improvements:

- Better calibration against real-world launch tests.
- More accurate inertia and center-of-mass modeling.
- Tunable arena materials and stadium shapes.
- Replay export.
- Batch testing and tournament mode.
- Optional Tauri desktop packaging.

## Known Boundaries

- Imported meshes do not become physics colliders.
- OBJ material sidecar files are not a core workflow.
- Physics profiles are approximations and need manual tuning.
- Battle outcomes are simplified and may need calibration for realism.
- Browser storage limits may matter for many large STL/OBJ files.

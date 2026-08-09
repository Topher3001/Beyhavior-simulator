# Beyblade Physics Simulator

A lightweight browser-based simulator for importing Beyblade-style 3D designs, assigning editable physics profiles, and testing single-top or two-top battle behavior in a Three.js arena.

The app is built with Vite, TypeScript, Three.js, IndexedDB, and Rapier 3D. Imported STL/OBJ files are treated as visual models. Physics is driven by simplified proxy colliders and user-editable profile values such as weight, radius, height, center of mass, friction, damping, and launch settings.

## Current Status

The simulator currently supports:

- A full-window 3D arena with orbit camera controls, lighting, and a visible stadium boundary.
- STL and OBJ imports for visual Beyblade design files, including centering, scaling, bounds display, and thumbnails.
- A local design library using IndexedDB, with save, load, rename, and delete actions.
- Editable physics profiles for saved designs, including weight, radius, height, center of mass, tip type, friction, damping, and launch defaults.
- Live center-of-mass visualization and reusable tip and launch presets for faster tuning.
- Single-top Rapier simulation with launch, pause, step, reset, telemetry, damping, wobble, stop detection, and replay traces.
- Two-bey battle simulation with left/right design slots, simplified collisions, ring-out and stop detection, winner/draw results, and local result history.
- Results analysis with charts, replay controls, contact event markers, and profile JSON export/import.

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

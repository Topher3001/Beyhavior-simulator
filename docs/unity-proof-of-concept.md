# Unity Physics Proof Of Concept

This folder contains a Unity proof-of-concept for comparing Unity PhysX behavior against the current browser Rapier/Three.js simulator.

Project folder:

```text
unity-poc/
```

## What It Builds

- Procedural BX-10-style bowl stadium.
- Static mesh bowl collider with low-bounce PhysicMaterial.
- Segmented rim and tornado-ridge primitive colliders.
- Two procedural bey proxies with compound primitive colliders.
- Rigidbody CCD, interpolation, high max angular velocity, and boosted solver iterations.
- Custom Beyblade-specific gyro/precession stabilization.
- Independent spin decay, tumble damping, bowl assist, and rim-banking return.
- Included visual-only sample STL files for `left.stl` and `right.stl`, plus support for replacing them with exported designs.
- Collision ding sound generated procedurally in code.
- IMGUI telemetry for RPM, tilt, speed, and radius.
- Telemetry recorder with closest-distance, rim-sample, collision, and CSV export.
- Automated raw/assisted evaluation mode with JSON report export.

## How To Open

1. Install Unity 2022.3 LTS or newer.
2. Open Unity Hub.
3. Choose **Add project from disk**.
4. Select:

```text
unity-poc/
```

5. Open the project.
6. Use menu **Beyblade POC > Create Or Open POC Scene**.
7. Press **Play**.

The runtime bootstrap also creates the POC scene automatically if you press Play in an empty scene.

## Optional STL Visuals

The POC includes generated sample STL shells at:

```text
unity-poc/Assets/StreamingAssets/BeybladePoc/
```

To test exported designs visually, replace these files with your own STL exports using the same exact names:

```text
left.stl
right.stl
```

The POC treats STL models as visual-only shells. It converts CAD-style Z-up coordinates to Unity Y-up, scales the largest horizontal diameter to the current proxy bey size, and keeps the physics driven by stable primitive colliders. If a file is missing or invalid, that side falls back to the procedural colored bey.

To regenerate the included sample files:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File unity-poc\tools\generate-sample-stl-assets.ps1
```

## Local Scaffold Validation

Without Unity installed, you can still verify that required project files exist and the C# scripts pass basic structural checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File unity-poc\tools\validate-unity-poc.ps1
```

This does not compile UnityEngine APIs. The real validation is opening the project in Unity and entering Play mode.

You can also run a local C# compile check against lightweight Unity API stubs:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File unity-poc\tools\compile-check-unity-poc.ps1
```

This catches C# syntax and obvious API-shape mistakes without Unity installed. It is not a substitute for Unity Editor compilation or physics runtime validation.

## Batch Evaluation

Once Unity is installed, run the automated comparison without clicking through the editor:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File unity-poc\tools\run-unity-poc-evaluation.ps1
```

If Unity is not on `PATH`, set `UNITY_EXE` first:

```powershell
$env:UNITY_EXE = "C:\Program Files\Unity\Hub\Editor\2022.3.50f1\Editor\Unity.exe"
powershell -NoProfile -ExecutionPolicy Bypass -File unity-poc\tools\run-unity-poc-evaluation.ps1
```

The script opens `unity-poc/` in batch mode, creates the POC scene, runs the `raw-physx`, `gyro-only`, and `assisted-bowl-gyro` trials through an editor-headless `Physics.Simulate` loop, then writes a JSON report under `unity-poc/EvaluationReports/` by default. This avoids depending on Play Mode UI timing for automated runs.

The headless path explicitly sets each top's launch pose during scene construction, so it does not depend on MonoBehaviour `Awake` ordering in editor batch mode.

Summarize any generated report with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File unity-poc\tools\summarize-unity-poc-evaluation.ps1 -ReportPath unity-poc\EvaluationReports\sample-evaluation-report.json
```

Replace the sample path with the new report path printed by the batch script.

The summarizer prints validity warnings when the report looks suspicious, such as too few samples, overlapping launch poses, no meaningful bey-to-bey contact, extreme bounce height, or missing expected trials. Treat those reports as diagnostics rather than migration evidence.

## Controls

- **Space**: Launch.
- **R**: Reset and relaunch.
- **B**: Toggle analytic bowl assist.
- **G**: Toggle custom gyro assist.
- **T**: Start/stop telemetry recording.
- **S**: Save telemetry CSV to Unity's persistent data folder.
- **E**: Run automated comparison trials and save a JSON report.
- **C**: Reset camera.

## What To Evaluate

- Do beys remain stable at high spin?
- Do they contact in the center bowl naturally?
- Do they avoid trampoline-like bouncing?
- Do they avoid weird outward rim riding when speed drops?
- Do collision hits feel better than Rapier?
- Does CCD reduce wall sticking and tunneling?
- Does the native solver behave better with fewer custom corrections?
- Do raw PhysX mode and assisted mode differ enough to justify migration?
- Does the saved telemetry show lower rim samples, useful center contact, and stable spin decay?

Recommended comparison:

1. Run the current browser simulator battle with two default/reference beys.
2. Run the Unity POC with bowl assist enabled.
3. Toggle **B** to disable analytic bowl assist and observe raw PhysX bowl behavior.
4. Toggle **G** to disable custom gyro assist and observe raw PhysX spinning-top stability.
5. Press **E** to run automated `raw-physx`, `gyro-only`, and `assisted-bowl-gyro` trials.
6. Compare the JSON report's bounce-risk, rim-sample, center-contact, collision, and spin-decay metrics.
7. Press **S** after manual runs when you want full CSV telemetry.
8. If raw PhysX still behaves oddly, Unity is not solving the Beyblade-specific realism by itself.
9. If Unity with light custom assist feels smoother than Rapier with heavy custom assist, migration deserves a deeper prototype.

## Migration Decision

Unity is worth deeper migration only if this POC clearly improves:

- bey-to-bey collision feel,
- rim contact,
- low-speed settling,
- bounce stability,
- and tuning workflow.

If the POC still needs the same custom bowl, gyro, rim, and damping logic, then Unity may be best as a native/visual polish path rather than a physics realism silver bullet.

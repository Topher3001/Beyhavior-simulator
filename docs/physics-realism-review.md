# Physics Realism Review

## Current Direction

The browser simulator should stay with the current Vite, Three.js, and Rapier stack for now. The app already benefits from a lightweight desktop-friendly workflow, local storage, fast iteration, STL/OBJ import, and editable physics profiles. Unity is worth reconsidering only if the project needs authored campaign/gameplay content, complex particle/audio tooling, native desktop packaging, or production-grade controller/gamepad workflows.

Unity WebGL is viable, but it is not automatically better for this use case. Unity's own WebGL guidance notes browser CPU limits around WebAssembly, threading, SIMD, and background-tab behavior. A Unity switch would also mean rebuilding the existing IndexedDB library, import flow, and UI.

## Realism Model

The simulator should use an explicit energy story:

- Spin RPM decays through angular damping, tip friction, scrape contact, and rail engagement.
- Horizontal speed should mostly decay through floor friction and air/drag damping.
- Bowl slope can redirect motion and cause limited drifting, but it should not create runaway travel speed.
- Beyblade X rail acceleration should be modeled as a deliberate conversion of spin energy into tangential speed, not as accidental collision energy.
- Contact restitution should remain low so stadium contacts and rim hits do not behave like a trampoline.

This lines up with Rapier's damping/restitution model: damping slows rigid bodies over time, while restitution controls contact elasticity. It also lines up with Beyblade X's official game/toy language around X-Celerator/Xtreme rail speed bursts.

## Implemented In This Pass

- Added an explicit Xtreme rail drive for the BX-10 stadium.
- Rail drive applies tangential acceleration only near the modeled rail, only when spin and tip engagement are sufficient.
- Rail drive drains spin while increasing travel speed, so the boost is an energy transfer instead of free acceleration.
- Kept the previous horizontal speed budget so non-rail drift stays bounded as RPM falls.
- Strengthened bowl channeling so late-stage tops lose outward orbit speed and settle toward the center instead of swinging wider as RPM drops.
- Smoothed the raised tornado-ridge surface and made continuous bowl gravity use the concave bowl gradient rather than the ridge bump, preventing the ridge from acting like an unintended outward ramp.
- Added a low-energy radius guard for slow, non-rail contact so solver/contact corrections cannot slowly walk a dying top away from the bowl center.
- Added soft rim-bank containment outside pocket exits: slow or medium-speed tops that reach the wall are reseated onto the outer bank and lose rim-riding orbit instead of sitting on the hard boundary.
- Increased the fixed physics rate to 120 Hz, raised catch-up substeps, and tuned Rapier solver/CCD substeps for faster top contacts.
- Enabled CCD and additional solver iterations on dynamic bey proxy bodies.
- Expanded the reference loader with more official Beyblade X product-line entries as estimated profiles:
  - Knight Shield 3-80N
  - Dagger Dran 4-60R
  - Tusk Mammoth 3-60T
  - Steel Samurai 4-80T
  - Talon Ptera 3-80B
  - Knife Shinobi 4-80HN
  - Keel Shark 3-80F

## Catalog Strategy

Adding "all existing Beyblades" accurately is not just a coding task. The app needs one of these data paths:

- Measured catalog: weight, diameter, height, bit type, rough component balance, attack-point count, and approximate center of mass.
- User-import catalog: users import STL/OBJ and manually attach physics profiles.
- Official-compatibility catalog: product names and type metadata only, with estimated physics clearly marked as estimates.

The current reference loader should remain honest: measured profiles should be labeled as measured; estimated profiles should say they are catalog-seeded estimates. A complete catalog should be built as data, not hard-coded forever in the UI layer.

## Recommended Next Physics Work

- Add a calibration table comparing simulated stamina time, average speed, rail activation count, and battle win rate against real test launches.
- Record rail-engagement events in traces so Results can show when Xtreme acceleration happened.
- Split tip behavior into sharper subtypes: Flat, Low Flat, Gear Flat, Ball, Needle, High Needle, Orb, Point, and Rush-like aggressive tips.
- Add profile-level spin direction for left-spin Beyblades.
- Add optional per-design inertia multipliers so wide/heavy blades resist wobble more realistically than light or off-balance blades.

## Sources Checked

- Hasbro Beyblade X App page: https://apps.hasbro.com/en-US/beyblade-x-app
- Official Beyblade X USA product page: https://usa.beyblade.com/index.html
- Hasbro X-Celerator compatibility note: https://hasbro-new.custhelp.com/app/answers/detail/a_id/2532
- Rapier rigid body damping docs: https://rapier.rs/docs/user_guides/javascript/rigid_body_damping/
- Rapier collider restitution docs: https://rapier.rs/docs/user_guides/javascript/collider_restitution/
- Unity WebGL performance docs: https://docs.unity.cn/Documentation/Manual/webgl-performance.html

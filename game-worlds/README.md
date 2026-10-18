# Game Worlds — Refined Edition

Open http://127.0.0.1:8765/web/game_lab_v2/ to play. The original edition remains at ../game_lab/ for comparison.

Read [the refinement and review record](REFINEMENT.md) for the models, materials, lighting, motion defects, fixes, review coverage, and remaining limitations.

Seven modes: Canyon Circuit, Highway Rush, Island Air Mail, Rooftop Courier, Sky Harvest, Pocket Survival, and Outpost Survival. Select a mode and Take control, or Watch bot. Pause, Restart, world seeds, replay save/load, touch buttons and four camera choices are available. Inspect model gives a close orbit around the lead model.

Controls:

- Racing/driving: W/S throttle and brake, A/D steer, Space boost.
- Flying/drone: W/S throttle, A/D turn, E/Q altitude, Space boost.
- Survival: WASD movement, Space fires toward the nearest visible highlighted opponent.
- P pauses; R restarts.

Replays use build 20260919.2 and fixed 60 Hz simulation. Replay files from the original edition are intentionally incompatible with changed motion behavior. A ten-minute recording pauses so it can be saved. No account is needed; opponents are local bots.

The revised MP4s, per-second frames, contact sheets, independent reviews, validation reports and media archive are in outputs/game_worlds_refined_20260919. Films remain 720×1280 at 24 fps, 34–54 seconds each. Narration/music are reused from the matching first-edition film plans.

These are detailed procedural game models with arcade physics. They do not provide validated aerodynamics, a rigid-body tire/suspension solver, or online multiplayer. 2D remains an overhead graphic style; 3D survival uses a flat collision plane.

Third-party runtime: Three.js r186, MIT, license in ../expedition/vendor/LICENSE. The already-acquired autumn_field environment is from Poly Haven, CC0; provenance is retained in assets/acquired_20260914/manifest.json. Other meshes, surface maps and character designs are original procedural work.

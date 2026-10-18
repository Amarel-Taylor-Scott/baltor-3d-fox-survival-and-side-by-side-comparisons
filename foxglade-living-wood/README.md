# Foxglade Living Wood

Play as a fox, explore a seeded woodland with Pip, gather nine lights, awaken three shrines and return home. This separate edition adds sneak, pounce, rest, call, a navigating companion, three camera views, photo export and a real-animal motion study. The original Foxglade and Motion Microscope releases remain unchanged. This is a local browser prototype, not a Windows executable or a publicly hosted release.

## Run and play

Run `start.ps1` in this directory, or run `node serve.cjs 8800`. Open `http://127.0.0.1:8800` in a modern WebGL2 browser. The server exposes only this lab, listens on loopback, and does not list directories. Stop it with Ctrl+C. Node is required; no installation of game dependencies or external asset fetching is needed to play.

Choose **Enter the wood** to play or **Watch the adventure** for a reproducible guided playthrough. Take over at any time. The game has no account, analytics, provider calls, or external asset dependencies. Node is needed for the local server; Three.js and the rig files are included.

| Control | Action |
| --- | --- |
| WASD or arrows | Camera-relative movement |
| Shift | Sprint |
| Space | Jump |
| E | Awaken a nearby shrine with three lights |
| Q | Reveal the nearest objective direction |
| Ctrl | Sneak, overriding sprint |
| F | Pounce with a bounded burst and cooldown |
| T | Sit or stand; movement also cancels rest |
| B | Call Pip; the companion responds and follows |
| V | Follow, fox-eye or overlook camera |
| P | Freeze time for photo mode; drag and zoom, then save a PNG |
| Drag and mouse wheel | Orbit and zoom |
| C | Toggle camera distance |
| Escape | Pause or resume |
| R | Restart the adventure |
| M | Toggle original synthesized event sounds |

Touch controls provide movement, sprint, jump, pounce, call, sniff and interaction. The Sun button switches to moonlight. Photo exports use the current canvas resolution, not an invented high-resolution target. All progress stays in the browser session. Reloading or restarting resets it. Falling into the pond returns the fox to the last checkpoint without losing collected lights.

## Real animal motion study

Open `http://127.0.0.1:8800/motion-study.html` for synchronized real footage, estimated skeleton, paw trajectories and validation results. The nine-second licensed fox clip produced 225 frames of 17 estimated joints using upstream pretrained RTMPose AP10K. Confidence masks and provenance hashes are retained.

Four small periodic timing models were fitted locally. **None passed the held-out checks.** The game therefore retains its supplied animation timing. It does not use learned 3D poses, video-derived foot contacts or a trained locomotion policy. The disabled experimental control is intentional, not an unfinished switch. A future profile needs valid timing evidence, explicit visual approval, independent-clip validation and user opt-in before it can change clip timing.

See [the motion laboratory](motion-lab/README.md) for exact inputs, Python dependencies, reproduction commands, errors and rights. The playable package excludes the Python environment, downloaded model archives and unverified example images. The full local research folder also contains the pinned ONNX checkpoint. Rebuilding inference from the portable package requires retrieving that exact checkpoint from its recorded official source.

## Implementation

The world is synthetic and seeded with `20261017`. It uses metres, Y-up and +Z forward. Fixed simulation steps are 1/60 second. The shared map defines 84 circular tree/rock colliders, a 40-metre play boundary, pond, bridge support, nine collectibles and three shrines. Model and rendering consume the same world data. Protected corridors keep the objective route accessible.

The playable ground is flat. Scenery adds layered canopy, distant ridges, grass, ferns, flowers, mushrooms, reeds, lily pads and animated water. Water uses an authored ripple and Fresnel sheen, not reflected scene geometry or fluid simulation. The fox uses a 0.45-metre collision circle; its tail is not a physical collider. Den/shrine ornaments and bridge ropes are decorative. Jumping and ground contacts are kinematic; the supplied animation is not terrain IK or measured animal biomechanics.

The guided tour applies ordinary movement, jump, sniff and interaction inputs to the same game model. It does not teleport, inject collectibles or fabricate a win. Pip uses deterministic pathfinding with shared obstacle, water and bridge support checks. Both controllers are authored, not trained agents. Shared circle proxies do not guarantee separation of every tail or limb. Synthesized event sounds are opt-in.

## Source and licenses

The animated fox is the actual [Mesh2Motion project sample](https://github.com/Mesh2Motion/mesh2motion-app/tree/653a9698f5f315523072f1c3ff3496100401317b), pinned to commit `653a9698f5f315523072f1c3ff3496100401317b`. Its 49-bone skeleton and 14 supplied clips are verified against the local manifest before loading. The artwork is CC0-1.0. This build uses an existing supplied rig, not a newly performed autorigging run.

Three.js r186 is vendored under its MIT license. The game code, world arrangement and procedural scenery were created for this build. Original project licenses and provenance remain in `assets/mesh2motion` and `vendor/three`.

Implementation references: [Three.js AnimationAction](https://threejs.org/docs/pages/AnimationAction.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) and [Raycaster](https://threejs.org/docs/pages/Raycaster.html). Camera clearance here uses the shared circle proxies, not triangle-level Raycaster collision.

## Verification and capture

Run `npm.cmd test` for model, companion, camera, integration and motion-admission tests. `node qa.cjs --out output/qa-new` exercises real desktop and responsive controls, action states, photo export and the complete deterministic tour. Output directories must be new. The QA/capture tools use installed Playwright, Sharp, Chrome and FFmpeg runtimes; their development-machine paths are in `capture.cjs` and may need configuration on another computer. Playing the game does not require those QA tools.

Capture is pilot-first:

```text
node capture.cjs pilot --out output/pilot-new
node capture.cjs render --out output/film-new --pilot-approved output/pilot-new
node capture.cjs verify --input output/film-new --out output/verify-new
```

The render requires a source-matching `visual-review.json` with explicit approval in the pilot directory. Never set approval without inspecting the actual pilot frames. Technical receipts and separate visual-review sidecars live under `output`. A passing model test does not establish a passing render, browser playback, aesthetic approval or publication.

Current receipts live in `output`. A failed browser attempt is retained alongside any later repair recheck; it is never rewritten as success. Source hashes include the exact real-video profile and inspector evidence. Gamepad, persistent saves, terrain IK, mesh-aware collisions, packaged native binaries and general animal-motion training are not implemented in this prototype.

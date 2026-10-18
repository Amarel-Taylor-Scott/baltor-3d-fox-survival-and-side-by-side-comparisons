# Mesh2Motion assets in this lab

These are **real project-supplied skinned meshes, bones, skin weights and animation clips** from the official Mesh2Motion application. The lab loads and plays those clips using Three.js. It does not claim to have automatically rigged an original model, performed retargeting, or exported a new rig through the Mesh2Motion application.

Upstream repository: https://github.com/Mesh2Motion/mesh2motion-app

Pinned revision: `653a9698f5f315523072f1c3ff3496100401317b`

- `fox-animations.glb`: the project's fox mesh, 49 joints, 14 embedded animation clips.
- `human-base-animations.glb`: the project's human mannequin mesh, 66 joints, 87 embedded animation clips.
- `model-fox.glb` and `model-human.glb`: supplied **unrigged** inputs, retained to make a later actual application import/export exercise possible. They are not the animated files used in the scene.

The exact URLs, bytes, SHA-256 hashes, clip names and source scopes are recorded in `manifest.json`. Both animated assets embed their texture, geometry, skin and animation data; no runtime remote download is required.

The upstream README assigns art assets (3D models, rigs and animations) to CC0. The upstream `LICENSE-CC0.MD` is retained alongside its separate software MIT license. The upstream project is credited even though CC0 does not require attribution. No external character packs, Mixamo test assets or third-party variation models were downloaded.

## Integration changes

The binary files are unmodified. `rig-loader.mjs` clones skeletons independently, normalizes each instance to two scene units tall, preserves texture/material identity, and exposes exact-time selection of embedded clips. Wireframe and skeleton views are local visualization modes, not altered exports. The local parent can style lighting and composition independently.

Three.js r186 `GLTFLoader`, `SkeletonUtils` and `BufferGeometryUtils` are vendored from the official `mrdoob/three.js` repository. Their only code modification is replacing the bare `three` import with the local `../../three.module.js` path. The Three MIT license is retained at `vendor/three/LICENSE`.

## Checks and limits

Static tests verify exact binary hashes, GLB container structure, embedded skin attributes, declared joint/clip counts, and lack of external buffer/image references. Browser tests additionally verify loaded skinned meshes, bone motion, independent skeleton clones, repeatable seek order, material view reset and normalization.

These checks establish actual loaded rigs and deterministic playback. They do not prove automatic rigging quality for an arbitrary new input, production retargeting quality, collision simulation, phoneme lip sync or animation suitability for every shot. Pilot-frame review is still required before rendering or publishing.

`runtime-evidence.json` records the successful local Chrome load/animation checks for both assets. `app-probe.cjs` and `app-joint-preview.png` are a separate exploratory application-route diagnostic: a public CC0 unrigged reference fox was loaded into the live application, its fox template selected and the animation-preview screen reached. No new exported GLB was downloaded, adopted or validated through that probe. The film library still uses only the hash-pinned upstream supplied animation GLBs above.

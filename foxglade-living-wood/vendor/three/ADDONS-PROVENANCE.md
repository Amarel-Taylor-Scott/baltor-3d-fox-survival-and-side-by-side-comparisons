# Three.js loader support

The original Three.js MIT license is `LICENSE` in this directory.

The following files come from the official `mrdoob/three.js` repository, release tag `r186`:

- `addons/loaders/GLTFLoader.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/GLTFLoader.js
- `addons/utils/SkeletonUtils.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/SkeletonUtils.js
- `addons/utils/BufferGeometryUtils.js`: https://github.com/mrdoob/three.js/blob/r186/examples/jsm/utils/BufferGeometryUtils.js

Only the bare `three` import was modified to `../../three.module.js`, using the adjacent r186 local runtime. No CDN, decoder executable or remotely loaded script is needed by the supplied uncompressed GLBs. Three.js r186 and the Mesh2Motion CC0 art licenses are independent.

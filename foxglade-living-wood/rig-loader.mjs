import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/three/addons/utils/SkeletonUtils.js';

/** Real, upstream Mesh2Motion sample rigs. This does not run auto-rigging. */
export async function loadRigLibrary(THREE) {
  if (String(THREE.REVISION) !== '186') throw new Error('Rig library requires the pinned Three.js r186 runtime.');
  const manifestUrl = new URL('./assets/mesh2motion/manifest.json', import.meta.url);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Rig manifest unavailable: ${response.status}`);
  const manifest = await response.json();
  // Foxglade uses the fox only. Keep the source manifest intact, but do not
  // load the unrelated human sample into the playable game's memory.
  const selectedAssets = manifest.assets.filter(asset => asset.id === 'fox');
  if(selectedAssets.length !== 1) throw new Error('Exactly one source-pinned fox rig is required.');
  const loader = new GLTFLoader();
  const templates = new Map();
  for (const asset of selectedAssets) {
    const url = new URL(asset.file, manifestUrl);
    // Fully consume and hash the binary before parsing. This also avoids a
    // FileLoader streaming/cancellation ambiguity in browser recording QA.
    const binaryResponse = await fetch(url);
    if (!binaryResponse.ok) throw new Error(`${asset.id}: binary HTTP ${binaryResponse.status}`);
    const binary = await binaryResponse.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',binary))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(digest!==asset.sha256 || binary.byteLength!==asset.bytes) throw new Error(`${asset.id}: browser binary integrity mismatch`);
    const gltf = await loader.parseAsync(binary, new URL('.',url).href);
    let bones = 0, skinnedMeshes = 0, weightedVertices = 0;
    gltf.scene.traverse(node => {
      if (node.isBone) bones++;
      if (node.isSkinnedMesh) {
        skinnedMeshes++;
        const weights = node.geometry.getAttribute('skinWeight');
        const indices = node.geometry.getAttribute('skinIndex');
        if (!weights || !indices) throw new Error(`${asset.id}: skin attributes missing.`);
        weightedVertices += weights.count;
        node.frustumCulled = false;
      }
    });
    if (bones !== asset.bones || skinnedMeshes !== asset.skinnedMeshes || gltf.animations.length !== asset.clipCount) {
      throw new Error(`${asset.id}: loaded rig does not match its declared topology.`);
    }
    templates.set(asset.id, {gltf, asset, stats: {id:asset.id,bones,skinnedMeshes,weightedVertices,
      clips:gltf.animations.map(clip=>({name:clip.name,duration:clip.duration,tracks:clip.tracks.length})),
      source:asset.source,sha256:asset.sha256,license:asset.license,provenance:asset.provenance}});
  }
  const assets = selectedAssets.map(asset => ({...asset,stats:templates.get(asset.id).stats}));

  function createInstance(assetId) {
    const template = templates.get(assetId);
    if (!template) throw new Error(`Unknown rig: ${assetId}`);
    const source = cloneSkeleton(template.gltf.scene);
    source.name = `${assetId}-skinned-content`;
    const root = new THREE.Group(); root.name = `${assetId}-normalized-rig`;
    const normalize = new THREE.Group(); normalize.add(source); root.add(normalize);
    const meshStates = [];
    source.traverse(node => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      node.castShadow = true; node.receiveShadow = true;
      const originals = Array.isArray(node.material) ? node.material : [node.material];
      const copies = originals.map(material => material.clone());
      node.material = Array.isArray(node.material) ? copies : copies[0];
      meshStates.push({node,materials:copies,opacity:copies.map(m=>m.opacity),transparent:copies.map(m=>m.transparent)});
    });
    source.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(source, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (!(size.y > 0) || !Number.isFinite(size.y)) throw new Error(`${assetId}: invalid bounds.`);
    const scale = 2/size.y;
    normalize.scale.setScalar(scale);
    normalize.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    root.updateMatrixWorld(true);
    const bounds = {height:2,width:size.x*scale,depth:size.z*scale,rawSize:size.toArray(),rawMin:box.min.toArray(),scale};
    const helper = new THREE.SkeletonHelper(source);
    helper.name = `${assetId}-skeleton-overlay`;
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = .95;
    helper.renderOrder = 5;
    // SkeletonHelper normally expects to be attached to the world scene. Here
    // it is a sibling of the source and uses the source LOCAL matrix so the
    // caller's wrapper transforms are not applied twice.
    helper.matrix = source.matrix;
    normalize.add(helper); helper.visible = false;
    const mixer = new THREE.AnimationMixer(source);
    const clips = template.gltf.animations.map(clip => clip.clone());
    let lastClip = null, currentTime = 0, view = 'beauty', disposed = false;
    function seek(time, clipName = template.asset.defaultClip) {
      if (disposed) throw new Error('Cannot seek a disposed rig.');
      if (!Number.isFinite(time)) throw new Error('Rig time must be finite.');
      const clip = clips.find(item => item.name === clipName);
      if (!clip) throw new Error(`${assetId}: animation ${clipName} is unavailable.`);
      // Reset every action for order-independent sampling. No accumulated delta.
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.reset(); action.setLoop(THREE.LoopRepeat, Infinity); action.play();
      mixer.setTime(((time % clip.duration) + clip.duration) % clip.duration);
      source.updateMatrixWorld(true);
      source.traverse(node => { if (node.isSkinnedMesh) node.skeleton.update(); });
      root.updateMatrixWorld(true); helper.updateMatrixWorld(true);
      lastClip = clip.name; currentTime = time;
      return {assetId,time,clip:clip.name,clipDuration:clip.duration,view};
    }
    function setView(next) {
      if (!['beauty','wire','skeleton'].includes(next)) throw new Error(`Unsupported rig view: ${next}`);
      view = next; helper.visible = next === 'skeleton';
      for (const entry of meshStates) entry.materials.forEach((material,i)=>{
        material.wireframe = next === 'wire';
        material.opacity = next === 'skeleton' ? .14 : entry.opacity[i];
        material.transparent = next === 'skeleton' || entry.transparent[i];
        material.depthWrite = next !== 'skeleton';
        material.needsUpdate = true;
      });
      return view;
    }
    function samplePose() {
      const bones = [];
      source.traverse(node=> {if(node.isBone) bones.push([node.name,...node.position.toArray(),...node.quaternion.toArray()]);});
      return {assetId,time:currentTime,clip:lastClip,bones};
    }
    function dispose() {
      if (disposed) return;
      disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(source);
      meshStates.forEach(entry=>entry.materials.forEach(material=>material.dispose()));
      source.traverse(node=> {if(node.isSkinnedMesh) node.skeleton.dispose();});
      helper.geometry.dispose(); helper.material.dispose(); root.clear();
    }
    seek(0);
    return {root,mixer,clips,seek,setView,samplePose,bounds,stats:{...template.stats,normalizedHeight:2},dispose};
  }
  return {assets,createInstance,manifest};
}

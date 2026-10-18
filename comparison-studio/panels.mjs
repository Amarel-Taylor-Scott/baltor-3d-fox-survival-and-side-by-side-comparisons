import * as THREE from '../foxglade-living-wood/vendor/three/three.module.js';
import {roundedBoxGeometry} from './geometry.mjs';

// Original procedural teaching specimens. These scenes use rasterized lighting;
// their broad-source treatment is a fill-light approximation, not ray tracing.
let renderer;
const scenes = new Map();
const TAU = Math.PI * 2;
const PALETTES = {
  warm: { body: '#d9a55e', ceramic: '#78c8c4', metal: '#b7c2c8', base: '#203347' },
  cool: { body: '#b6a6e3', ceramic: '#b9a5df', metal: '#c1ccd6', base: '#302a47' },
  paper: { body: '#c0804d', ceramic: '#74a7aa', metal: '#acb6b7', base: '#384b54' },
};

function palette(style) {
  const name = typeof style === 'string' ? style : style?.name;
  if(name==='editorial') return PALETTES.warm;
  if(name==='neon') return {body:'#e59dc4',ceramic:'#7ad6df',metal:'#bbbfda',base:'#2f2347'};
  return PALETTES[name] || PALETTES.warm;
}
function mat(color, metalness = 0, roughness = .48) {
  return new THREE.MeshStandardMaterial({color, metalness, roughness});
}
function add(parent, geometry, material, xyz = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...xyz); item.castShadow = true; item.receiveShadow = true;
  parent.add(item); return item;
}
function rod(parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const vector = end.clone().sub(start);
  const item = add(parent, new THREE.CylinderGeometry(radius, radius, vector.length(), 24), material,
    start.clone().add(end).multiplyScalar(.5).toArray());
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  return item;
}
function torus(parent, radius, tube, material, xyz, rotation = [0, 0, 0]) {
  const item = add(parent, new THREE.TorusGeometry(radius, tube, 16, 96), material, xyz);
  item.rotation.set(...rotation); return item;
}
function directional(scene, color, intensity, xyz, shadows = false) {
  const light = new THREE.DirectionalLight(color, intensity); light.position.set(...xyz);
  light.target.position.set(0, 1.4, 0); scene.add(light, light.target);
  light.castShadow = shadows;
  if (shadows) {
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, {left: -4, right: 4, top: 5, bottom: -3, near: .1, far: 25});
    light.shadow.normalBias = .015; light.shadow.bias = -.00015;
  }
  return light;
}
function lightScene(scene, index) {
  if (index === 0) {
    scene.add(new THREE.AmbientLight('#d6e5f0', 2.05));
    return 'Uniform ambient illumination; no directional key';
  }
  if (index === 1) {
    scene.add(new THREE.AmbientLight('#b6d3e0', .16));
    directional(scene, '#fff0d9', 3.3, [-4.5, 6.5, 4.5], true);
    return 'Directional small-source approximation with low fill';
  }
  scene.add(new THREE.HemisphereLight('#e7f3ff', '#647884', 1.2));
  directional(scene, '#fff0da', 2.3, [-4.5, 6.5, 4.5], true);
  directional(scene, '#d5edff', .65, [5, 3, 4]);
  if (index === 3) directional(scene, '#b4eaf1', 3.0, [3.5, 4.5, -4]);
  return index === 3 ? 'Filled key plus separate rear rim light' : 'Filled key: broad-source appearance approximation';
}
function plinth(scene, hero, p, radius = 1.28) {
  add(hero, new THREE.CylinderGeometry(radius, radius, .19, 96), mat(p.base, .22, .58), [0, .095, 0]);
  torus(hero, radius - .035, .025, mat(p.metal, .55, .4), [0, .184, 0], [Math.PI / 2, 0, 0]);
  // A local authored contact gradient keeps the specimen grounded without a
  // hard projected floor-shadow tail being cut by the panel's image aperture.
  // Specimens still receive their directional self-shadows above the plinth.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const shadowContext=shadowCanvas.getContext('2d');
  const gradient=shadowContext.createRadialGradient(64,64,28,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.55)');gradient.addColorStop(.55,'rgba(0,0,0,.20)');gradient.addColorStop(1,'rgba(0,0,0,0)');
  shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,128,128);
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  const floor=add(scene,new THREE.PlaneGeometry(radius*2.7,radius*2.7),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}),[0,-.012,0]);
  floor.rotation.x=-Math.PI/2;floor.castShadow=false;floor.receiveShadow=false;
}

// Closed cross section goes along the outside, over the lip, down the inside,
// then across the vessel's thick floor. Flat radial caps are handled separately.
export const VASE_PROFILE = [
  [.00,.20],[.48,.20],[.61,.22],[.66,.28],[.67,.36],
  [.70,.48],[.79,.69],[.89,.96],[.96,1.24],[.97,1.50],
  [.92,1.78],[.83,2.04],[.72,2.30],[.65,2.53],[.64,2.67],
  [.66,2.73],[.68,2.76],[.68,2.80],[.66,2.83],[.60,2.83],
  [.58,2.80],[.58,2.74],[.57,2.66],[.58,2.54],[.65,2.32],
  [.76,2.06],[.85,1.80],[.90,1.52],[.89,1.26],[.82,.98],
  [.72,.72],[.63,.51],[.60,.41],[.55,.35],[.00,.35],
];
export function vaseRelief(y, angle, fluted) {
  if (!fluted || y <= .35 || y >= 2.72) return 0;
  const window = Math.sin(Math.PI * (y - .35) / 2.37);
  return .067 * window * window * Math.cos(20 * angle);
}
export function sampledVaseProfile() {
  const curve=new THREE.SplineCurve(VASE_PROFILE.map(([r,y])=>new THREE.Vector2(r,y)));
  const count=(VASE_PROFILE.length-1)*6;
  return Array.from({length:count+1},(_,i)=>{
    if(i===0)return [...VASE_PROFILE[0]];
    if(i===count)return [...VASE_PROFILE.at(-1)];
    const p=curve.getPoint(i/count);
    return [Math.max(.00001,p.x),p.y];
  });
}
export function makeVaseGeometry(fluted = false, radialSegments = 160) {
  if (!Number.isInteger(radialSegments) || radialSegments < 40) throw Error('At least 40 radial segments required');
  const profile = sampledVaseProfile();
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j < profile.length; j++) {
    const [radius, y] = profile[j];
    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments, angle = u * TAU;
      const r = radius === 0 ? 0 : radius + vaseRelief(y, angle, fluted);
      positions.push(r * Math.sin(angle), y, r * Math.cos(angle));
      uvs.push(u, (y - .2) / 2.63);
    }
  }
  const stride = radialSegments + 1;
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
      // Pole fans omit the zero-area triangles of a duplicated-pole lathe.
      if (profile[j][0] !== 0) indices.push(a, b, d);
      if (profile[j + 1][0] !== 0) indices.push(a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  // Weld the normal of the duplicated UV seam (positions intentionally remain UV-split).
  const normal = geometry.getAttribute('normal');
  for (let j = 0; j < profile.length; j++) {
    const a = j * stride, b = a + radialSegments;
    const n = new THREE.Vector3().fromBufferAttribute(normal, a).add(new THREE.Vector3().fromBufferAttribute(normal, b)).normalize();
    normal.setXYZ(a, n.x, n.y, n.z); normal.setXYZ(b, n.x, n.y, n.z);
  }
  return geometry;
}
function bumpTexture(mode) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d'), data = context.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const k = (y * 512 + x) * 4;
    // Several resolvable ceramic-grain frequencies, rather than subpixel noise
    // that vanishes when a specimen is reduced to a small social-video panel.
    const grain = .5*Math.sin(x*.13+Math.sin(y*.06)*2)+.3*Math.cos(y*.16+x*.07)+.2*Math.sin(x*.47-y*.31);
    const value = mode === 'flute' ? 128 + 110 * Math.cos(TAU * 20 * x / 512) * Math.sin(Math.PI * y / 512) ** 2 : 180 + 72 * grain;
    data.data[k] = data.data[k + 1] = data.data[k + 2] = value; data.data[k + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4; return texture;
}
function lightingSpecimen(hero, p) {
  const metal = mat(p.metal, .55, .40), dark = mat(p.base, .35, .52), body = mat(p.body, .12, .39);
  add(hero, new THREE.CylinderGeometry(.86,.92,.18,80), dark, [0,.28,0]);
  add(hero, new THREE.CylinderGeometry(.17,.25,.66,48), metal, [0,.66,0]);
  // Paired yoke supports physically meet the ring's axle pins.
  for (const x of [-1,1]) {
    add(hero, roundedBoxGeometry(.13,1.11,.19,.045), metal,[x,1.04,0]);
    rod(hero, [x,.49,0], [x*.50,.40,0], .075, metal);
    rod(hero,[x*.89,1.60,0],[x*1.12,1.60,0],.10,metal);
    add(hero,new THREE.CylinderGeometry(.105,.105,.045,32),dark,[x,1.62,0]);
  }
  const suspended = new THREE.Group(); suspended.position.y = 1.60; hero.add(suspended);
  torus(suspended, .91, .067, metal, [0,0,0]);
  const ball = add(suspended,new THREE.SphereGeometry(.65,80,56),body);
  torus(suspended,.647,.012,dark,[0,0,0],[Math.PI/2,0,0]);
  for(const sign of [-1,1]) rod(suspended,[sign*.65,0,0],[sign*.91,0,0],.045,metal);
  const lens = add(suspended,new THREE.CylinderGeometry(.23,.23,.055,64),dark,[0,0,.635]); lens.rotation.x=Math.PI/2;
  torus(suspended,.23,.018,metal,[0,0,.667]);
  const glass = add(suspended,new THREE.CircleGeometry(.192,64),mat(p.ceramic,.15,.32),[0,0,.666]);
  for(let i=0;i<8;i++) {
    const a=i*TAU/8;
    add(hero,new THREE.CylinderGeometry(.043,.043,.025,6),metal,[.70*Math.sin(a),.382,.70*Math.cos(a)]);
  }
  return {suspended,ball,glass};
}
export function analyticalPendulum(t, length) {
  if (!Number.isFinite(t) || ![1,4].includes(length)) throw Error('Expected finite time and a 1 m or 4 m pendulum');
  const period = TAU * Math.sqrt(length/9.81);
  const angle = .1 * Math.cos(TAU*t/period);
  return {length, period, angle, bob: [Math.sin(angle)*length, 4.65-Math.cos(angle)*length, .12], g:9.81, amplitude:.1};
}
function pendulumSpecimen(hero,p,index) {
  const metal=mat(p.metal,.5,.46), dark=mat(p.base,.2,.65), length=index===0?1:4;
  for(const x of [-1,1]) {
    rod(hero,[x,.18,-.3],[x,4.65,-.3],.045,metal);
    add(hero,new THREE.CylinderGeometry(.14,.16,.12,32),dark,[x,.25,-.3]);
  }
  rod(hero,[-1,4.65,-.3],[1,4.65,-.3],.055,metal);
  rod(hero,[0,4.65,-.3],[0,4.65,.12],.065,metal);
  const swing=new THREE.Group(); swing.position.set(0,4.65,.12); hero.add(swing);
  rod(swing,[0,0,0],[0,-length,0],.014,metal);
  add(swing,new THREE.SphereGeometry(.22,48,32),mat(index===0?p.body:p.ceramic,.35,.35),[0,-length,0]);
  add(hero,new THREE.SphereGeometry(.07,32,24),metal,[0,4.65,.12]);
  // Identical half-metre ticks and scale are geometry, never panel-specific zoom.
  for(let i=0;i<9;i++) rod(hero,[-1.13,.65+i*.5,-.3],[-1.02,.65+i*.5,-.3],.012,metal);
  return {swing,length};
}
function build(topic,index,style) {
  const p=palette(style), scene=new THREE.Scene(), hero=new THREE.Group(); scene.add(hero);
  const lightDescription=lightScene(scene,topic==='lighting'?index:3);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,40);
  let objects={};
  if(topic==='lighting') {
    plinth(scene,hero,p,1.28); objects=lightingSpecimen(hero,p);
  } else if(topic==='surface') {
    plinth(scene,hero,p,1.18);
    const material=mat(p.ceramic,.08,.42);
    if(index===1) {material.bumpMap=bumpTexture('flute'); material.bumpScale=.55;}
    if(index===3) {material.bumpMap=bumpTexture('grain'); material.bumpScale=.12; material.roughnessMap=material.bumpMap; material.roughness=.98;}
    objects.vase=add(hero,makeVaseGeometry(index>=2),material);
  } else if(topic==='pendulum') {
    plinth(scene,hero,p,1.30); objects=pendulumSpecimen(hero,p,index);
  } else throw Error(`Unsupported panel topic: ${topic}`);
  const target=topic==='pendulum'?[0,2.45,0]:[0,1.43,0];
  camera.position.set(...(topic==='pendulum'?[1.3,3.25,11]:[4.1,3.8,7]));
  camera.lookAt(...target); camera.updateMatrixWorld(true);
  const model={scene,hero,camera,objects,topic,index,p,lightDescription}; scenes.set(`${topic}:${index}:${JSON.stringify(style||'warm')}`,model); return model;
}
export function normalizedBounds(hero,camera) {
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity],q=new THREE.Vector3();
  let vertices=0,depthInside=true,finite=true;
  const viewProjection=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  hero.traverseVisible(object=>{
    if(!object.isMesh)return;
    const p=object.geometry.getAttribute('position');
    const mvp=new THREE.Matrix4().multiplyMatrices(viewProjection,object.matrixWorld);
    for(let i=0;i<p.count;i++) {
      q.fromBufferAttribute(p,i).applyMatrix4(mvp);
      const u=(q.x+1)/2,v=(1-q.y)/2;
      finite&&=[u,v,q.z].every(Number.isFinite);depthInside&&=q.z>=-1&&q.z<=1;
      min[0]=Math.min(min[0],u);min[1]=Math.min(min[1],v);max[0]=Math.max(max[0],u);max[1]=Math.max(max[1],v);vertices++;
    }
  });
  return {left:min[0],top:min[1],right:max[0],bottom:max[1],inside:finite&&depthInside&&min[0]>=0&&min[1]>=0&&max[0]<=1&&max[1]<=1,method:'projected actual mesh vertices',vertices};
}

/** The returned canvas belongs to one shared renderer: draw it before the next call. */
export function renderPanel({topic,index=0,t=0,width,height,style='warm'}) {
  if(!['lighting','surface','pendulum'].includes(topic)||!Number.isInteger(index)||index<0||index>(topic==='pendulum'?1:3)) throw Error('Unsupported topic/index');
  if(!Number.isFinite(t)||t<0||t>=8) throw Error('Panel time must be in [0,8)');
  if(![width,height].every(x=>Number.isInteger(x)&&x>=64&&x<=2160)) throw Error('Panel size must be integer 64..2160');
  if(!renderer) {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,premultipliedAlpha:false});
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000,0);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  }
  if(renderer.domElement.width!==width||renderer.domElement.height!==height) renderer.setSize(width,height,false);
  const key=`${topic}:${index}:${JSON.stringify(style||'warm')}`, model=scenes.get(key)||build(topic,index,style);
  const {scene,hero,camera,objects}=model, aspect=width/height;
  // Fixed world span across panels. Aspect compensation preserves full silhouettes.
  const halfY=topic==='pendulum'?2.85:1.75, halfX=Math.max(topic==='pendulum'?1.52:1.80,halfY*aspect);
  camera.left=-halfX;camera.right=halfX;camera.top=halfX/aspect;camera.bottom=-halfX/aspect;camera.updateProjectionMatrix();
  let motion={authored:true};
  if(topic==='pendulum') {
    motion=analyticalPendulum(t,objects.length); objects.swing.rotation.z=motion.angle;
  } else {
    hero.rotation.y=.20*Math.sin(TAU*t/16); // Small authored turn, identical controls in all panels.
    if(topic==='lighting') objects.suspended.rotation.x=.08*Math.sin(TAU*t/8);
  }
  scene.updateMatrixWorld(true); renderer.render(scene,camera);
  let finite=true,meshes=0,triangles=0;
  hero.traverse(o=>{
    finite&&=o.matrixWorld.elements.every(Number.isFinite);
    if(o.isMesh) {meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}
  });
  const bounds=normalizedBounds(hero,camera);
  return {canvas:renderer.domElement,metrics:{
    topic,index,time:t,width,height,finite,meshes,triangles,heroBounds:bounds,
    camera:{projection:'orthographic',position:camera.position.toArray(),worldSpanX:halfX*2,worldSpanY:halfX*2/aspect,matchedWithinTopic:true},
    lighting:{method:'Three.js rasterized standard material with PCF self-shadow maps and authored local contact gradient',description:model.lightDescription,rayTracing:false,exposure:.96},
    surface:topic==='surface'?{actualFlutes:index>=2,fluteCount:index>=2?20:0,peakRelief:.067,shaderOnly:index===1,microBump:index===3,sameBaseProfile:true}:null,
    motion,assumptions:topic==='pendulum'?'Ideal small-angle model; no drag or finite-bob corrections':'Original authored specimen, not a validated manufactured product',
  }};
}

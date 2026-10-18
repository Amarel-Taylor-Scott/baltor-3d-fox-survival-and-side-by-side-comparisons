/** Deterministic arcade driving with articulated vehicles and layered set geometry. */
import {createMaterialKit} from './materials.js';
export function createRacing({ THREE, scene, seed = 17, variant = 'race' }) {
  const drive = variant === 'drive';
  const root = new THREE.Group();
  root.name = drive ? 'Highway Rush' : 'Canyon Circuit';
  scene.add(root);
  const surface=createMaterialKit(THREE);
  const materials = new Map();
  const geometries = new Set();
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const unitSphere = new THREE.IcosahedronGeometry(1, 1);
  geometries.add(unitSphere);
  geometries.add(unitBox); geometries.add(unitCylinder);
  const mat = (color, emissive = false) => {
    const key = `${color}-${emissive}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: emissive ? 0.38 : 0.78, metalness: emissive ? 0.18 : 0.03,
      emissive: emissive ? color : 0x000000, emissiveIntensity: emissive ? 0.4 : 0,
    }));
    return materials.get(key);
  };
  function box(parent, x, y, z, w, h, d, color, emissive = false) {
    const mesh = new THREE.Mesh(unitBox, mat(color, emissive));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function cylinder(parent, x, y, z, r, h, color) {
    const mesh = new THREE.Mesh(unitCylinder, mat(color));
    mesh.position.set(x, y, z); mesh.scale.set(r, h, r); parent.add(mesh); return mesh;
  }
  const cameraObstacles = [];
  const physical = (key, options) => {
    if (!materials.has(key)) materials.set(key, new THREE.MeshPhysicalMaterial(options));
    return materials.get(key);
  };
  const glass = physical('automotive-glass', { color: 0x28434c, roughness: .13, metalness: .12, clearcoat: 1, clearcoatRoughness: .07 });
  const alloy = physical('alloy', { color: 0xa4aab0, roughness: .23, metalness: .82 });
  const rubber = physical('rubber', { color: 0x141619, roughness: .94 });
  const paint = color => physical(`paint-${color}`, { color, roughness: .26, metalness: .42, clearcoat: 1, clearcoatRoughness: .14 });
  function sandstone(vertexColors=false){
    const key=vertexColors?'strata':'arch-sandstone';if(materials.has(key))return materials.get(key);
    const m=new THREE.MeshStandardMaterial({color:vertexColors?0xffffff:0xbd885e,vertexColors,roughness:.97});
    m.onBeforeCompile=s=>{
      s.vertexShader='varying vec3 vRockWorld;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvRockWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      s.fragmentShader='varying vec3 vRockWorld;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float grit=fract(sin(dot(floor(vRockWorld*8.0),vec3(12.9898,78.233,41.171)))*43758.5453);
        float layers=sin(vRockWorld.y*1.7+sin(vRockWorld.x*.065)+cos(vRockWorld.z*.07));
        diffuseColor.rgb*=.96+.10*(grit-.5)+.045*layers;`);
    };m.customProgramCacheKey=()=>key+'-mineral-grain';materials.set(key,m);return m;
  }
  function detail(parent, geo, material, x = 0, y = 0, z = 0) {
    geometries.add(geo);
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rock(parent, x, y, z, width, height, depth, salt = 0) {
    // Consistent horizontal strata across a tapered, chipped sandstone silhouette.
    const sides = 11, levels = 9, positions = [], colors = [], indices = [];
    const rings = [1.03,1.01,.97,.92,.96,.85,.82,.74,.55];
    const strata = [0x9b573f,0xab6346,0xca8256,0xb46f4f,0xd49968,0xc28659,0xe3ac79,0xc38a61,0xd8a477];
    for(let j=0;j<levels;j++) for(let k=0;k<=sides;k++) {
      const a=(k%sides)/sides*Math.PI*2;
      const notch=1+.1*Math.sin(a*3+salt)+.065*Math.sin(a*5+salt*.47+j*.7);
      const top=j===levels-1 ? 1+.045*Math.sin(a*3+salt):1;
      positions.push(Math.cos(a)*width*.5*rings[j]*notch, j/(levels-1)*height*top, Math.sin(a)*depth*.5*rings[j]*notch);
      const c=new THREE.Color(strata[j]); const shade=.94+.08*Math.sin(a*2+salt); c.multiplyScalar(shade); colors.push(c.r,c.g,c.b);
      if(j<levels-1&&k<sides){const v=j*(sides+1)+k;indices.push(v,v+sides+1,v+1,v+1,v+sides+1,v+sides+2);}
    }
    const center=positions.length/3; positions.push(0,height*.985,0);const c=new THREE.Color(strata.at(-1));colors.push(c.r,c.g,c.b);
    for(let k=0;k<sides;k++){const v=(levels-1)*(sides+1)+k;indices.push(center,v+1,v);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=detail(parent,geo,sandstone(true),x,y,z);mesh.userData.occluder=true;cameraObstacles.push(mesh);return mesh;
  }
  function batchStatic() {
    // Collapse repeated static primitives; interactive vehicles, pickups and banners stay articulated.
    const buckets=new Map();
    for(const mesh of [...root.children]) if(mesh.isMesh&&(mesh.geometry===unitBox||mesh.geometry===unitCylinder||mesh.geometry===unitSphere)){
      const key=`${mesh.geometry.uuid}/${mesh.material.uuid}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(mesh);
    }
    for(const list of buckets.values())if(list.length>2){
      const inst=new THREE.InstancedMesh(list[0].geometry,list[0].material,list.length);inst.castShadow=list.some(m=>m.castShadow);inst.receiveShadow=true;
      list.forEach((m,i)=>{m.updateMatrix();inst.setMatrixAt(i,m.matrix);root.remove(m);});inst.computeBoundingSphere();root.add(inst);
      // Instanced building bounds are broad; actual raycasting still tests their individual instances.
      if(list.some(m=>m.userData.occluder)){inst.userData.occluder=true;cameraObstacles.push(inst);}
    }
  }
  function randomGenerator(s) {
    let n = Number(s) >>> 0;
    return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  let random = randomGenerator(seed);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  function vehicleFootprintsOverlap(a,b){
    const axes=yaw=>[[Math.cos(yaw),-Math.sin(yaw)],[Math.sin(yaw),Math.cos(yaw)]];
    const aa=axes(a.yaw),bb=axes(b.yaw),dx=b.x-a.x,dz=b.z-a.z;
    for(const axis of [...aa,...bb]){
      const extent=basis=>1.4*Math.abs(basis[0][0]*axis[0]+basis[0][1]*axis[1])+2.7*Math.abs(basis[1][0]*axis[0]+basis[1][1]*axis[1]);
      if(Math.abs(dx*axis[0]+dz*axis[1])>=extent(aa)+extent(bb))return false;
    }
    return true;
  }
  const points = (drive ? [
    [-150, -175], [15, -205], [170, -160], [190, -25], [145, 165], [-10, 200], [-175, 145], [-205, -10],
  ] : [
    [-120, -205], [30, -220], [185, -130], [160, 20], [215, 155], [50, 210], [-140, 155], [-200, -5],
  ]).map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  const samples = Array.from({ length: 361 }, (_, i) => curve.getPoint(i / 360));
  const distances = [0];
  for (let i = 1; i < samples.length; i++) distances.push(distances[i - 1] + samples[i].distanceTo(samples[i - 1]));
  const length = distances.at(-1);
  function at(distance) {
    let s = ((distance % length) + length) % length;
    let lo = 0, hi = distances.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (distances[mid] < s) lo = mid; else hi = mid; }
    const a = samples[lo], b = samples[hi];
    const f = (s - distances[lo]) / (distances[hi] - distances[lo]);
    const dx = b.x - a.x, dz = b.z - a.z;
    const prev=samples[(lo+359)%360],next=samples[(hi+1)%360];
    const aYaw=Math.atan2(b.x-prev.x,b.z-prev.z),bYaw=Math.atan2(next.x-a.x,next.z-a.z),yaw=aYaw+wrap(bYaw-aYaw)*f;
    return { x: a.x + dx * f, z: a.z + dz * f, yaw, nx: Math.cos(yaw), nz: -Math.sin(yaw) };
  }
  function nearest(x, z) {
    let best = Infinity, result;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < best) { best = d; result = { distance: Math.sqrt(d), s: distances[i] + (distances[i + 1] - distances[i]) * t, x: px, z: pz }; }
    }
    return result;
  }
  function ribbon(width, color, y) {
    const verts = [], indices = [], uvs=[];
    for (let i = 0; i <= 360; i++) {
      const p = samples[i], prev = samples[(i + 359) % 360], next = samples[(i + 1) % 360];
      const dx = next.x - prev.x, dz = next.z - prev.z, n = Math.hypot(dx, dz);
      verts.push(p.x + dz / n * width / 2, y, p.z - dx / n * width / 2,
        p.x - dz / n * width / 2, y, p.z + dx / n * width / 2);
      uvs.push(0,distances[i]/8, width/8,distances[i]/8);
      if (i < 360) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices); geo.computeVertexNormals(); geometries.add(geo);
    const mesh = new THREE.Mesh(geo, width===25?surface.asphalt:drive?surface.concrete:surface.sand); mesh.receiveShadow = true; root.add(mesh);
  }
  box(root, 0, -3, 0, 1500, 6, 1500, drive ? 0x60685b : 0xb7875e).material=drive?surface.grass:surface.sand;
  ribbon(33, drive ? 0x949189 : 0xd6b08a, 0.03);
  ribbon(25, 0x37393b, 0.07);
  for (let s = 0; s < length; s += 10) {
    const p = at(s);
    const line = box(root, p.x, 0.1, p.z, 0.22, 0.04, 4.5, 0xe9dfa3); line.rotation.y = p.yaw;
    for (const side of [-1, 1]) {
      const kerb = box(root, p.x + p.nx * 12.6 * side, 0.17, p.z + p.nz * 12.6 * side, 0.8, 0.22, 6.5,
        drive ? 0xbab9ae : (Math.floor(s / 10) % 2 ? 0xa44e3d : 0xdad3c4));
      kerb.rotation.y = p.yaw;
      const edge=box(root,p.x+p.nx*11.5*side,.105,p.z+p.nz*11.5*side,.13,.022,9.7,0xd4d1bc);edge.rotation.y=p.yaw;
      if(!drive){
        const rail=box(root,p.x+p.nx*15.8*side,.91,p.z+p.nz*15.8*side,.18,.34,10.2,0x92918b);rail.rotation.y=p.yaw;
        const post=box(root,p.x+p.nx*15.8*side,.54,p.z+p.nz*15.8*side,.18,1.08,.2,0x737875);post.rotation.y=p.yaw;
      }
    }
  }
  const obstacles = [];
  if (drive) {
    // A readable road network surrounding the playable delivery circuit.
    for (const n of [-360, -240, -120, 0, 120, 240, 360]) {
      box(root, n, 0.015, 0, 18, 0.025, 900, 0x344651);
      box(root, 0, 0.018, n, 900, 0.025, 18, 0x344651);
    }
    const palette = [0x8e999a, 0xa6a197, 0xaaa498, 0x9a8d7a, 0x7a8788];
    for (let x = -420; x <= 420; x += 60) for (let z = -420; z <= 420; z += 60) {
      const px = x + 28, pz = z + 28;
      if (nearest(px, pz).distance < 48) continue;
      const w = 20 + random() * 13, d = 20 + random() * 13, h = 13 + random() * 65;
      box(root, px, 0.4, pz, w + 6, 0.7, d + 6, 0x70868c).material=surface.concrete;
      const building=box(root, px, h / 2 + 0.8, pz, w, h, d, palette[Math.floor(random() * palette.length)]);building.castShadow=true;building.userData.occluder=true;
      box(root, px, h + 1.1, pz, w + .7, .65, d + .7, 0x787e7d);
      box(root, px, h + 1.7, pz, w*.35, 1.8, d*.3, 0x747c7d);
      box(root, px+w*.27, h+1.5, pz-d*.2, 2.8, 1.4, 3.2, 0x505f60);
      for(const side of [-1,1]){
        box(root,px,2.5,pz+side*(d/2+.06),3.2,4.4,.16,0x314446);
        box(root,px,4.9,pz+side*(d/2+1),4.4,.22,2.2,0x696b65);
        for(let col=-w/2+3;col<w/2-1;col+=4.6)for(let y=7;y<h-1;y+=4.4)
          box(root,px+col,y,pz+side*(d/2+.035),2.1,2.6,.09,((Math.floor(col+y)%7===0)?0x879798:0x3b555d));
        for(let col=-d/2+3;col<d/2-1;col+=4.6)for(let y=7;y<h-1;y+=4.4)
          box(root,px+side*(w/2+.035),y,pz+col,.09,2.6,2.1,0x455c60);
      }
      if (Math.abs(px) < 270 && Math.abs(pz) < 270) obstacles.push({ x: px, z: pz, w: w / 2 + 2, d: d / 2 + 3 });
      if(Math.abs(px)<320&&Math.abs(pz)<320){
        cylinder(root,px+w/2+4,2.3,pz, .22,4.6,0x675b47);
        const crown=detail(root,unitSphere,mat(0x56694b),px+w/2+4,5.1,pz);crown.scale.set(2.3,2.8,2.3);
        box(root,px-w/2-2.5,.45,pz,1.7,.9,3.8,0x696b62);
      }
    }
    // Landmark: original circular communications tower in the city center.
    cylinder(root, 0, 38, 0, 6, 76, 0x779cab);
    cylinder(root, 0, 76, 0, 18, 5, 0xc4dce5);
    cylinder(root, 0, 84, 0, 10, 12, 0x51decf);
    cylinder(root, 0, 102, 0, 0.8, 25, 0xffc66c);
  } else {
    const rockPalette = [0xac593d, 0xc8774b, 0xe39b60, 0xb96044];
    for (let i = 0; i < 155; i++) {
      const angle = random() * Math.PI * 2, rad = 70 + random() * 500;
      const x = Math.cos(angle) * rad, z = Math.sin(angle) * rad;
      const w = 14 + random() * 42, h = 9 + random() * 66, d = 13 + random() * 40;
      if (nearest(x, z).distance < Math.max(w, d) * 0.57 + 29) continue;
      rock(root,x,0,z,w,h,d,i*.9).rotation.y=random()*.7;
      if(i%2===0)rock(root,x+w*.34,0,z-d*.25,w*.65,h*.27,d*.68,i+10);
    }
    for (let i = 0; i < 90; i++) {
      const p = at(i / 90 * length), side = i % 2 ? 1 : -1, offset = 23 + random() * 17;
      const x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
      cylinder(root, x, 1.8, z, .3, 3.6, 0x687451);
      const arm=cylinder(root,x+.62,2,z,.18,1.25,0x687451);arm.rotation.z=Math.PI/2;
      cylinder(root,x+1.18,2.45,z,.18,1,0x687451);
      for(let j=0;j<2;j++){const b=detail(root,unitSphere,mat(0x97866b),x+(j-.5)*2, .25,z+2);b.scale.set(.6,.4,.5);}
    }
    // Suspended sandstone arch over the far turn.
    const arch = at(length * 0.5), archGroup = new THREE.Group(); root.add(archGroup);
    archGroup.position.set(arch.x, 0, arch.z); archGroup.rotation.y = arch.yaw;
    const outline=new THREE.Shape();outline.moveTo(-30,0);outline.lineTo(-16,0);outline.lineTo(-16,13);outline.quadraticCurveTo(-14,25,0,25);outline.quadraticCurveTo(14,25,16,13);outline.lineTo(16,0);outline.lineTo(31,0);outline.lineTo(28,23);outline.lineTo(23,31);outline.lineTo(13,36);outline.lineTo(2,38);outline.lineTo(-12,35);outline.lineTo(-24,31);outline.closePath();
    const naturalArch=detail(archGroup,new THREE.ExtrudeGeometry(outline,{depth:12,bevelEnabled:true,bevelSize:1.4,bevelThickness:1.4,bevelSegments:2,steps:1,curveSegments:12}),sandstone(),0,0,-6);naturalArch.userData.occluder=true;cameraObstacles.push(naturalArch);
    rock(archGroup,-26,0,0,16,19,19,8);rock(archGroup,27,0,2,18,14,22,9);
  }
  for (let s = 20; s < length; s += 62) {
    const p = at(s), side = drive ? 1 : -1;
    cylinder(root, p.x + p.nx * 17 * side, 5, p.z + p.nz * 17 * side, 0.22, 10, drive ? 0x93bbc5 : 0x65737c);
    const arm=box(root,p.x+p.nx*16*side,9.9,p.z+p.nz*16*side,2.1,.13,.15,0x737d7d);arm.rotation.y=p.yaw;
    const light = box(root, p.x + p.nx * 15 * side, 10, p.z + p.nz * 15 * side, 4.2, 0.3, 1.1, 0xffe6a4, true); light.rotation.y = p.yaw;
  }
  function car(color, isPlayer = false) {
    const group=new THREE.Group();group.name=isPlayer?'player-coupe':'traffic-coupe';root.add(group);
    const chassis=new THREE.Group();group.add(chassis);
    const shell=paint(color), dark=mat(0x20272b), chrome=alloy;
    // Lofted cross-sections form a low coupe: tapered nose/tail and chamfered shoulders.
    const stations=[[-2.52,.91,.51,.92],[-2.13,1.08,.48,1.16],[-1.1,1.13,.47,1.24],[.88,1.1,.47,1.19],[1.92,1.02,.49,1.02],[2.5,.84,.53,.82]];
    const vertices=[],idx=[];
    stations.forEach(([z,w,b,t])=>{vertices.push(-w+.13,b,z,w-.13,b,z,w,b+.12,z,w,t-.15,z,w-.18,t,z,-w+.18,t,z,-w,t-.15,z,-w,b+.12,z);});
    for(let j=0;j<stations.length-1;j++)for(let k=0;k<8;k++){const q=j*8+k,r=j*8+(k+1)%8;idx.push(q,r,q+8,r,r+8,q+8);}
    idx.push(0,7,6,0,6,5,0,5,4,0,4,3,0,3,2,0,2,1);
    const n=(stations.length-1)*8;idx.push(n,n+1,n+2,n,n+2,n+3,n,n+3,n+4,n,n+4,n+5,n,n+5,n+6,n,n+6,n+7);
    const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hull.setIndex(idx);hull.computeVertexNormals();
    detail(chassis,hull,shell);
    function panel(points,material){const v=points.flat(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();const m=detail(chassis,g,material);m.material.side=THREE.DoubleSide;return m;}
    const roof=box(chassis,0,1.73,-.32,1.52,.11,1.47,color);roof.material=shell;
    panel([[-.83,1.23,1.05],[.83,1.23,1.05],[.72,1.71,.38],[-.72,1.71,.38]],glass);
    panel([[.88,1.23,-1.58],[-.88,1.23,-1.58],[-.74,1.7,-1.06],[.74,1.7,-1.06]],glass);
    for(const side of [-1,1]){
      panel([[side*.94,1.23,.89],[side*.81,1.7,.34],[side*.81,1.7,-1.02],[side*.98,1.23,-1.44]],glass);
      const pillar=box(chassis,side*.87,1.47,-.64,.085,.53,.12,color);pillar.material=shell;
      const handle=box(chassis,side*1.135,1.12,-.2,.026,.055,.23,0xadb4b4);handle.material=chrome;
      const sill=box(chassis,side*1.11,.57,0,.12,.17,3.45,0x20272b);sill.material=dark;
      const mirror=box(chassis,side*1.22,1.28,.65,.29,.16,.34,color);mirror.material=shell;
      box(chassis,side*.54,.69,2.48,.62,.18,.035,0x14191d);
      const headlight=box(chassis,side*.65,.95,2.21,.49,.12,.26,0xe3edeb,true);headlight.rotation.x=-.16;
      box(chassis,side*.68,1.02,-2.3,.53,.1,.12,0xb6382d,true);
      const exhaust=detail(chassis,new THREE.CylinderGeometry(.085,.085,.23,12),alloy,side*.69,.57,-2.53);exhaust.rotation.x=Math.PI/2;
      detail(chassis,new THREE.SphereGeometry(.1,10,6),dark,side*.69,.57,-2.65).scale.z=.2;
    }
    box(chassis,0,.7,2.5,.6,.21,.04,0x141a1e);
    box(chassis,0,.79,-2.52,.54,.15,.03,0xd7d7c4);
    const splitter=box(chassis,0,.53,2.31,1.8,.065,.37,0x20272b);splitter.material=dark;
    const lip=box(chassis,0,1.12,-2.14,1.78,.07,.26,color);lip.material=shell;
    // Separate steering knuckles and rotating wheel assemblies retain contact with the road.
    const wheels=[],front=[];
    for(const x of [-1.12,1.12])for(const z of [-1.51,1.51]){
      const steering=new THREE.Group();steering.position.set(x,.47,z);group.add(steering);
      const wheel=new THREE.Group();steering.add(wheel);wheels.push(wheel);if(z>0)front.push(steering);
      const tire=detail(wheel,new THREE.TorusGeometry(.35,.12,10,24),rubber);tire.rotation.y=Math.PI/2;tire.scale.z=1.25;
      const rim=detail(wheel,new THREE.CylinderGeometry(.28,.28,.25,20),alloy);rim.rotation.z=Math.PI/2;
      const inset=detail(wheel,new THREE.CylinderGeometry(.22,.22,.265,20),dark);inset.rotation.z=Math.PI/2;
      for(let k=0;k<5;k++){
        const spoke=box(wheel,Math.sign(x)*.148,Math.sin(k*Math.PI*2/5)*.13,Math.cos(k*Math.PI*2/5)*.13,.035,.05,.26,0xb8bfc2);spoke.material=alloy;spoke.rotation.x=-k*Math.PI*2/5;
      }
      const hub=detail(wheel,new THREE.CylinderGeometry(.065,.065,.31,12),alloy);hub.rotation.z=Math.PI/2;
      const caliper=box(steering,Math.sign(x)*.11,.07,-.23,.13,.18,.09,0xaa3d2c);caliper.material=paint(0xaa3d2c);
    }
    // Small track number replaces the old roof mascot without breaking a plausible silhouette.
    if(isPlayer){box(chassis,0,1.02,1.89,.52,.016,.33,0xe4e2cf);box(chassis,0,1.035,1.89,.06,.012,.2,0x263039);}
    group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return {group,chassis,wheels,front};
  }
  const playerMesh = car(drive ? 0xffc25e : 0x46d8c7, true);
  const bots = [0xff7266, 0x8e8ae8, 0x6bbbe9].map((color, index) => ({ ...car(color), index, s: 0, speed: 0, lane: 0 }));
  const checkpointCount = 12, gates = [];
  if (!drive) for (let i = 0; i < checkpointCount; i++) {
    const p = at(i / checkpointCount * length), gate = new THREE.Group(); root.add(gate);
    gate.position.set(p.x, 0, p.z); gate.rotation.y = p.yaw;
    box(gate, -14, 2.6, 0, 0.14, 5.2, 0.14, 0xb9bcb3);
    box(gate, 14, 2.6, 0, 0.14, 5.2, 0.14, 0xb9bcb3);
    const banner = box(gate, -13.25, 4.1, 0, 1.4, 2.0, 0.06, i === 0 ? 0xffd067 : 0x68838a);
    box(gate,13.25,4.1,0,1.4,2,.06,0xbccdc2);
    if(i===0)for(let j=0;j<12;j++)box(gate,-11+j*2,.105,0,1.95,.035,1.5,j%2?0x353b3b:0xd8d8cf);
    gates.push({ p, banner });
  }
  const pickups = [];
  if (drive) for (let i = 1; i <= 18; i++) {
    const p = at(i / 20 * length), group = new THREE.Group(); root.add(group); group.position.set(p.x, 1.35, p.z);
    detail(group,new THREE.CylinderGeometry(.58,.58,1.55,24),paint(0x529684));
    detail(group,new THREE.CylinderGeometry(.58,.58,.13,24),alloy,0,.8,0);
    detail(group,new THREE.CylinderGeometry(.58,.58,.13,24),alloy,0,-.8,0);
    detail(group,new THREE.CylinderGeometry(.19,.19,.17,20),alloy,0,.94,0);
    box(group,0,.06,.575,.15,.66,.025,0xe5e7d1);
    box(group,0,.06,.59,.4,.13,.026,0xe5e7d1);
    const ring=detail(root,new THREE.TorusGeometry(1.45,.035,6,32),mat(0x779b83),p.x,.12,p.z);ring.rotation.x=Math.PI/2;
    pickups.push({ p, group, collected: false });
  }
  const home = at(0), finishPad = new THREE.Group(); root.add(finishPad); finishPad.position.set(home.x, 0, home.z); finishPad.rotation.y = home.yaw;
  if (drive) {
    box(finishPad, 0, 0.17, 0, 21, 0.2, 16, 0x37a88d);
    for (const x of [-13, 13]) { box(finishPad, x, 4, 0, 0.8, 8, 0.8, 0xafffe2, true); }
    box(finishPad, -11.8, 6.4, 0, 1.6, 2.8, .08, 0x76f6cd, true);
  }
  batchStatic();
  let state, lastRoad;
  function event(type, detail = {}) {
    state.events.push({ t: Number(state.elapsed.toFixed(3)), type, ...detail });
    if (state.events.length > 80) state.events.shift();
  }
  function reset(newSeed = seed) {
    seed = newSeed; random = randomGenerator(seed);
    const p = at(0);
    state = { x: p.x, z: p.z, yaw: p.yaw, speed: 0, elapsed: 0, status: 'playing', boost: 1, health: 100,
      nextCheckpoint: 1, checkpoints: 0, lap: 0, cells: 0, cooldown: 0, distance: 0, collisions: 0,
      boostActive: false, steer:0, bodyRoll:0, bodyPitch:0, message: drive ? 'Collect 12 charge cells, then return to the green depot.' : 'Follow the glowing checkpoint flags. Complete one clean circuit.', events: [] };
    bots.forEach((b, i) => { b.s = drive ? length * (0.16 + i * 0.25) : 10 + i * 9; b.speed = drive ? 17 + i * 2 : 20 + i * 1.2; b.lane = (i%2===0?-1:1)*4.8; });
    pickups.forEach(pickup => { pickup.collected = false; pickup.group.visible = true; });
    gates.forEach((g, i) => g.banner.material = mat(i === 0 ? 0xffd067 : (i === 1 ? 0x65f3c8 : 0x68838a), i === 1));
    lastRoad = nearest(state.x, state.z); event('start', { seed, mode: drive ? 'drive' : 'race' }); syncMeshes();
  }
  function syncMeshes() {
    playerMesh.group.position.set(state.x, 0.07, state.z); playerMesh.group.rotation.y = state.yaw;
    playerMesh.chassis.rotation.z=state.bodyRoll;playerMesh.chassis.rotation.x=state.bodyPitch;
    playerMesh.front.forEach(w=>w.rotation.y=state.steer*.36);playerMesh.wheels.forEach(w=>w.rotation.x=state.distance/.47);
    for (const b of bots) { const p = at(b.s); b.group.position.set(p.x + p.nx * b.lane, 0.07, p.z + p.nz * b.lane); b.group.rotation.y = p.yaw;b.wheels.forEach(w=>w.rotation.x=b.s/.47);b.front.forEach(w=>w.rotation.y=wrap(at(b.s+3).yaw-p.yaw)*1.4); }
    pickups.forEach((p, i) => { p.group.rotation.y = state.elapsed * .65; p.group.position.y = 1.35 + Math.sin(state.elapsed * 1.5 + i) * .12; });
  }
  function step(dt, input = {}, auto = false) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    if (state.status !== 'playing') {
      // The result locks the challenge clock, not the car's physical presentation.
      // Integrate a short braking run rather than freezing a 120 km/h vehicle.
      state.boostActive=false;
      const previousPose={x:state.x,z:state.z,yaw:state.yaw};
      const previousSpeed=state.speed;
      state.speed=Math.sign(previousSpeed)*Math.max(0,Math.abs(previousSpeed)-14*dt);
      // Keep the braking trajectory on the road as the course bends. A frozen
      // heading previously cut into the adjacent traffic lane after the finish.
      const target=at(lastRoad.s+10+Math.max(state.speed,0)*.35);
      const recoverySteer=clamp(wrap(Math.atan2(target.x-state.x,target.z-state.z)-state.yaw)*2.5,-1,1);
      const response=1-Math.exp(-8*dt);
      state.steer+=(recoverySteer-state.steer)*response;
      state.yaw=wrap(state.yaw+state.steer*1.4*Math.min(Math.abs(state.speed)/12,1)*Math.sign(state.speed)*dt);
      const travel=(previousSpeed+state.speed)*.5*dt;
      const proposed={x:state.x+Math.sin(state.yaw)*travel,z:state.z+Math.cos(state.yaw)*travel,yaw:state.yaw};
      const botPose=(b,s)=>{const p=at(s);return{x:p.x+p.nx*b.lane,z:p.z+p.nz*b.lane,yaw:p.yaw};};
      const predictedTraffic=bots.map(b=>({bot:b,previous:botPose(b,b.s),next:botPose(b,b.s+b.speed*dt)}));
      // Check intermediate footprints as well as endpoints. Unexpected traffic
      // yields at contact instead of overlapping during the noninteractive outro.
      const interpolate=(a,b,f)=>({x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,yaw:a.yaw+wrap(b.yaw-a.yaw)*f});
      const blocked=predictedTraffic.some(b=>[.25,.5,.75,1].some(f=>vehicleFootprintsOverlap(interpolate(previousPose,proposed,f),interpolate(b.previous,b.next,f))));
      if(blocked){state.speed=0;state.yaw=previousPose.yaw;}
      else{state.x=proposed.x;state.z=proposed.z;state.distance+=Math.abs(travel);}
      if(state.speed===0)state.steer+=(0-state.steer)*response;
      state.bodyRoll+=(-state.steer*Math.min(Math.abs(state.speed)/33,1)*.035-state.bodyRoll)*response;
      state.bodyPitch+=((Math.abs(state.speed)>.1?-.018:0)-state.bodyPitch)*response;
      lastRoad=nearest(state.x,state.z);
      for(const b of predictedTraffic){
        const playerEnd={x:state.x,z:state.z,yaw:state.yaw};
        const trafficBlocked=[.25,.5,.75,1].some(f=>vehicleFootprintsOverlap(interpolate(previousPose,playerEnd,f),interpolate(b.previous,b.next,f)));
        if(!trafficBlocked)b.bot.s+=b.bot.speed*dt;
      }
      syncMeshes();return;
    }
    state.elapsed += dt; state.cooldown = Math.max(0, state.cooldown - dt);
    lastRoad = nearest(state.x, state.z);
    let steer = Number(!!input.right) - Number(!!input.left), throttle = input.up ? 1 : 0, brake = !!input.down, boost = !!input.action;
    if (auto) {
      const target = at(lastRoad.s + 12 + Math.max(0, state.speed) * 0.55);
      const error = wrap(Math.atan2(target.x - state.x, target.z - state.z) - state.yaw);
      steer = clamp(error * 2.5, -1, 1); throttle = 1;
      brake = Math.abs(error) > 0.65 && state.speed > 14;
      boost = Math.abs(error) < 0.11 && state.boost > 0.4 && state.speed > 22;
    }
    state.boostActive = boost && state.boost > 0.02 && state.speed > 2 && throttle > 0 && !brake;
    state.boost = clamp(state.boost + (state.boostActive ? -0.24 : 0.105) * dt, 0, 1);
    const maxSpeed = state.boostActive ? 43 : drive ? 31 : 33;
    const acceleration = throttle * (state.boostActive ? 20 : 12) - (brake ? 28 : 0) - state.speed * (throttle ? 0.16 : 0.48);
    const response=1-Math.exp(-8*dt);state.steer+=(steer-state.steer)*response;state.bodyRoll+=(-steer*Math.min(state.speed/33,1)*.035-state.bodyRoll)*response;state.bodyPitch+=(clamp(acceleration,-20,20)*.0014-state.bodyPitch)*response;
    state.speed = clamp(state.speed + acceleration * dt, brake && !throttle ? -7 : 0, maxSpeed);
    if (lastRoad.distance > 14) state.speed *= Math.exp(-1.5 * dt);
    state.yaw = wrap(state.yaw + steer * 1.4 * Math.min(Math.abs(state.speed) / 12, 1) * Math.sign(state.speed) * dt);
    const beforeX = state.x, beforeZ = state.z;
    state.x += Math.sin(state.yaw) * state.speed * dt; state.z += Math.cos(state.yaw) * state.speed * dt;
    state.distance += Math.abs(state.speed * dt);
    for (const b of bots) {
      b.s += b.speed * dt;
      const p = at(b.s), bx = p.x + p.nx * b.lane, bz = p.z + p.nz * b.lane;
      const relativeX=state.x-bx,relativeZ=state.z-bz;
      const separationAcross=Math.abs(relativeX*Math.cos(p.yaw)-relativeZ*Math.sin(p.yaw)),separationAlong=Math.abs(relativeX*Math.sin(p.yaw)+relativeZ*Math.cos(p.yaw));
      if (separationAcross<2.25&&separationAlong<4.8&&state.cooldown<=0) {
        state.speed = Math.max(0,Math.min(state.speed,b.speed)*.8); state.health = Math.max(0, state.health - 14); state.cooldown = 1.4; state.collisions++;
        state.message = 'Traffic bump! Recover your line.'; event('collision', { actor: b.index });
      }
    }
    for (const o of obstacles) if (Math.abs(state.x - o.x) < o.w && Math.abs(state.z - o.z) < o.d) {
      state.x = beforeX; state.z = beforeZ; state.speed = -2;
      if (state.cooldown <= 0) { state.health = Math.max(0, state.health - 12); state.cooldown = 1.4; state.collisions++; event('collision', { actor: 'building' }); }
      break;
    }
    if (Math.hypot(state.x, state.z) > 660) { state.x = beforeX; state.z = beforeZ; state.speed = 0; state.message = 'World boundary. Turn back toward the course.'; }
    if (drive) {
      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (!pickup.collected && Math.hypot(state.x - pickup.p.x, state.z - pickup.p.z) < 7) {
          pickup.collected = true; pickup.group.visible = false; state.cells++; state.boost = Math.min(1, state.boost + 0.15);
          state.message = state.cells >= 12 ? 'Cargo ready! Complete the circuit and return to the green depot.' : `Charge cell ${state.cells}/12 secured.`;
          event('pickup', { index: i, cells: state.cells });
        }
      }
      if (state.cells >= 12 && state.elapsed > 12 && Math.hypot(state.x - home.x, state.z - home.z) < 14) {
        state.status = 'won'; state.message = 'Delivery complete! The city is charged.'; event('finish', { cells: state.cells });
      }
    } else {
      const gate = gates[state.nextCheckpoint];
      if (Math.hypot(state.x - gate.p.x, state.z - gate.p.z) < 17) {
        const passed = state.nextCheckpoint; gate.banner.material = mat(0x65afba);
        state.checkpoints++; state.nextCheckpoint = (passed + 1) % checkpointCount;
        event('checkpoint', { index: passed, completed: state.checkpoints });
        if (state.checkpoints >= checkpointCount) {
          state.lap = 1; state.status = 'won'; state.message = 'Circuit complete! A clean route through the canyon.'; event('finish', { lap: 1 });
        } else {
          gates[state.nextCheckpoint].banner.material = mat(0x65f3c8, true);
          state.message = `${state.checkpoints}/${checkpointCount} gates cleared. Next gate glows mint.`;
        }
      }
    }
    if (state.status === 'playing' && (state.elapsed >= (drive ? 115 : 105) || state.health <= 0)) {
      state.status = 'lost'; state.message = state.health <= 0 ? 'Vehicle needs repairs. Reset for another run.' : 'Time expired. Reset and try a tighter line.'; event('failed', { reason: state.health <= 0 ? 'damage' : 'time' });
    }
    syncMeshes();
  }
  function cameraPose(view = 'chase') {
    const dx = Math.sin(state.yaw), dz = Math.cos(state.yaw);
    if (view === 'top') return { position: [state.x + 0.1, 130, state.z - 0.1], target: [state.x, 0, state.z] };
    if (view === 'wide') return { position: [state.x - dx * 23 + dz * 9, 17, state.z - dz * 23 - dx * 9], target: [state.x + dx * 4, 1.0, state.z + dz * 4] };
    return { position: [state.x - dx * 13, 6.4, state.z - dz * 13], target: [state.x + dx * 4.5, 1.0, state.z + dz * 4.5] };
  }
  function hud() {
    const limit = drive ? 115 : 105;
    const clock=state.status==='won'?`Finished ${state.elapsed.toFixed(2)}s`:state.status==='lost'?`Run time ${state.elapsed.toFixed(2)}s`:`${Math.max(0,Math.ceil(limit-state.elapsed))}s left`;
    return { title: drive ? 'Highway Rush' : 'Canyon Circuit',
      objective: drive ? 'Collect 12 charge cells · return to the green depot' : 'Clear 12 ordered gates · complete the canyon circuit',
      primary: drive ? `${Math.min(state.cells,12)}/12 cells${state.cells>12?` +${state.cells-12} bonus`:''} · ${Math.round(Math.abs(state.speed) * 3.6)} km/h` : `${state.checkpoints}/12 gates · ${Math.round(Math.abs(state.speed) * 3.6)} km/h`,
      secondary: `${clock} · Armor ${Math.round(state.health)}% · Boost ${Math.round(state.boost * 100)}%`,
      progress: state.status === 'won' ? 1 : drive ? Math.min(0.9, state.cells / 12 * 0.85) : state.checkpoints / checkpointCount,
      status: state.status, message: state.message };
  }
  function snapshot() {
    return { mode: drive ? 'drive' : 'race', seed, elapsed: state.elapsed, status: state.status,
      position: [state.x, 0.07, state.z], yaw: state.yaw, speed: state.speed, health: state.health, boost: state.boost,
      checkpoints: state.checkpoints, nextCheckpoint: state.nextCheckpoint, lap: state.lap, cells: state.cells,
      collisions: state.collisions, distance: state.distance, worldBounds: [-750, 750, -750, 750],
      routeLength: length, roadDistance: lastRoad.distance, events: state.events.map(e => ({ ...e })) };
  }
  function dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());surface.dispose(); }
  reset(seed);
  return { root, step, cameraPose, hud, snapshot, reset, dispose, get hero(){return playerMesh.group;},get cameraObstacles(){return cameraObstacles;} };
}

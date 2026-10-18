/** Original, deterministic arcade survival. No network or external art assets. */
export function createSurvival({ THREE, scene, seed = 7241, variant = 'survival3d' }) {
  const flat = variant === 'survival2d';
  const root = new THREE.Group();
  root.name = `survival-${flat ? 'flat' : 'grove'}`;
  scene.add(root);
  const WORLD = 178, PLAYER_RADIUS = 2.6, SPEED = 27, TOTAL_BOTS = 12;
  const WAVE_TIMES = [0, 14, 28, 42];
  let rng, elapsed, state, health, score, wave, fireClock, hitClock, signalCount;
  let player, playerMesh, ring, aimHalo, bullets, bots, pickups, cover, events, effects;
  let resources = [], materials, goals, hitsTaken, shotsFired, movesBlocked;
  let geometryCache = new Map(), blockers = [], heroStride = 0, visualElapsed = 0;
  let sceneryFades = new Map();
  const visibilityRay = new THREE.Raycaster();
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const safeRadius = () => Math.max(31, 160 - elapsed * 1.7);
  const log = (type, detail = {}) => events.push({ time: +elapsed.toFixed(3), type, ...detail });
  function randomGenerator(value) {
    let x = typeof value === 'number' ? value >>> 0 : Array.from(String(value)).reduce((s, c) => Math.imul(s ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
    return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function geometry(g) { resources.push(g); return g; }
  function cachedGeometry(key, make) {
    if (!geometryCache.has(key)) geometryCache.set(key, geometry(make()));
    return geometryCache.get(key);
  }
  function grainTexture(base, scale = 1, kind = 'soil') {
    const size = 128, pixels = new Uint8Array(size * size * 4), c = new THREE.Color(base);
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const h = Math.sin(x*127.1+y*311.7)*43758.5453;
      const noise = (h-Math.floor(h)-.5)*.14;
      const grain = kind==='wood' ? Math.sin(y*.31+Math.sin(x*.045)*2)*.09 : Math.sin(x*.37+y*.51)*.022;
      const seam = kind==='wood' && y%32<2 ? -.19 : 0;
      const i=(y*size+x)*4;
      pixels[i]=Math.round(clamp(c.r+noise+grain+seam,0,1)*255);
      pixels[i+1]=Math.round(clamp(c.g+noise+grain+seam,0,1)*255);
      pixels[i+2]=Math.round(clamp(c.b+noise+grain+seam,0,1)*255);pixels[i+3]=255;
    }
    const texture = new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(scale,scale);
    texture.colorSpace=THREE.LinearSRGBColorSpace;texture.needsUpdate=true;resources.push(texture);return texture;
  }
  function ellipsoid(xr,yr,zr,mat,x,y,z,group=root) {
    const m=mesh(cachedGeometry('sphere',()=>new THREE.SphereGeometry(1,12,8)),mat,x,y,z,group);
    m.scale.set(xr,yr,zr);return m;
  }
  function beam(a,b,r,mat,group=root) {
    const length=new THREE.Vector3().subVectors(b,a).length();
    const obj=mesh(cachedGeometry('rod',()=>new THREE.CylinderGeometry(1,1,1,6)),mat,0,0,0,group);
    obj.position.copy(a).add(b).multiplyScalar(.5);obj.scale.set(r,length,r);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3().subVectors(b,a).normalize());return obj;
  }
  function contactShadow(radius,group=root) {
    const disk=mesh(cachedGeometry('contact',()=>new THREE.CircleGeometry(1,24)),materials.shadow,0,.065,0,group);
    disk.rotation.x=-Math.PI/2;disk.scale.set(radius,radius,1);disk.castShadow=false;disk.receiveShadow=false;return disk;
  }
  function material(color, extras = {}) {
    const m = flat ? new THREE.MeshBasicMaterial({ color, ...extras }) : new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: .06, ...extras });
    resources.push(m); return m;
  }
  function mesh(g, m, x, y, z, group = root) {
    const object = new THREE.Mesh(g, m); object.position.set(x, y, z);
    object.castShadow = !flat; object.receiveShadow = !flat;
    group.add(object); return object;
  }
  function box(w, h, d, color, x, y, z, group = root) {
    return mesh(cachedGeometry(`box-${w}-${h}-${d}`,()=>new THREE.BoxGeometry(w, h, d)), color, x, y, z, group);
  }
  function cylinder(r, h, color, x, y, z, sides = 12, group = root) {
    return mesh(cachedGeometry(`cylinder-${r}-${h}-${sides}`,()=>new THREE.CylinderGeometry(r, r, h, sides)), color, x, y, z, group);
  }
  function torus(r, tube, color, group = root) {
    const object = mesh(cachedGeometry(`torus-${r}-${tube}`,()=>new THREE.TorusGeometry(r, tube, 6, r>10?96:32)), color, 0, .4, 0, group);
    object.rotation.x = Math.PI / 2; return object;
  }
  function disposeResources() { for (const resource of resources) resource.dispose(); resources = []; geometryCache = new Map(); sceneryFades = new Map(); root.clear(); }
  function clearAt(x, z, radius = PLAYER_RADIUS) {
    if (Math.abs(x) > WORLD - radius || Math.abs(z) > WORLD - radius) return false;
    return !cover.some(c => Math.hypot(x - c.x, z - c.z) < radius + c.radius);
  }
  function rayClear(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    if (!length2) return true;
    return !cover.some(c => {
      const t = clamp(((c.x - a.x) * dx + (c.z - a.z) * dz) / length2, 0, 1);
      return Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z) < c.radius + .55;
    });
  }
  function move(actor, dx, dz, dt, radius = PLAYER_RADIUS) {
    const nx = actor.x + dx * dt, nz = actor.z + dz * dt;
    let moved = false;
    if (clearAt(nx, actor.z, radius)) { actor.x = nx; moved = true; }
    if (clearAt(actor.x, nz, radius)) { actor.z = nz; moved = true; }
    if (!moved && Math.hypot(dx, dz) > .1) movesBlocked++;
    return moved;
  }
  function steer(actor, target, dt, speed, radius = PLAYER_RADIUS) {
    const angle = Math.atan2(target.z - actor.z, target.x - actor.x);
    const probe = radius + 5;
    // Briefly hold an avoidance heading instead of switching sides each tick.
    if (actor.avoidUntil > elapsed) {
      const dx = Math.cos(actor.avoidHeading), dz = Math.sin(actor.avoidHeading);
      if (clearAt(actor.x + dx * probe, actor.z + dz * probe, radius)) { move(actor, dx * speed, dz * speed, dt, radius); return; }
    }
    for (const offset of [0, .5, -.5, 1, -1, 1.5, -1.5, 2.2, -2.2, Math.PI]) {
      const a = angle + offset, dx = Math.cos(a), dz = Math.sin(a);
      if (clearAt(actor.x + dx * probe, actor.z + dz * probe, radius)) {
        if (offset) { actor.avoidHeading = a; actor.avoidUntil = elapsed + .35; }
        move(actor, dx * speed, dz * speed, dt, radius); return;
      }
    }
  }
  function cat() {
    const group=new THREE.Group();group.name='expedition-cat';root.add(group);
    contactShadow(2.8,group);
    const body=new THREE.Group();body.position.y=3;group.add(body);
    ellipsoid(1.72,1.85,1.1,materials.jacket,0,.6,0,body);
    ellipsoid(1.17,1.7,.77,materials.cream,0,.55,-.55,body);
    const backpack=box(2.3,2.65,.9,materials.bag,0,.7,1.15,body);
    box(1.65,.85,.34,materials.leather,0,.15,1.78,body);
    for(const x of [-1.1,1.1])box(.27,2.65,.19,materials.leather,x,.7,-.95,body);
    box(2.8,.28,2.1,materials.leather,0,-.85,0,body);
    const head=new THREE.Group();head.position.set(0,2.65,-.08);body.add(head);
    ellipsoid(1.8,1.55,1.4,materials.cat,0,0,0,head);
    for(const x of [-1.12,1.12]) {
      const ear=mesh(cachedGeometry('cat-ear',()=>new THREE.ConeGeometry(.83,1.95,3)),materials.cat,x,1.24,-.1,head);
      ear.rotation.z=x<0?.2:-.2;
      const inside=mesh(cachedGeometry('cat-inner-ear',()=>new THREE.ConeGeometry(.46,1.22,3)),materials.innerEar,x,1.3,-.39,head);inside.rotation.z=ear.rotation.z;
      ellipsoid(.63,.53,.43,materials.cream,x*.45,-.43,-1.14,head);
      ellipsoid(.48,.57,.25,materials.white,x*.66,.12,-1.17,head);
      ellipsoid(.22,.33,.15,materials.eye,x*.66,.13,-1.38,head);
      ellipsoid(.07,.1,.06,materials.white,x*.66-.08,.26,-1.51,head);
      const brow=box(.75,.15,.18,materials.stripe,x*.66,.77,-1.15,head);brow.rotation.z=x<0?-.1:.1;
      for(let i=0;i<2;i++) {
        const whisker=beam(new THREE.Vector3(x*.62,-.48-i*.15,-1.46),new THREE.Vector3(x*1.65,-.34-i*.35,-1.28),.025,materials.cream,head);
        whisker.castShadow=false;
      }
    }
    ellipsoid(.24,.19,.2,materials.nose,0,-.35,-1.57,head);
    box(.09,.25,.09,materials.dark,0,-.59,-1.51,head);
    for(const x of [-.65,0,.65]) {const stripe=box(.22,.58,.16,materials.stripe,x,1.05,-.86,head);stripe.rotation.z=x*.3;}
    const legs=[],arms=[];
    for(const sign of [-1,1]) {
      const leg=new THREE.Group();leg.position.set(sign*.82,1.84,0);group.add(leg);
      ellipsoid(.66,.93,.68,materials.jacket,0,-.64,0,leg);
      ellipsoid(.66,.55,.73,materials.cat,0,-1.11,-.02,leg);
      ellipsoid(.72,.33,1.02,materials.boot,0,-1.48,-.27,leg).name='boot';legs.push(leg);
      const arm=new THREE.Group();arm.position.set(sign*1.55,.95,0);body.add(arm);
      ellipsoid(.54,1.1,.58,materials.jacket,0,-.58,0,arm);
      ellipsoid(.56,.5,.55,materials.cat,0,-1.38,0,arm);arms.push(arm);
    }
    // A curved raised tail, never a rigid plank or a ground-intersecting appendage.
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,2,1),new THREE.Vector3(0,2.15,2.25),new THREE.Vector3(.35,3,3.05),new THREE.Vector3(.5,4,2.8)]);
    const tail=mesh(geometry(new THREE.TubeGeometry(curve,12,.34,6,false)),materials.cat,0,0,0,group);
    if(flat) {
      const backing=torus(3.4,.31,materials.dark,group);backing.position.y=.10;
      const shape=new THREE.Shape();shape.moveTo(-1.45,0);shape.lineTo(0,2.25);shape.lineTo(1.45,0);shape.lineTo(0,.55);shape.closePath();
      const arrowGeometry=geometry(new THREE.ShapeGeometry(shape));
      const outline=mesh(arrowGeometry,materials.dark,0,.14,-3.65,group);outline.rotation.x=-Math.PI/2;outline.castShadow=false;
      const arrow=mesh(arrowGeometry,materials.glow,0,.17,-3.92,group);arrow.rotation.x=-Math.PI/2;arrow.scale.set(.68,.68,.68);arrow.castShadow=false;
    }
    const marker=torus(3.4,.12,materials.glow,group);marker.position.y=.15;
    Object.assign(group.userData,{tail,body,head,legs,arms});return group;
  }
  function sentinel() {
    const group=new THREE.Group();group.name='survey-sentinel';root.add(group);
    const shadow=contactShadow(3.4,group),rig=new THREE.Group();group.add(rig);
    ellipsoid(1.8,1.15,1.7,materials.bot,0,3.4,0,rig);
    box(2.7,.66,1.4,materials.dark,0,3.43,-1.14,rig);
    ellipsoid(.64,.55,.36,materials.botLens,0,3.5,-1.85,rig);
    ellipsoid(.16,.2,.1,materials.white,-.22,3.67,-2.18,rig);
    cylinder(.75,.23,materials.metal,0,4.52,0,12,rig);
    const rotors=[];
    for(const [x,z] of [[-2.55,-1.85],[2.55,-1.85],[-2.55,1.85],[2.55,1.85]]) {
      beam(new THREE.Vector3(x*.3,3.7,z*.3),new THREE.Vector3(x,3.7,z),.19,materials.metal,rig);
      cylinder(.28,.5,materials.dark,x,3.89,z,8,rig);
      const prop=box(2.7,.055,.28,materials.prop,x,4.23,z,rig);rotors.push(prop);
      const guard=torus(1.55,.075,materials.metal,rig);guard.position.set(x,4.1,z);
    }
    for(const x of [-1.45,1.45]) {
      beam(new THREE.Vector3(x,2.9,-.3),new THREE.Vector3(x,2.1,.2),.11,materials.metal,rig);
      box(.18,.16,2.3,materials.rubber,x,2.08,.2,rig);
    }
    const bar=box(4.2,.15,.38,materials.heal,0,6,0,group);
    group.userData={rig,rotors,shadow};return {group,bar};
  }
  function roofMesh(w,d,eave,ridge,mat,group) {
    const x=w/2,z=d/2,verts=[-x,eave,-z,x,eave,-z,0,ridge,-z, -x,eave,z,0,ridge,z,x,eave,z, -x,eave,-z,0,ridge,-z,0,ridge,z, -x,eave,-z,0,ridge,z,-x,eave,z, x,eave,-z,x,eave,z,0,ridge,z, x,eave,-z,0,ridge,z,0,ridge,-z];
    // Outside-facing winding: both roof slopes must face upward, not disappear by backface culling.
    for(let i=0;i<verts.length;i+=9)for(let c=0;c<3;c++){const v=verts[i+3+c];verts[i+3+c]=verts[i+6+c];verts[i+6+c]=v;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(verts.flatMap((v,i)=>i%3===0?[v/w,verts[i+2]/d]:[]),2));g.computeVertexNormals();
    const roof=mesh(geometry(g),mat,0,0,0,group);roof.name='pitched-roof';return roof;
  }
  function buildEnvironment() {
    box(368,.5,368,materials.ground,0,-.3,0).name='textured-meadow';
    box(350,.12,16,materials.path,0,.02,0);
    box(16,.13,350,materials.path,0,.03,0);
    torus(52,.18,materials.path);
    // Seeded incidental detail has its own PRNG; art changes never perturb bot behaviour.
    const detailRng=randomGenerator(`${seed}-survival-art-v2`);
    for(const [x,z,rotation] of [[-74,-64,0],[73,-67,.3],[-74,65,-.15],[73,68,.15]]) {
      const group=new THREE.Group();group.name='timber-outpost';group.position.set(x,0,z);group.rotation.y=rotation;root.add(group);
      box(21,.65,18,materials.stone,0,.32,0,group);
      const walls=box(18,9.4,15,materials.wall,0,5.1,0,group);blockers.push(walls);
      const roof=roofMesh(22,19,10,14.1,materials.roof,group);blockers.push(roof);
      box(.5,.55,20,materials.roofTrim,0,14.1,0,group);
      for(const sx of [-9,9])for(const sz of [-7.5,7.5])box(.45,9.7,.5,materials.leather,sx,5.1,sz,group);
      box(4.9,6,.4,materials.leather,0,3.5,7.68,group);
      box(3.8,5.4,.26,materials.door,0,3.25,7.95,group);
      cylinder(.15,.25,materials.gold,1.22,3.4,8.13,8,group).rotation.x=Math.PI/2;
      box(5.8,.4,2.7,materials.stone,0,.32,8.1,group);
      for(const wx of [-5.7,5.7]) {
        box(3.75,3.45,.45,materials.cream,wx,6.3,7.68,group);
        box(3.1,2.8,.25,materials.window,wx,6.3,7.99,group);
        box(.17,2.8,.13,materials.leather,wx,6.3,8.15,group);
        box(3.1,.17,.13,materials.leather,wx,6.3,8.15,group);
        box(4,.23,1.1,materials.leather,wx,4.63,7.93,group);
      }
      box(2.3,5,2.3,materials.stone,5.2,12,-3,group);
      box(2.8,.5,2.8,materials.dark,5.2,14.75,-3,group);
      cover.push({x,z,radius:14,type:'building'});
    }
    const trunkGeometry=cachedGeometry('tree-trunk',()=>new THREE.CylinderGeometry(.75,1.25,9.6,7));
    const crownGeometry=cachedGeometry('tree-crown',()=>new THREE.IcosahedronGeometry(1,1));
    for(let i=0;i<64;i++) {
      const a=rng()*Math.PI*2,r=i<44?105+rng()*65:32+rng()*105;
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.abs(x)<15||Math.abs(z)<15||!clearAt(x,z,11))continue;
      const trunk=mesh(trunkGeometry,materials.trunk,x,4.8,z);blockers.push(trunk);
      for(let j=0;j<3;j++) {
        const angle=j*2.094+i*.76,xx=x+Math.cos(angle)*2.1,zz=z+Math.sin(angle)*2.1;
        beam(new THREE.Vector3(x,5.8,z),new THREE.Vector3(xx,9.7,zz),.27,materials.trunk);
        const crown=mesh(crownGeometry,j===2?materials.leafLight:materials.leaf,xx,11.4+(j===2?2.2:0),zz);
        crown.scale.set(3.5+(i%3)*.3,3.7,3.6);crown.rotation.y=i;blockers.push(crown);
      }
      cover.push({x,z,radius:2.5,type:'tree'});
    }
    for(const [x,z] of [[-29,-22],[26,26],[-34,29],[33,-29],[-110,21],[109,-22],[20,109],[-20,-110]]) {
      const group=new THREE.Group();group.position.set(x,0,z);root.add(group);
      const crate=box(7,5,7,materials.crate,0,2.5,0,group);blockers.push(crate);
      for(const xx of [-3.5,3.5])for(const zz of [-3.5,3.5])box(.35,5.2,.35,materials.leather,xx,2.6,zz,group);
      for(const yy of [.5,4.6]) {
        box(7.3,.36,7.3,materials.crateBand,0,yy,0,group);
      }
      for(const zz of [-3.54,3.54]) {const brace=box(.3,6.3,.14,materials.leather,0,2.5,zz,group);brace.rotation.z=Math.PI/4;}
      cover.push({x,z,radius:5,type:'crate'});
    }
    // Hundreds of stones and grass tufts are instances, keeping large-area detail affordable.
    const pebbleGeo=cachedGeometry('pebble',()=>new THREE.IcosahedronGeometry(1,0));
    const stones=new THREE.InstancedMesh(pebbleGeo,materials.stone,220);
    const grassGeo=cachedGeometry('grass-tuft',()=>new THREE.ConeGeometry(.7,1.8,4));
    const grasses=new THREE.InstancedMesh(grassGeo,materials.grassDetail,340);
    const transform=new THREE.Object3D();
    for(let i=0;i<220;i++) {
      const along=(detailRng()-.5)*340,side=(detailRng()<.5?-1:1)*(8+detailRng()*1.8);
      transform.position.set(i%2?along:side,.1,i%2?side:along);
      transform.scale.set(.3+detailRng()*.65,.18+detailRng()*.4,.3+detailRng()*.6);transform.rotation.y=detailRng()*6.28;transform.updateMatrix();stones.setMatrixAt(i,transform.matrix);
    }
    for(let i=0;i<340;i++) {
      let x=(detailRng()-.5)*348,z=(detailRng()-.5)*348;
      if(Math.abs(x)<10)x+=Math.sign(x||1)*14;if(Math.abs(z)<10)z+=Math.sign(z||1)*14;
      transform.position.set(x,.4,z);const scale=.5+detailRng()*.9;transform.scale.setScalar(scale);transform.rotation.y=detailRng()*6.28;transform.updateMatrix();grasses.setMatrixAt(i,transform.matrix);
    }
    stones.receiveShadow=true;grasses.receiveShadow=true;root.add(stones,grasses);
    for(let i=-160;i<=160;i+=40)for(const [x,z] of [[i,-178],[i,178],[-178,i],[178,i]]) {
      cylinder(.75,5.5,materials.metal,x,2.75,z,8);
      cylinder(1.1,.7,materials.glow,x,5.7,z,8);
    }
    ring=torus(1,.006,materials.ring);ring.position.y=.22;
    aimHalo=torus(3.8,.13,materials.gold);aimHalo.visible=false;
  }
  function addPickup(x,z,type) {
    const group=new THREE.Group();group.position.set(x,0,z);root.add(group);
    contactShadow(3.5,group);
    const color=type==='signal'?materials.gold:materials.heal;
    cylinder(3,.35,materials.dark,0,.25,0,12,group);
    const token=new THREE.Group();token.position.y=type==='signal'?2.4:2;group.add(token);
    if(type==='signal') {
      box(2.3,2.6,1.65,materials.gold,0,0,0,token);
      box(1.65,1.25,.15,materials.dark,0,.28,-.9,token);
      box(1.1,.55,.16,materials.glow,0,.3,-1.02,token);
      beam(new THREE.Vector3(.7,1.2,0),new THREE.Vector3(.7,3.3,0),.09,materials.metal,token);
      ellipsoid(.22,.22,.22,materials.glow,.7,3.25,0,token);
      for(const yy of [-.7,-.4])box(1.4,.08,.08,materials.leather,0,yy,-.92,token);
    } else {
      box(3.1,2.2,2.2,materials.white,0,0,0,token);
      box(3.17,.65,.1,materials.heal,0,0,-1.16,token);
      box(.65,1.75,.11,materials.heal,0,0,-1.18,token);
      box(1.35,.23,.7,materials.metal,0,1.29,0,token);
    }
    torus(4.2,.13,color,group);
    pickups.push({x,z,type,group,token,collected:false,baseY:type==='signal'?2.4:2});
  }
  function spawnWave() {
    const number = wave++;
    for (let i = 0; i < 3; i++) {
      const a = number * 1.51 + i * Math.PI * 2 / 3 + .35;
      let x = player.x + Math.cos(a) * (70 + i * 5), z = player.z + Math.sin(a) * (70 + i * 5);
      for (let attempt = 0; attempt < 30 && (!clearAt(x,z,4) || Math.hypot(x,z) > safeRadius() - 7); attempt++) {
        const aa = a + attempt * .42; const rr = Math.max(32, Math.min(68, safeRadius() - 16));
        x = Math.cos(aa) * rr; z = Math.sin(aa) * rr;
      }
      const {group,bar}=sentinel();
      const maxHealth = 100 + number * 25;
      const bot = { id: number * 3 + i, x,z,health:maxHealth,maxHealth,group,bar,shoot:1.8+i*.7,phase:rng()*6.28 };
      bots.push(bot); group.position.set(x,0,z);
    }
    log('wave', { wave, count:3 });
  }
  function fire(actor, target, friendly) {
    const dx = target.x - actor.x, dz = target.z - actor.z, d = Math.hypot(dx,dz);
    if (d < .01) return;
    const color = friendly ? materials.glow : materials.botShot;
    const ball = mesh(cachedGeometry(friendly?'friendly-bolt':'sentinel-bolt',()=>new THREE.SphereGeometry(friendly?.6:.85,8,6)),color,actor.x,3.4,actor.z);
    bullets.push({ x:actor.x,z:actor.z,prevX:actor.x,prevZ:actor.z,vx:dx/d*(friendly?104:34),vz:dz/d*(friendly?104:34),age:0,friendly,mesh:ball });
    if (friendly) shotsFired++;
  }
  function pulse(x,z,color) {
    const effect = torus(1,.12,color); effect.position.set(x,.5,z);
    effects.push({ mesh:effect,age:0 });
  }
  function nearestTarget() {
    return bots.filter(b => b.health>0 && distance(player,b)<112 && rayClear(player,b)).sort((a,b)=>distance(player,a)-distance(player,b))[0];
  }
  function segmentHit(bullet, actor, radius) {
    const dx=bullet.x-bullet.prevX,dz=bullet.z-bullet.prevZ, d=dx*dx+dz*dz;
    const t=d?clamp(((actor.x-bullet.prevX)*dx+(actor.z-bullet.prevZ)*dz)/d,0,1):0;
    return Math.hypot(bullet.prevX+t*dx-actor.x,bullet.prevZ+t*dz-actor.z)<radius;
  }
  function damage(amount, reason) {
    health = Math.max(0,health-amount); hitsTaken++; hitClock=.16;
    if (reason!=='zone' || hitsTaken%30===0) log('damage',{amount:+amount.toFixed(3),reason});
  }
  function reset(nextSeed = seed) {
    seed=nextSeed; disposeResources(); rng=randomGenerator(seed);
    elapsed=0;state='playing';health=100;score=0;wave=0;fireClock=0;hitClock=0;signalCount=0;
    bullets=[];bots=[];pickups=[];cover=[];events=[];effects=[];hitsTaken=0;shotsFired=0;movesBlocked=0;blockers=[];heroStride=0;visualElapsed=0;
    materials={
      ground:material(flat?0x71896e:0x7b946d,{map:grainTexture(0x879a73,28)}),
      path:material(0xc6b692,{map:grainTexture(0xd7c5a7,18)}),patch:material(0x688269),
      wall:material(0xd1b189,{map:grainTexture(0xc6a178,2,'wood')}),
      roof:material(0x745e54,{map:grainTexture(0xa18b7c,3,'wood')}),roofTrim:material(0x3c4748),
      window:material(flat?0x76bac5:0x6596a2,flat?{}:{roughness:.17,metalness:.6}),
      door:material(0x60716d,{map:grainTexture(0x7a8c7b,1,'wood')}),
      dark:material(0x26343b),cat:material(0xdca45e),cream:material(0xf4e5bd),
      stripe:material(0x86532f),innerEar:material(0xc77c7b),nose:material(0x92585d),eye:material(0x183330),
      jacket:material(0x627c79),bag:material(0x7d8b5c),boot:material(0x49423d),leather:material(0x634d38),
      bot:material(0x9d6c5e,flat?{}:{roughness:.35,metalness:.6}),
      botLens:material(0xff986e,flat?{}:{emissive:0xd43811,emissiveIntensity:.65}),
      white:material(0xf6efd9),gold:material(0xe2bb65),
      glow:material(0x9ce7d4,flat?{}:{emissive:0x39ba9b,emissiveIntensity:.5}),
      heal:material(0x94cba7),botShot:material(0xff865d,flat?{}:{emissive:0xe63917,emissiveIntensity:.9}),
      ring:material(0x83c9ba),leaf:material(0x416b50),leafLight:material(0x69865c),
      trunk:material(0x6d5948,{map:grainTexture(0x8b7760,1,'wood')}),
      crate:material(0xbf9c76,{map:grainTexture(0xccb08c,1,'wood')}),crateBand:material(0x8b7b64),
      stone:material(0x8c9690,{map:grainTexture(0xb6b9ab,2)}),grassDetail:material(0x60794f),
      metal:material(0x75868a,flat?{}:{metalness:.8,roughness:.34}),rubber:material(0x293435),
      prop:material(0x566367,{transparent:true,opacity:.7}),
      shadow:material(0x182724,{transparent:true,opacity:flat?.22:.12,depthWrite:false})
    };
    buildEnvironment(); player={x:0,z:0};playerMesh=cat();
    goals=[{x:0,z:-84},{x:84,z:0},{x:0,z:84}];
    goals.forEach(g=>addPickup(g.x,g.z,'signal'));
    [[-48,0],[0,46],[48,0],[0,-46]].forEach(([x,z])=>addPickup(x,z,'health'));
    spawnWave(); log('start',{variant,seed});
  }
  function ageEffects(dt) {
    for(let i=effects.length-1;i>=0;i--) {
      const effect=effects[i];effect.age+=dt;effect.mesh.scale.setScalar(1+effect.age*12);
      if(effect.age>.45){root.remove(effect.mesh);effects.splice(i,1);}
    }
  }
  function settlePresentation(dt) {
    // End-state physics is fixed, while short-lived effects and the character finish naturally.
    ageEffects(dt);aimHalo.visible=false;
    for(const bullet of bullets)root.remove(bullet.mesh);bullets=[];
    const character=playerMesh.userData,f=1-Math.exp(-9*dt);
    character.body.position.y=3+Math.sin(visualElapsed*1.7)*.025;character.body.rotation.z*=1-f;
    for(const leg of character.legs){leg.rotation.x*=1-f;leg.position.y+=(1.84-leg.position.y)*f;}
    for(const arm of character.arms)arm.rotation.x*=1-f;
    character.head.rotation.y+=(Math.sin(visualElapsed*.55)*.1-character.head.rotation.y)*f;
    character.tail.rotation.z=Math.sin(visualElapsed*1.5)*.06;
  }
  function prepareFrame(camera) {
    if(flat||!playerMesh)return;
    root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const eye=camera.getWorldPosition(new THREE.Vector3());
    const center=playerMesh.localToWorld(new THREE.Vector3(0,3.8,0));
    const direction=center.clone().sub(eye),length=direction.length();direction.normalize();
    const actualBlockers=new Set();
    for(const p of [[0,6,0],[0,3.4,0],[-1.1,3.4,0],[1.1,3.4,0],[0,1,0],[-.8,.45,-.25],[.8,.45,-.25]]) {
      const endpoint=playerMesh.localToWorld(new THREE.Vector3(...p)),ray=endpoint.clone().sub(eye);
      visibilityRay.set(eye,ray.clone().normalize());visibilityRay.far=ray.length()-.1;
      for(const hit of visibilityRay.intersectObjects(blockers,false))actualBlockers.add(hit.object);
    }
    for(const object of blockers) {
      object.geometry.computeBoundingSphere();
      const sphere=object.geometry.boundingSphere.clone().applyMatrix4(object.matrixWorld);
      const along=sphere.center.clone().sub(eye).dot(direction);
      const perpendicular=sphere.center.distanceTo(eye.clone().addScaledVector(direction,clamp(along,0,length)));
      // Spatial easing is reproducible at any capture cadence; no frame-rate-dependent fade history.
      const overlap=along>0&&along<length?sphere.radius+3.5-perpendicular:0;
      const amount=clamp(overlap/3.5,0,1),soft=amount*amount*(3-2*amount);
      const opacity=actualBlockers.has(object)?.08:1-soft*.92;
      if(opacity<.999) {
        let entry=sceneryFades.get(object);
        if(!entry) {
          const original=object.material,material=original.clone();material.transparent=true;material.depthWrite=false;
          resources.push(material);entry={original,material,shadow:object.castShadow};sceneryFades.set(object,entry);
        }
        object.material=entry.material;object.material.opacity=opacity;object.castShadow=opacity>.2&&entry.shadow;
      } else {
        const entry=sceneryFades.get(object);if(entry){object.material=entry.original;object.castShadow=entry.shadow;}
      }
    }
  }
  function step(dt, input = {}, auto = false) {
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    visualElapsed+=dt;
    if(state!=='playing'){settlePresentation(dt);return;}
    elapsed+=dt;fireClock-=dt;hitClock=Math.max(0,hitClock-dt);
    if(wave<WAVE_TIMES.length && elapsed>=WAVE_TIMES[wave])spawnWave();
    const previousX=player.x,previousZ=player.z;
    let dx=0,dz=0;
    if(auto) {
      const collectible=pickups.filter(p=>!p.collected && (p.type==='signal'||health<65)).sort((a,b)=>distance(player,a)-distance(player,b))[0];
      const enemy=bots.filter(b=>b.health>0).sort((a,b)=>distance(player,a)-distance(player,b))[0];
      let destination=collectible;
      if(!destination && Math.hypot(player.x,player.z)>safeRadius()-17) destination={x:0,z:0};
      if(!destination && enemy && (distance(player,enemy)>36||!rayClear(player,enemy)))destination=enemy;
      if(destination)steer(player,destination,dt,SPEED);
      else if(enemy) {
        const angle=Math.atan2(player.z-enemy.z,player.x-enemy.x), r=34;
        steer(player,{x:enemy.x+Math.cos(angle+.35)*r,z:enemy.z+Math.sin(angle+.35)*r},dt,SPEED*.65);
      } else if(wave<WAVE_TIMES.length) {
        // Stay active between waves: survey a clear central patrol circuit at walking speed.
        const angle=elapsed*.23,patrol={x:Math.cos(angle)*21,z:Math.sin(angle)*21};
        steer(player,patrol,dt,Math.min(SPEED*.55,distance(player,patrol)*1.8));
      }
    } else {
      dx=(input.right?1:0)-(input.left?1:0);dz=(input.down?1:0)-(input.up?1:0);
      const length=Math.hypot(dx,dz)||1;move(player,dx/length*SPEED,dz/length*SPEED,dt);
    }
    const target=nearestTarget();
    aimHalo.visible=!!target;
    const travelled=Math.hypot(player.x-previousX,player.z-previousZ);
    heroStride+=travelled*.4;
    let heading=playerMesh.rotation.y;
    if(travelled>.002)heading=Math.atan2(previousX-player.x,previousZ-player.z);
    else if(target)heading=Math.atan2(player.x-target.x,player.z-target.z);
    const turn=Math.atan2(Math.sin(heading-playerMesh.rotation.y),Math.cos(heading-playerMesh.rotation.y));
    playerMesh.rotation.y+=clamp(turn*(1-Math.exp(-8*dt)),-4.5*dt,4.5*dt);
    if(target){aimHalo.position.x=target.x;aimHalo.position.z=target.z;}
    const motion=clamp(travelled/(SPEED*dt||1),0,1),gait=Math.sin(heroStride)*.57*motion;
    playerMesh.userData.legs[0].rotation.x=gait;playerMesh.userData.legs[1].rotation.x=-gait;
    for(const leg of playerMesh.userData.legs) {
      const a=leg.rotation.x,cs=Math.cos(a),sn=Math.sin(a);
      const bootLow=1.48*cs-.27*sn+Math.sqrt((.33*cs)**2+(1.02*sn)**2);
      leg.position.y=Math.max(1.8,bootLow+.03);
    }
    playerMesh.userData.arms[0].rotation.x=-gait*.65;playerMesh.userData.arms[1].rotation.x=gait*.65;
    playerMesh.userData.body.position.y=3+Math.abs(Math.sin(heroStride))*.085*motion;
    const headTarget=target?clamp(Math.atan2(Math.sin(Math.atan2(player.x-target.x,player.z-target.z)-playerMesh.rotation.y),Math.cos(Math.atan2(player.x-target.x,player.z-target.z)-playerMesh.rotation.y)),-.62,.62):0;
    playerMesh.userData.head.rotation.y+=(headTarget-playerMesh.userData.head.rotation.y)*(1-Math.exp(-9*dt));
    if((auto||input.action)&&target&&fireClock<=0){fire(player,target,true);fireClock=.32;}
    for(const bot of bots) {
      if(bot.health<=0)continue;
      const d=distance(bot,player);
      if(d>30||!rayClear(bot,player))steer(bot,player,dt,11+wave*.4,2.8);
      else if(d<20)steer(bot,{x:bot.x+(bot.x-player.x),z:bot.z+(bot.z-player.z)},dt,8,2.8);
      else {
        const a=elapsed*.3+bot.phase;move(bot,Math.cos(a)*5,Math.sin(a)*5,dt,2.8);
      }
      bot.shoot-=dt;
      if(bot.shoot<=0&&d<98&&rayClear(bot,player)){fire(bot,player,false);bot.shoot=2.6+(bot.id%3)*.4;}
      if(Math.hypot(bot.x,bot.z)>safeRadius())bot.health=Math.max(0,bot.health-dt*3);
      bot.group.position.set(bot.x,0,bot.z);bot.group.rotation.y=Math.atan2(bot.x-player.x,bot.z-player.z);
      bot.group.userData.rig.position.y=Math.sin(elapsed*2.1+bot.phase)*.12;
      bot.group.userData.rotors.forEach((rotor,i)=>rotor.rotation.y=elapsed*(i%2?-40:40)+bot.phase);
      bot.group.userData.rig.rotation.z=Math.sin(elapsed*.8+bot.phase)*.035;
      bot.bar.scale.x=Math.max(.01,bot.health/bot.maxHealth);
      if(bot.health<=0){bot.group.visible=false;score++;log('tag',{bot:bot.id,reason:'zone'});}
    }
    for(let i=bullets.length-1;i>=0;i--){
      const bullet=bullets[i];bullet.prevX=bullet.x;bullet.prevZ=bullet.z;bullet.x+=bullet.vx*dt;bullet.z+=bullet.vz*dt;bullet.age+=dt;
      let remove=bullet.age>3.7||Math.abs(bullet.x)>WORLD||Math.abs(bullet.z)>WORLD;
      if(!remove&&cover.some(c=>segmentHit(bullet,c,c.radius))){remove=true;pulse(bullet.x,bullet.z,materials.stone);}
      if(!remove&&bullet.friendly){
        const bot=bots.find(b=>b.health>0&&segmentHit(bullet,b,3.4));
        if(bot){pulse(bullet.x,bullet.z,materials.glow);bot.health=Math.max(0,bot.health-25);bot.bar.scale.x=Math.max(.01,bot.health/bot.maxHealth);remove=true;
          if(bot.health<=0){bot.group.visible=false;score++;pulse(bot.x,bot.z,materials.gold);log('tag',{bot:bot.id,reason:'pulse'});}}
      } else if(!remove&&!bullet.friendly&&segmentHit(bullet,player,PLAYER_RADIUS+1)){damage(6,'pulse');remove=true;}
      if(remove){root.remove(bullet.mesh);bullets.splice(i,1);}else bullet.mesh.position.set(bullet.x,3.4,bullet.z);
    }
    for(const pickup of pickups){
      if(pickup.collected)continue;
      pickup.token.rotation.y=elapsed*.5;pickup.token.position.y=pickup.baseY+Math.sin(elapsed*1.7+pickup.x)*.18;
      if(distance(player,pickup)<6){pickup.collected=true;pickup.group.visible=false;
        if(pickup.type==='signal')signalCount++;else health=Math.min(100,health+28);
        log('pickup',{kind:pickup.type,x:pickup.x,z:pickup.z});pulse(pickup.x,pickup.z,pickup.type==='signal'?materials.gold:materials.heal);}
    }
    ageEffects(dt);
    if(Math.hypot(player.x,player.z)>safeRadius())damage(9*dt,'zone');
    ring.scale.setScalar(safeRadius());
    playerMesh.position.set(player.x,0,player.z);
    playerMesh.userData.body.rotation.z=hitClock>0?Math.sin(hitClock*35)*.035:0;
    playerMesh.userData.tail.rotation.z=Math.sin(elapsed*2.2)*.08;
    if(health<=0){state='lost';log('lost',{reason:'health'});}
    else if(score===TOTAL_BOTS&&signalCount===3){state='won';aimHalo.visible=false;for(const bullet of bullets)root.remove(bullet.mesh);bullets=[];log('won',{score,health:+health.toFixed(2)});}
    else if(elapsed>=100){state='lost';log('lost',{reason:'timeout'});}
  }
  function cameraPose(view = 'chase') {
    if(view==='overview'||view==='map'||view==='top')return {position:[0,flat?300:265,flat?.1:155],target:[0,0,0]};
    if(view==='cinematic'||view==='wide'){
      const a=elapsed*.025;
      return {position:[player.x+Math.sin(a)*75,flat?123:62,player.z+Math.cos(a)*66],target:[player.x,0,player.z]};
    }
    return {position:[player.x,flat?105:66,player.z+(flat?.1:51)],target:[player.x,0,player.z]};
  }
  function hud(){
    const remaining=TOTAL_BOTS-score;
    const waiting=wave<WAVE_TIMES.length&&!bots.some(b=>b.health>0);
    return {title:flat?'Pocket Survival':'Outpost Survival',objective:'Collect 3 golden signals and tag all 12 sentinels.',primary:`${Math.ceil(health)} health · ${signalCount}/3 signals`,secondary:`${score}/12 tagged · wave ${wave}/4 · safe radius ${Math.ceil(safeRadius())} m`,progress:(score+signalCount)/15,status:state,message:state==='won'?'All signals recovered. The outpost is secure.':state==='lost'?'Try again: use cover, collect green health and stay inside the ring.':Math.hypot(player.x,player.z)>safeRadius()?'Outside the safe ring — move toward the center!':waiting?`Wave cleared. Next wave in ${Math.ceil(WAVE_TIMES[wave]-elapsed)} s — find supplies and take cover.`:`WASD move · Space fires toward the highlighted nearest visible sentinel · ${remaining} remain`};
  }
  function snapshot(){return {variant,seed,elapsed:+elapsed.toFixed(4),status:state,position:[player.x,0,player.z],health,score,signals:signalCount,wave,botsAlive:bots.filter(b=>b.health>0).length,botsSpawned:bots.length,bots:bots.map(({id,x,z,health})=>({id,x,z,health})),pickups:pickups.map(({x,z,type,collected})=>({x,z,type,collected})),safezone:{center:[0,0],radius:safeRadius()},shotsFired,hitsTaken,movesBlocked,projectiles:bullets.length,effects:effects.length,events:[...events],world:{width:WORLD*2,depth:WORLD*2,cover:cover.length},orthographic:flat};}
  reset(seed);
  return {root,step,cameraPose,hud,snapshot,reset,hero:()=>playerMesh,occluders:()=>blockers,prepareFrame,orthographic:flat,dispose(){disposeResources();scene.remove(root);}};
}

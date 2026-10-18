import {createMaterialKit} from './materials.js';
/** Original, seeded arcade aircraft, delivery drone, and sky-arena demonstrations.
 * The host calls step at 1/60 s; no wall clock or random global state is used.
 */
export function createFlight({ THREE: T, scene, seed = 19, variant = 'aircraft' }) {
  const mode = ['aircraft', 'drone', 'sky'].includes(variant) ? variant : 'aircraft';
  const root = new T.Group();
  root.name = `flight-${mode}`;
  scene.add(root);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));
  let rng, elapsed, state, actor, propellers, rings, obstacles, events, bots, targetIndex, hold;
  let lastSeed, skyOrbs, islandDecor, replay, kit;
  const resourceGeometries = new Set(), resourceMaterials = new Set();
  const V = (a) => new T.Vector3(...a);
  const specs = {
    aircraft: {
      title: 'Cloudline Courier', objective: 'Fly through seven runway beacons',
      start: [-230, 43, 110], speed: 25, turn: 1.15, climb: 16, radius: 12,
      route: [[-170,46,35],[-80,59,-35],[15,65,-70],[105,53,-10],[185,61,42],[270,47,-12],[355,35,-90]],
      accent: '#ffd365', body: '#e97146', limit: 95,
    },
    drone: {
      title: 'Rooftop Relay', objective: 'Hover inside six delivery beacons',
      start: [-150, 34, 75], speed: 14, turn: 2.3, climb: 12, radius: 8,
      route: [[-90,34,25],[-30,49,-22],[38,39,-14],[108,58,35],[165,48,-40],[225,35,-75]],
      accent: '#8af4df', body: '#82ffe2', limit: 120,
    },
    sky: {
      title: 'Sky Sprint Arena', objective: 'Collect seven sky cores before the rivals',
      start: [-205, 60, 95], speed: 23, turn: 1.65, climb: 18, radius: 12,
      route: [[-135,65,20],[-65,80,-55],[25,72,-72],[105,91,-10],[185,77,65],[265,62,25],[340,73,-60]],
      accent: '#c5a5ff', body: '#bb93ff', limit: 95,
    },
  };
  const cfg = specs[mode];
  const mat = (color, opts = {}) => {
    const m = new T.MeshStandardMaterial({ color, roughness: .65, metalness: .08, ...opts });
    resourceMaterials.add(m); return m;
  };
  const surface=(name,color='#ffffff',opts={})=>{const m=kit[name].clone();m.onBeforeCompile=kit[name].onBeforeCompile;m.customProgramCacheKey=kit[name].customProgramCacheKey;m.color.set(color);Object.assign(m,opts);resourceMaterials.add(m);return m;};
  const geom = g => { resourceGeometries.add(g); return g; };
  const mesh = (g, m, p, s, parent = root) => {
    const o = new T.Mesh(g, m); if (p) o.position.set(...p); if (s) o.scale.set(...s);
    o.castShadow = !m.transparent; o.receiveShadow = true; parent.add(o); return o;
  };
  const box = (m, p, s, parent) => mesh(geom(new T.BoxGeometry(1,1,1)), m, p, s, parent);
  const rand = () => { let a = rng += 0x6D2B79F5; a = Math.imul(a ^ a >>> 15, a | 1); a ^= a + Math.imul(a ^ a >>> 7, a | 61); return ((a ^ a >>> 14) >>> 0) / 4294967296; };
  function instances(g, m, rows, parent = root) {
    const im = new T.InstancedMesh(g, m, rows.length), d = new T.Object3D();
    rows.forEach((r, i) => { d.position.set(...r.p); d.scale.set(...r.s); d.rotation.set(0, r.y || 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.castShadow = true; im.receiveShadow = true; parent.add(im); return im;
  }
  // Geometry is shaped in metres around +Z forward. Smooth surfaces are shared per actor.
  function hull(stations, segments=20) {
    const positions=[],indices=[];
    stations.forEach(([z,rx,ry,cy=0])=>{for(let j=0;j<segments;j++){const a=j/segments*Math.PI*2;positions.push(Math.cos(a)*rx,cy+Math.sin(a)*ry,z);}});
    for(let k=0;k<stations.length-1;k++)for(let j=0;j<segments;j++){
      const a=k*segments+j,b=k*segments+(j+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return geom(g);
  }
  function airfoil(span,chord,tipChord,sweep,dihedral=.09) {
    const positions=[],indices=[],steps=18,stations=10;
    // Symmetrical closed airfoil: rounded leading edge, tapered trailing edge and tips.
    for(let k=0;k<=stations;k++) {
      const f=k/stations,x=(f*2-1)*span/2,t=Math.abs(f*2-1),c=chord+(tipChord-chord)*Math.pow(t,1.3),center=-t*sweep;
      for(let j=0;j<steps*2;j++) {
        const u=j<steps?j/(steps-1):(2*steps-1-j)/(steps-1),sign=j<steps?1:-1;
        const thickness=5*.13*c*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u*u*u-.1036*u*u*u*u);
        positions.push(x,Math.abs(x)*dihedral+sign*thickness,center+c*(.5-u));
      }
    }
    for(let k=0;k<stations;k++)for(let j=0;j<steps*2;j++){
      const a=k*steps*2+j,b=k*steps*2+(j+1)%(steps*2),c=a+steps*2,d=b+steps*2;indices.push(a,c,b,b,c,d);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return geom(g);
  }
  function strut(a,b,r,material,parent) {
    const v=V(b).sub(V(a)),o=mesh(geom(new T.CylinderGeometry(r,r,v.length(),10)),material,V(a).add(V(b)).multiplyScalar(.5).toArray(),null,parent);
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;
  }
  function buildVehicle(color, tiny = false) {
    const group=new T.Group(),spins=[];
    const skin=kit.paint(color);skin.envMapIntensity=.32;skin.roughness=.36;skin.clearcoat=.3;skin.clearcoatRoughness=.3;
    const dark=mat('#182633',{roughness:.65,metalness:.35});
    const trim=mat('#f0eee3',{roughness:.33,metalness:.2}),metal=mat('#77828a',{roughness:.28,metalness:.8});
    const glass=mat('#254a61',{roughness:.08,metalness:.56});
    const rotorMat=mat('#83949c',{transparent:true,opacity:.15,roughness:.4,metalness:.2,side:T.DoubleSide,depthWrite:false});
    if(mode==='drone') {
      mesh(geom(new T.SphereGeometry(1,24,12)),skin,[0,0,0],[1.85,.59,1.5],group);
      mesh(geom(new T.SphereGeometry(1,20,10)),dark,[0,-.25,0],[1.68,.4,1.35],group);
      mesh(geom(new T.CapsuleGeometry(.46,1.25,5,12)),trim,[0,.47,-.1],[1,.6,1],group).rotation.x=Math.PI/2;
      for(const x of [-3.2,3.2])for(const z of [-2.8,2.8]) {
        strut([x*.29,-.03,z*.29],[x,.1,z],.21,dark,group);
        strut([x*.35,.02,z*.3],[x,.1,z],.055,metal,group);
        mesh(geom(new T.CylinderGeometry(.4,.36,.58,16)),metal,[x,.33,z],null,group);
        mesh(geom(new T.CylinderGeometry(.31,.38,.16,16)),dark,[x,.64,z],null,group);
        const rotor=mesh(geom(new T.CircleGeometry(1.72,40)),rotorMat,[x,.75,z],null,group);rotor.rotation.x=-Math.PI/2;
        mesh(geom(new T.RingGeometry(1.62,1.73,40)),rotorMat,[x,.751,z],null,group).rotation.x=-Math.PI/2;
        mesh(geom(new T.SphereGeometry(.18,10,6)),metal,[x,.78,z],[1,.55,1],group);
        const lamp=mat(z>0?'#90ffc6':'#ef634f',{emissive:z>0?'#3dd791':'#d83120',emissiveIntensity:.6});
        mesh(geom(new T.SphereGeometry(.13,8,6)),lamp,[x,.02,z+.27],null,group);
      }
      for(const x of [-1.25,1.25]) {
        strut([x,-.28,-.85],[x,-1.35,-1.05],.095,dark,group);strut([x,-.28,.8],[x,-1.35,1.03],.095,dark,group);
        strut([x,-1.35,-1.3],[x,-1.35,1.3],.09,metal,group);
      }
      strut([0,-.25,1],[0,-.8,1.2],.12,metal,group);
      const gimbal=mesh(geom(new T.SphereGeometry(.44,16,10)),dark,[0,-.88,1.18],[1,.8,1],group);
      mesh(geom(new T.CylinderGeometry(.28,.3,.18,16)),glass,[0,-.87,1.56],null,group).rotation.x=Math.PI/2;
      const parcel=mat('#d2a46f',{roughness:.95});box(parcel,[0,-.82,-.2],[1.5,.85,1.35],group);
      box(trim,[0,-.82,.481],[.24,.85,.012],group);box(trim,[0,-.385,-.2],[.24,.018,1.35],group);
    } else {
      // Satin enamel on broad airfoils keeps the livery legible under grazing sunlight.
      const wingPaint=kit.paint(color);Object.assign(wingPaint,{roughness:.56,metalness:.04,clearcoat:.04,clearcoatRoughness:.6,specularIntensity:.16,envMapIntensity:.16});
      mesh(hull([[-4.4,.02,.04,.26],[-3.8,.24,.28,.2],[-2.7,.42,.45,.05],[-1.1,.66,.65,0],[.8,.81,.78,0],[2.3,.64,.65,0],[3.2,.48,.5,0],[3.6,.31,.35,0],[3.65,.01,.01,0]]),skin,[0,0,0],null,group);
      mesh(airfoil(12.4,2.9,1.12,.86,.065),wingPaint,[0,-.15,-.1],null,group);
      // Wing stripes, separate ailerons, tapered stabilizers and a swept vertical fin.
      for(const side of [-1,1]) {
        const stripe=mesh(airfoil(.44,1.58,1.58,0,0),trim,[side*4.75,.25,-.73],null,group);
        stripe.rotation.z=side*.065;
        strut([side*2.3,-.27,-1.3],[side*5.7,.02,-1.17],.017,dark,group);
      }
      mesh(airfoil(4.5,1.28,.57,.45,.02),wingPaint,[0,.1,-3.47],null,group);
      const fin=mesh(airfoil(2.65,1.25,.48,.48,0),wingPaint,[0,1.14,-3.48],null,group);fin.rotation.z=Math.PI/2;fin.scale.x=.85;
      mesh(geom(new T.SphereGeometry(1,24,12)),glass,[0,.56,.15],[.59,.68,1.29],group);
      const frame=mesh(geom(new T.TorusGeometry(.63,.035,6,28)),trim,[0,.65,.07],[1,.92,1],group);frame.rotation.x=Math.PI/2;
      strut([0,1.22,-.45],[0,1.13,1.04],.035,trim,group);
      for(const x of [-.62,.62]) {
        const intake=mesh(geom(new T.SphereGeometry(1,12,8)),dark,[x,.04,2.55],[.12,.2,.48],group);
        strut([x,-.4,1.8],[x*1.12,-.54,1.14],.085,metal,group);
      }
      const disc=mesh(geom(new T.CircleGeometry(1.92,48)),rotorMat,[0,0,3.78],null,group);
      mesh(geom(new T.RingGeometry(1.78,1.93,48)),rotorMat,[0,0,3.79],null,group);
      mesh(hull([[3.71,.28,.28],[4,.19,.19],[4.22,.01,.01]],16),metal,[0,0,0],null,group);
      for(const side of [-1,1]) {
        const lamp=mat(side<0?'#e94a3c':'#5fdb98',{emissive:side<0?'#ba221f':'#30a854',emissiveIntensity:.65});
        mesh(geom(new T.SphereGeometry(.12,8,6)),lamp,[side*6.1,.27,-.73],[1,.8,1.8],group);
      }
    }
    group.name=mode==='drone'?'delivery-quadcopter':'courier-airframe';
    if(tiny)group.scale.setScalar(.75);
    return {group,spins};
  }
  function islandTerrain(x,z,r,base,relief,phase,plateau=false) {
    const rings=16,segments=48,positions=[],colors=[],indices=[];
    const beach=new T.Color('#d8c291'),meadow=new T.Color('#6c8860'),rock=new T.Color('#747d79');
    for(let k=0;k<=rings;k++)for(let j=0;j<=segments;j++) {
      const f=k/rings,a=j/segments*Math.PI*2,edge=1+.12*Math.sin(a*3+phase)+.075*Math.sin(a*7-phase),rr=f*r*edge;
      const crown=Math.pow(Math.max(0,1-f),1.5),fade=clamp((f-.55)/.45,0,1),h=plateau?base-1.9+relief*(1-fade*fade*(3-2*fade)):base-1.9+crown*relief+(Math.sin(a*3+f*9+phase)+Math.cos(a*5-f*5))*crown*1.3;
      positions.push(x+Math.cos(a)*rr,h,z+Math.sin(a)*rr);
      const c=beach.clone().lerp(meadow,clamp((1-f)*4.3-.24,0,1));if(h>base+relief*.6)c.lerp(rock,clamp((h-base-relief*.6)/5,0,.85));colors.push(c.r,c.g,c.b);
    }
    for(let k=0;k<rings;k++)for(let j=0;j<segments;j++){const a=k*(segments+1)+j,b=a+1,c=a+segments+1,d=c+1;indices.push(a,b,c,b,d,c);}
    const g=geom(new T.BufferGeometry());g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
    const land=mesh(g,surface('sand','#ffffff',{vertexColors:true,roughness:1}),null);land.castShadow=false;
    return (px,pz)=>{const dx=px-x,dz=pz-z,a=Math.atan2(dz,dx),edge=1+.12*Math.sin(a*3+phase)+.075*Math.sin(a*7-phase),f=Math.min(1,Math.hypot(dx,dz)/(r*edge)),crown=Math.pow(1-f,1.5);return base-1.9+crown*relief+(Math.sin(a*3+f*9+phase)+Math.cos(a*5-f*5))*crown*1.3;};
  }
  function environment() {
    const ocean=new T.MeshPhysicalMaterial({color:mode==='drone'?'#234953':'#225f76',roughness:.36,metalness:0,envMapIntensity:.15,specularIntensity:.14});resourceMaterials.add(ocean);
    const waterGeom=geom(new T.PlaneGeometry(4000,4000,150,150));waterGeom.rotateX(-Math.PI/2);
    const pos=waterGeom.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,Math.sin(pos.getX(i)*.052+pos.getZ(i)*.018)*.17+Math.cos(pos.getZ(i)*.07)*.12);waterGeom.computeVertexNormals();
    const water=mesh(waterGeom,ocean,[30,-2,0]);water.castShadow=false;
    const bark=surface('wood'),grass=surface('grass','#a6b398'),stone=surface('concrete','#8f9a95'),sand=surface('sand');
    const cube=geom(new T.BoxGeometry(1,1,1)),cone=geom(new T.ConeGeometry(1,1,9));
    const trunks=[],leaves=[],rocks=[],clouds=[],ripples=[];islandDecor=[];
    for(let i=0;i<43;i++) {
      const x=-700+rand()*1700,z=-700+rand()*1400,r=32+rand()*78,relief=9+rand()*12,phase=rand()*6.28;
      // Keep scenery outside the city apron and both airport footprints.
      if(mode==='drone'&&x+r>-335&&x-r<435&&z+r>-245&&z-r<245)continue;
      if(mode!=='drone'&&[cfg.start,cfg.route[cfg.route.length-1]].some(p=>Math.hypot(x-p[0],z-p[2])<r+115))continue;
      const surface=islandTerrain(x,z,r,-.5,relief,phase);islandDecor.push({x,z,r,y:4.5,surface});
      for(let t=0;t<8;t++) {
        const a=rand()*Math.PI*2,rr=(.25+rand()*.48)*r,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr,h=5+rand()*6,py=surface(px,pz);
        trunks.push({p:[px,py+h*.38,pz],s:[.45,h*.77,.45]});
        for(let tier=0;tier<3;tier++)leaves.push({p:[px,py+h*(.65+tier*.18),pz],s:[h*(.45-tier*.08),h*.52,h*(.45-tier*.08)]});
      }
      if(i%3===0){const px=x+r*.15,pz=z-r*.23;rocks.push({p:[px,surface(px,pz)+1.2,pz],s:[r*.09,3+rand()*4,r*.07],y:rand()*3});}
    }
    instances(cube,bark,trunks);instances(cone,grass,leaves);const crags=instances(geom(new T.DodecahedronGeometry(1,0)),stone,rocks);crags.userData.occluder=true;
    for(let i=0;i<54;i++)clouds.push({p:[-850+rand()*1800,170+rand()*80,-850+rand()*1700],s:[22+rand()*37,5+rand()*9,13+rand()*21]});
    // The shared atmospheric sky supplies clouds; opaque ellipsoid clouds looked like floating rocks.
    for(let i=0;i<240;i++)ripples.push({p:[-1000+rand()*2100,-1.76,-900+rand()*1800],s:[4+rand()*18,.025,.12+rand()*.2],y:.28});
    const glints=instances(cube,mat('#aac9cc',{transparent:true,opacity:.23,depthWrite:false}),ripples);glints.castShadow=false;
    if(mode==='drone')buildCity(cube);
    else {
      const runway=surface('asphalt'),paint=mat('#e7e5d5'),hangar=mat('#8b9597',{roughness:.7,metalness:.35}),roof=mat('#bcc2bd',{roughness:.6,metalness:.5});
      for(const end of [cfg.start,cfg.route[cfg.route.length-1]]) {
        islandTerrain(end[0],end[2],106,-.5,5.5,1.8,true);
        box(runway,[end[0],3.25,end[2]],[27,.3,115]);
        for(let i=-4;i<=4;i++)box(paint,[end[0],3.42,end[2]+i*11],[.7,.025,4.5]);
        for(const side of [-1,1]) {
          box(paint,[end[0]+side*12,3.43,end[2]],[.22,.025,112]);
          for(let i=-5;i<=5;i++)mesh(geom(new T.SphereGeometry(.17,6,4)),mat('#d3d7b5',{emissive:'#cad995',emissiveIntensity:.35}),[end[0]+side*14,3.6,end[2]+i*10],null);
        }
        const building=box(hangar,[end[0]-32,8,end[2]+12],[25,10,21]);building.userData.occluder=true;
        const roofMesh=box(roof,[end[0]-32,13.5,end[2]+12],[27,1,23]);roofMesh.userData.occluder=true;
        box(mat('#3b4850'),[end[0]-32,7,end[2]+22.6],[18,7,.12]);
        for(let i=0;i<7;i++)box(roof,[end[0]-32,4.4+i*.9,end[2]+22.7],[18,.045,.06]);
        for(let i=-4;i<=4;i++)box(roof,[end[0]-32+i*2.6,8,end[2]+1.44],[.08,10,.1]);
        obstacles.push({min:[end[0]-44.5,3,end[2]+1.5],max:[end[0]-19.5,14,end[2]+22.5]});
      }
    }
  }
  function buildCity(cube) {
    const blocks=[[],[],[]],windows=[],frames=[],roofs=[],units=[],vents=[],lines=[],poles=[],cars=[];
    const asphalt=surface('asphalt'),windowmat=mat('#365a6a',{roughness:.12,metalness:.55});
    box(surface('concrete','#adb6af'),[40,0,0],[740,3,460]);
    for(let x=-280;x<430;x+=60) {
      box(asphalt,[x,1.7,0],[15,.12,440]);
      for(let z=-210;z<220;z+=12)lines.push({p:[x,1.78,z],s:[.2,.016,4]});
      for(const side of [-1,1])box(mat('#b3b2a7'),[x+side*8.3,1.9,0],[1.2,.45,440]);
    }
    for(let z=-180;z<=180;z+=60)box(asphalt,[50,1.79,z],[700,.12,14]);
    for(let x=-260;x<420;x+=60)for(let z=-160;z<180;z+=60) {
      const h=9+rand()*14,w=22+rand()*10,type=Math.floor(rand()*3);blocks[type].push({p:[x,h/2+2,z],s:[w,h,w]});
      roofs.push({p:[x,h+2.32,z],s:[w+.7,.64,w+.7]});
      obstacles.push({min:[x-w/2,0,z-w/2],max:[x+w/2,h+3,z+w/2]});
      for(let y=5;y<h+1;y+=3.5) {
        for(const side of [-1,1])for(let a=-1;a<=1;a++) {
          windows.push({p:[x+a*6,y,z+side*(w/2+.025)],s:[3.6,2,.07]});windows.push({p:[x+side*(w/2+.025),y,z+a*6],s:[.07,2,3.6]});
        }
        for(const side of [-1,1]){frames.push({p:[x,y-1.32,z+side*(w/2+.12)],s:[w+.4,.14,.2]});frames.push({p:[x+side*(w/2+.12),y-1.32,z],s:[.2,.14,w+.4]});}
      }
      for(const side of [-1,1]){roofs.push({p:[x,h+2.96,z+side*w*.48],s:[w,.7,.4]});roofs.push({p:[x+side*w*.48,h+2.96,z],s:[.4,.7,w]});}
      for(let a=0;a<2;a++) {
        units.push({p:[x-5+a*8,h+3.65,z-3],s:[4,2.3,3.4]});
        for(let j=0;j<4;j++)vents.push({p:[x-5+a*8,h+4.83,z-4.1+j*.65],s:[3.3,.065,.14]});
      }
      poles.push({p:[x+w*.3,h+5,z+w*.27],s:[.1,5,.1]});
      poles.push({p:[x+w*.3,h+6.8,z+w*.27],s:[2.1,.07,.08]});
      cars.push({p:[x-18,2.75,z+18],s:[2.1,1.2,4.2],y:Math.PI/2});
    }
    const colors=['#a1a6a1','#b1a899','#79898d'];blocks.forEach((rows,i)=>{const b=instances(cube,surface('concrete',colors[i]),rows);b.userData.occluder=true;});
    const roof=instances(cube,surface('concrete','#bfcac9'),roofs);roof.userData.occluder=true;
    instances(cube,windowmat,windows);instances(cube,mat('#dadbd1',{roughness:.8}),frames);
    const ac=instances(cube,mat('#bec4bd',{roughness:.6,metalness:.3}),units);ac.userData.occluder=true;
    instances(cube,mat('#35454b'),vents);instances(cube,mat('#6f7d81',{metalness:.6}),poles);
    instances(cube,mat('#ded8b0'),lines);instances(cube,mat('#738d95',{roughness:.3,metalness:.4}),cars);
  }
  function buildTargets() {
    const ringGeometry=geom(new T.TorusGeometry(mode==='drone'?6:11,.13,8,64));
    const future=mat('#afc7cb',{transparent:true,opacity:.2,depthWrite:false}),active=mat(cfg.accent,{emissive:cfg.accent,emissiveIntensity:.22,transparent:true,opacity:.76,depthWrite:false}),done=mat('#75b799',{transparent:true,opacity:.09,depthWrite:false});
    rings=cfg.route.map((p,i)=>{
      const group=new T.Group();group.position.set(...p);root.add(group);
      const ring=mesh(ringGeometry, i===0?active:future,[0,0,0],null,group);
      const from=i?cfg.route[i-1]:cfg.start;
      ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),V(p).sub(V(from)).normalize());
      if(mode==='drone'){ring.rotation.set(Math.PI/2,0,0);ring.position.y=-5.8;}
      const pedestal=mesh(geom(new T.CylinderGeometry(mode==='drone'?5:1.8,mode==='drone'?5:1.8,.5,16)),mat('#e8e1b4'),[0,mode==='drone'?-5:-16,0],null,group);
      const beam=mesh(geom(new T.CylinderGeometry(.17,.17,mode==='drone'?10:23,6)),i===0?active:future,[0,mode==='drone'?-5:-16,0],null,group);
      if(mode==='drone') {
        const towerHeight=p[1]-7;
        const tower=box(surface('concrete','#b3c1bb'),[0,-p[1]+towerHeight*.5,0],[9,towerHeight,9],group);tower.userData.occluder=true;
        const pad=box(mat('#dad9c3'),[0,-6.5,0],[11,1,11],group);pad.userData.occluder=true;
        const ink=mat('#3b6862');
        for(const x of [-1.4,1.4])box(ink,[x,-5.96,0],[.42,.015,4],group);
        box(ink,[0,-5.96,0],[2.8,.015,.42],group);
        for(let y=6;y<towerHeight-2;y+=4)for(const side of [-1,1]){box(mat('#345466',{roughness:.15,metalness:.6}),[0,-p[1]+y,side*4.51],[6,1.8,.05],group);}
        obstacles.push({min:[p[0]-5.5,0,p[2]-5.5],max:[p[0]+5.5,p[1]-6,p[2]+5.5]});
      }
      pedestal.visible=false;beam.visible=false;
      if(mode==='sky') {
        const core=mesh(geom(new T.OctahedronGeometry(2.4)),active,[0,0,0],null,group);
        const sparkGeometry=geom(new T.BufferGeometry());sparkGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(45),3));
        const sparkMaterial=new T.PointsMaterial({color:cfg.accent,size:2.5,sizeAttenuation:false,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending});resourceMaterials.add(sparkMaterial);
        const sparks=new T.Points(sparkGeometry,sparkMaterial);sparks.visible=false;sparks.frustumCulled=false;group.add(sparks);
        core.userData={index:i,collectedAt:null,sparks};skyOrbs.push(core);
      }
      return {group,ring,beam,pedestal,active,future,done};
    });
  }
  function record(type,data={}) { events.push({time:+elapsed.toFixed(3),type,...data}); if(events.length>200) events.shift(); }
  function clean() {
    root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    for(const g of resourceGeometries)g.dispose();for(const m of resourceMaterials)m.dispose();
    resourceGeometries.clear();resourceMaterials.clear();kit?.dispose();root.clear();
  }
  function reset(value=lastSeed??seed) {
    clean();lastSeed=Number.isFinite(Number(value))?Number(value):19;rng=lastSeed>>>0;
    elapsed=0;targetIndex=0;hold=0;events=[];obstacles=[];bots=[];skyOrbs=[];replay=[];
    const first=cfg.route[0];
    state={continuationTime:0,position:V(cfg.start),yaw:Math.atan2(first[0]-cfg.start[0],first[2]-cfg.start[2]),speed:mode==='drone'?0:cfg.speed,vertical:0,bank:0,pitch:0,status:'playing',message:'',score:0};
    kit=createMaterialKit(T);environment();buildTargets();
    const built=buildVehicle(cfg.body);actor=built.group;propellers=built.spins;root.add(actor);
    if(mode==='sky') for(let i=0;i<3;i++) {
      const b=buildVehicle(['#ffaf81','#82e6e3','#ffe17d'][i],true);root.add(b.group);
      bots.push({group:b.group,spins:b.spins,position:V([cfg.start[0]-16-i*11,cfg.start[1]+i*4-4,cfg.start[2]+14+i*12]),index:0,speed:16+i*.6,yaw:state.yaw,score:0});
    }
    actor.position.copy(state.position);actor.rotation.y=state.yaw;record('start',{seed:lastSeed,variant:mode});
    return snapshot();
  }
  function fail(reason) { if(state.status!=='playing')return;state.status='lost';state.message=reason;record('failed',{reason}); }
  function steer(input,auto,dt) {
    let turn=(input.left?1:0)-(input.right?1:0), vertical=(input.ascend?1:0)-(input.descend?1:0);
    let desired=mode==='drone'?(input.up?cfg.speed:input.down?-6:0):cfg.speed+(input.up?7:0)-(input.down?10:0);
    if(input.action)desired=mode==='drone'?23:cfg.speed+15;
    if(auto&&targetIndex<cfg.route.length) {
      const q=cfg.route[targetIndex],dx=q[0]-state.position.x,dz=q[2]-state.position.z;
      let dy=q[1]-state.position.y;
      if(mode==='drone'&&targetIndex>0) {
        const previous=cfg.route[targetIndex-1];
        if(q[1]<previous[1]&&Math.hypot(state.position.x-previous[0],state.position.z-previous[2])<14)dy=previous[1]-state.position.y;
      }
      const flat=Math.hypot(dx,dz),error=angle(Math.atan2(dx,dz)-state.yaw);
      turn=clamp(error*2.8/cfg.turn,-1,1);
      vertical=clamp(dy*.7/cfg.climb,-1,1);
      desired=cfg.speed*clamp(1-Math.abs(error)*.3,.4,1);
      if(mode==='drone') {
        desired=flat<3.5?0:Math.min(desired,flat*.68);
        // A stopped drone holds position while delivering, rather than orbiting the pad.
        if(flat<3.5)turn=0;
      }
    }
    state.yaw=angle(state.yaw+turn*cfg.turn*dt);
    state.speed=smooth(state.speed,desired,mode==='drone'?4.8:2.2,dt);
    state.vertical=smooth(state.vertical,vertical*cfg.climb,3.5,dt);
    state.position.x+=Math.sin(state.yaw)*state.speed*dt;
    state.position.z+=Math.cos(state.yaw)*state.speed*dt;
    state.position.y+=state.vertical*dt;
    state.bank=smooth(state.bank,-turn*(mode==='drone'?.21:.48),5,dt);
    const pitchTarget=mode==='drone'?clamp(state.speed*.018,-.12,.3):-Math.atan2(state.vertical,Math.max(12,Math.abs(state.speed)));
    state.pitch=smooth(state.pitch,pitchTarget,4,dt);
  }
  function updateBots(dt) {
    for(const b of bots) {
      const idx=Math.min(b.index,cfg.route.length-1),target=V(cfg.route[idx]);
      const difference=target.sub(b.position),len=difference.length();
      if(b.index<cfg.route.length) {
        const speed=Math.min(b.speed,len/dt);b.position.addScaledVector(difference.normalize(),speed*dt);
        b.yaw=smooth(b.yaw,Math.atan2(difference.x,difference.z),4,dt);
        if(len<cfg.radius) {b.index++;b.score++;record('rival-core',{rival:bots.indexOf(b),score:b.score});}
      } else { b.position.x+=Math.sin(elapsed*.3)*dt*4;b.position.z+=Math.cos(elapsed*.3)*dt*4; }
      b.group.position.copy(b.position);b.group.rotation.y=b.yaw;
      for(const spin of b.spins)spin.rotation.z+=dt*35;
    }
  }
  function step(dt,input={},auto=false) {
    dt=clamp(Number.isFinite(dt)?dt:0,0,1/30);
    if(dt===0)return;
    if(state.status==='playing') {
      elapsed+=dt;steer(input,auto,dt);updateBots(dt);
      const p=state.position;
      if(p.y<3)fail(mode==='drone'?'Ground contact. Reset and use E to climb.':'Water or ground contact. Reset and climb.');
      if(state.status==='playing'&&mode!=='sky')for(const land of islandDecor) {
        if(p.y<land.surface(p.x,p.z)+1&&Math.hypot(p.x-land.x,p.z-land.z)<land.r*.9) {fail('Island contact. Reset and climb above the terrain.');break;}
      }
      if(p.y>240||Math.abs(p.x)>1800||Math.abs(p.z)>1500)fail('Left the flight zone. Reset to try the route again.');
      if(state.status==='playing') for(const c of obstacles) {
        if(p.x>c.min[0]-1&&p.x<c.max[0]+1&&p.y>c.min[1]&&p.y<c.max[1]+1&&p.z>c.min[2]-1&&p.z<c.max[2]+1) {fail('Building collision. Reset and keep clear of rooftops.');break;}
      }
      if(state.status==='playing'&&targetIndex<cfg.route.length) {
        const distance=p.distanceTo(V(cfg.route[targetIndex]));
        const inside=distance<cfg.radius;
        hold=mode==='drone'?(inside&&Math.abs(state.speed)<7?hold+dt:0):0;
        if((mode==='drone'&&hold>=1.35)||(mode!=='drone'&&inside)) {
          const r=rings[targetIndex];r.ring.material=r.done;r.beam.visible=false;
          if(mode==='sky'){const core=skyOrbs[targetIndex];core.visible=false;core.userData.collectedAt=elapsed;r.ring.visible=false;}
          record(mode==='drone'?'delivery':mode==='sky'?'core':'checkpoint',{index:targetIndex+1,position:p.toArray()});
          targetIndex++;state.score++;hold=0;
          if(targetIndex===cfg.route.length) {state.status='won';state.message=mode==='drone'?'All packages delivered. Precision pays off.':mode==='sky'?'All cores collected. Sky sprint complete.':'All seven beacons cleared. Courier route complete.';record('completed',{seconds:+elapsed.toFixed(2)});}
          else {rings[targetIndex].ring.material=rings[targetIndex].active;rings[targetIndex].beam.material=rings[targetIndex].active;}
        }
      }
      if(elapsed>=cfg.limit)fail('Time expired. Reset and follow the bright beacon.');
      if(mode==='sky'&&bots.some(b=>b.score>=cfg.route.length)&&state.status==='playing')fail('A rival completed the route first. Reset and use boost on straight sections.');
      if(Math.floor(elapsed*2)>replay.length)replay.push({t:+elapsed.toFixed(2),p:state.position.toArray().map(n=>+n.toFixed(3)),yaw:+state.yaw.toFixed(3)});
    } else if(state.status==='won') {
      // The result is final, while vehicles retain a continuous physical pose.
      // Mission elapsed/events remain frozen; fixed ticks still reproduce this epilogue.
      state.continuationTime+=dt;
      if(mode==='drone') {
        state.speed=smooth(state.speed,0,6,dt);
        state.vertical=smooth(state.vertical,0,6,dt);
        state.pitch=smooth(state.pitch,0,4,dt);
      } else {
        state.speed=smooth(state.speed,cfg.speed*.9,1.6,dt);
        state.vertical=smooth(state.vertical,clamp((160-state.position.y)*.035,0,1.3),1.4,dt);
        state.pitch=smooth(state.pitch,-Math.atan2(state.vertical,Math.max(12,state.speed)),3,dt);
        for(const b of bots) {
          b.position.x+=Math.sin(b.yaw)*b.speed*dt;
          b.position.z+=Math.cos(b.yaw)*b.speed*dt;
          b.position.y+=.8*dt;
          b.group.position.copy(b.position);
        }
      }
      state.bank=smooth(state.bank,0,3.5,dt);
      state.position.x+=Math.sin(state.yaw)*state.speed*dt;
      state.position.z+=Math.cos(state.yaw)*state.speed*dt;
      state.position.y+=state.vertical*dt;
    }
    actor.position.copy(state.position);actor.rotation.set(state.pitch,state.yaw,state.bank,'YXZ');
    for(const spin of propellers) {if(mode==='drone')spin.rotation.y+=dt*48;else spin.rotation.z+=dt*38;}
    rings.forEach((r,i)=>{r.ring.visible=i>=(mode==='sky'?targetIndex:Math.max(0,targetIndex-1))&&i<=targetIndex+1;});
    for(const o of skyOrbs) {
      o.rotation.y+=dt*.7;o.rotation.z+=dt*.24;
      // Collected targets must never remain between the chase camera and its aircraft.
      o.visible=o.userData.index>=targetIndex&&o.userData.index<=targetIndex+1;
      const {sparks,collectedAt}=o.userData,age=collectedAt===null?Infinity:elapsed+state.continuationTime-collectedAt;
      sparks.visible=age>=0&&age<.55;
      if(sparks.visible){
        sparks.material.opacity=.38*(1-age/.55);
        const a=sparks.geometry.attributes.position;
        for(let j=0;j<a.count;j++){const phi=j*2.3999632297,z=1-2*(j+.5)/a.count,r=Math.sqrt(1-z*z),spread=.45+age*3.2;a.setXYZ(j,Math.cos(phi)*r*spread,z*spread,Math.sin(phi)*r*spread);}
        a.needsUpdate=true;
      }
    }
  }
  function cameraPose(view='chase') {
    const p=state.position,yaw=state.yaw;
    if(view==='top')return {position:[p.x,p.y+115,p.z+.1],target:p.toArray()};
    if(view==='wide')return {position:[p.x+65,p.y+42,p.z+75],target:[p.x,p.y+1,p.z]};
    const distance=mode==='drone'?20:29;
    return {position:[p.x-Math.sin(yaw)*distance,p.y+(mode==='drone'?9:10),p.z-Math.cos(yaw)*distance],target:[p.x+Math.sin(yaw)*15,p.y+1,p.z+Math.cos(yaw)*15]};
  }
  function hud() {
    const count=cfg.route.length, remaining=Math.max(0,Math.ceil(cfg.limit-elapsed));
    return {title:cfg.title,objective:cfg.objective,primary:`${targetIndex} / ${count} ${mode==='drone'?'deliveries':mode==='sky'?'cores':'beacons'}`,
      secondary:`${Math.round(Math.abs(state.speed)*3.6)} km/h · ${Math.round(state.position.y)} m · ${state.status==='won'?`Finish ${elapsed.toFixed(1)}s`:`${remaining}s`}${mode==='drone'&&hold>0?` · Hover ${Math.round(hold/1.35*100)}%`:''}`,
      progress:targetIndex/count,status:state.status,message:state.message||(mode==='drone'?'W/S throttle · A/D turn · E/Q height · Space boost · Hover to deliver':'W/S speed · A/D turn · E/Q height · Space boost')};
  }
  function snapshot() {
    return {variant:mode,seed:lastSeed,time:+elapsed.toFixed(3),continuationTime:+state.continuationTime.toFixed(3),position:state.position.toArray(),yaw:state.yaw,speed:state.speed,status:state.status,score:state.score,targetIndex,
      gates:cfg.route.map((p,i)=>({position:[...p],passed:i<targetIndex,active:i===targetIndex})),deliveries:mode==='drone'?targetIndex:0,hold,
      bots:bots.map(b=>({position:b.position.toArray(),score:b.score})),events:events.map(e=>({...e})),replay:replay.map(r=>({...r,p:[...r.p]})),world:{width:3600,depth:3000,ceiling:240,arcadePhysics:true}};
  }
  reset(seed);
  return {root,step,cameraPose,hud,snapshot,reset,hero:()=>actor,occluders:()=>{const rows=[];root.traverse(o=>{if(o.isMesh&&o.userData.occluder)rows.push(o);});return rows;},dispose(){clean();root.removeFromParent();}};
}

import {WORLD, terrainHeight, isPond, isBridge} from './world-data.mjs';

/** Original, seeded stylized forest. Metres, Y-up, +Z-forward; not simulated ecology. */
export const recommendedPalette=Object.freeze({sky:'#89aaa5',fog:'#5e8984',ground:'#34584a',petrol:'#153d42',mint:'#a1e3ba',amber:'#ffc67c',key:'#ffe5b5',ambient:'#a3d7cd'});
const TAU=Math.PI*2;
function seedNumber(value){let n=2166136261;for(const c of String(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
function randomSource(seed){let s=seedNumber(seed);return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function segmentDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/d)):0;return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);}
const has=(collection,id)=>collection instanceof Set?collection.has(id):Array.isArray(collection)?collection.includes(id):!!collection?.[id];

export function createWorld(THREE,scene){
  if(!THREE?.InstancedMesh||!scene?.add)throw Error('Foxglade world requires the supplied Three.js scene.');
  const root=new THREE.Group();root.name='foxglade-original-forest';scene.add(root);
  const rand=randomSource(WORLD.seed),geometries=new Set(),materials=new Set(),textures=new Set(),clock={value:0};
  const object=new THREE.Object3D(),color=new THREE.Color(),up=new THREE.Vector3(0,1,0),from=new THREE.Vector3(),to=new THREE.Vector3();
  const stats={seed:WORLD.seed,units:'metres',axes:'Y-up,+Z-forward',terrain:'flat gameplay ground with explicit pond cutout',obstacleCount:WORLD.obstacles.length,renderedObstacleIds:[],instances:{},placement:{attempted:0,rejected:0},drawObjects:0,estimatedDrawCalls:0,triangles:0,animatedWisps:WORLD.wisps.length,shrines:WORLD.shrines.length,water:'authored fresnel sheen and moving ripples, not a scene reflection or fluid simulation',collisionScope:'Solid gameplay trunks/rocks correspond to WORLD.obstacles; ornaments, bridge edge ropes and shrine/den decoration are not additional collision solvers'};
  const geo=g=>(geometries.add(g),g),mat=m=>(materials.add(m),m);
  const standard=(hex,extra={})=>mat(new THREE.MeshStandardMaterial({color:hex,roughness:.9,flatShading:true,...extra}));
  const basic=(hex,extra={})=>mat(new THREE.MeshBasicMaterial({color:hex,...extra}));
  const rockMat=standard('#607c75'),barkMat=standard('#5d5140'),leafMat=standard('#386e59'),woodMat=standard('#ac8860'),darkWood=standard('#584c3b'),goldMat=standard('#d6ab66');
  function mesh(name,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo(geometry),material);m.name=name;m.position.set(x,y,z);m.receiveShadow=true;root.add(m);return m;}
  function instances(name,geometry,material,rows,{shadow=true}={}){
    const g=geo(geometry);
    // Palette values are intended colors, not a second tint multiplied by the shared material.
    let instanceMaterial=material;
    if(rows.some(row=>row.color)){instanceMaterial=mat(material.clone());instanceMaterial.color.set('#ffffff');instanceMaterial.onBeforeCompile=material.onBeforeCompile;instanceMaterial.customProgramCacheKey=material.customProgramCacheKey;}
    const m=new THREE.InstancedMesh(g,instanceMaterial,Math.max(1,rows.length));m.name=name;m.count=rows.length;m.castShadow=shadow;m.receiveShadow=true;m.frustumCulled=false;
    for(let i=0;i<rows.length;i++){const r=rows[i];object.position.set(r.x??0,r.y??0,r.z??0);object.rotation.set(r.rx??0,r.ry??0,r.rz??0);object.scale.set(r.sx??1,r.sy??1,r.sz??1);object.updateMatrix();m.setMatrixAt(i,object.matrix);if(r.color)m.setColorAt(i,color.set(r.color));}
    m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;root.add(m);stats.instances[name]=rows.length;return m;
  }
  function linkRow(a,b,radius,colorValue){from.set(a[0],a[1],a[2]);to.set(b[0],b[1],b[2]);const delta=to.clone().sub(from),q=new THREE.Quaternion().setFromUnitVectors(up,delta.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q);return{x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,z:(a[2]+b[2])/2,rx:e.x,ry:e.y,rz:e.z,sx:radius,sy:delta.length(),sz:radius,color:colorValue};}
  function windMaterial(hex,amount=.12){
    const m=standard(hex,{side:THREE.DoubleSide});
    m.onBeforeCompile=shader=>{shader.uniforms.uForestTime=clock;shader.vertexShader='uniform float uForestTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec2 windBase=instanceMatrix[3].xz;
      float leafHeight=max(position.y,0.0);
      transformed.x+=sin(uForestTime*1.35+windBase.x*.4+windBase.y*.3)*leafHeight*${amount.toFixed(4)};
      transformed.z+=cos(uForestTime*.83+windBase.x*.23)*leafHeight*${(amount*.45).toFixed(4)};
      #endif`);};m.customProgramCacheKey=()=>`foxglade-wind-${amount}`;return m;
  }
  const pond=WORLD.pond,b=WORLD.bridge;
  const bridgeMin=b.xMin??b.minX??b.x?.[0],bridgeMax=b.xMax??b.maxX??b.x?.[1];
  if(![pond.x,pond.z,pond.radius,bridgeMin,bridgeMax,b.z,b.width,b.deckY].every(Number.isFinite))throw Error('WORLD pond/bridge geometry contract is incomplete.');
  const spawn=WORLD.spawn,den=WORLD.den;
  const landmarks=[spawn,den,...WORLD.wisps,...WORLD.shrines];
  const anchors=[spawn,{x:bridgeMin-1.3,z:b.z},{x:bridgeMax+1.3,z:b.z},...WORLD.shrines];
  const corridors=(WORLD.route??[]).slice(1).map((point,index)=>[WORLD.route[index],point]);
  for(const p of [...WORLD.wisps,...WORLD.shrines]){const nearest=[...anchors].sort((a,c)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(p.x-c.x,p.z-c.z))[0];if(nearest) corridors.push([nearest,p]);}
  corridors.push([spawn,{x:bridgeMin-1.3,z:b.z}],[{x:bridgeMin-1.3,z:b.z},{x:bridgeMax+1.3,z:b.z}]);
  function safe(x,z,margin=.3){
    if(Math.hypot(x,z)>WORLD.radius-1||Math.hypot(x-pond.x,z-pond.z)<pond.radius+margin||isBridge(x,z))return false;
    if(landmarks.some(p=>Math.hypot(x-p.x,z-p.z)<2.3+margin))return false;
    if(WORLD.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+margin))return false;
    return !corridors.some(([a,c])=>segmentDistance(x,z,a,c)<1.25+margin);
  }
  function scatter(count,margin,fn){const rows=[];for(let n=0;n<count*12&&rows.length<count;n++){stats.placement.attempted++;const angle=rand()*TAU,r=Math.sqrt(rand())*(WORLD.radius-1),x=Math.cos(angle)*r,z=Math.sin(angle)*r;if(!safe(x,z,margin)){stats.placement.rejected++;continue;}rows.push(fn(x,z,rows.length));}return rows;}

  // The playable land actually has a hole: water does not sit over a hidden solid floor.
  const land=new THREE.Shape();land.absarc(0,0,WORLD.radius+7,0,TAU,false);const hole=new THREE.Path();hole.absarc(pond.x,-pond.z,pond.radius,0,TAU,true);land.holes.push(hole);
  const ground=mesh('flat-grassland-with-pond-cutout',new THREE.ShapeGeometry(land,100),standard('#41634f'));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;
  const groundMaterial=ground.material;groundMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vForestPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvForestPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='varying vec3 vForestPosition;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float groundPatch=sin(vForestPosition.x*.47)*cos(vForestPosition.z*.39)+sin(vForestPosition.x*.13+vForestPosition.z*.31)*.65;
      diffuseColor.rgb*=.94+groundPatch*.065;`);
  };groundMaterial.customProgramCacheKey=()=> 'foxglade-ground-patches-v2';
  // A continuous, softly colored trail makes the shared playable route legible.
  // This is surface decoration only; walkable support still comes from WORLD.
  const trailPositions=[],trailColors=[],trailIndices=[],trailColor=new THREE.Color();
  const trailCurve=new THREE.CatmullRomCurve3(WORLD.route.map(p=>new THREE.Vector3(p.x,.013,p.z)),false,'centripetal');
  const trailPoints=trailCurve.getPoints(420);
  // Shared edges, including the closed route seam, prevent cracks at every bend.
  for(let i=0;i<trailPoints.length;i++){
    const previous=trailPoints[i===0?trailPoints.length-2:i-1],next=trailPoints[i===trailPoints.length-1?1:i+1];
    const tangent=next.clone().sub(previous).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(.83);
    for(const side of [1,-1]){const v=trailPoints[i].clone().addScaledVector(normal,side);trailPositions.push(v.x,v.y,v.z);trailColor.set(side===1?'#8c9464':'#849263');trailColors.push(trailColor.r,trailColor.g,trailColor.b);}
    if(i<trailPoints.length-1&&!isPond(trailPoints[i].x,trailPoints[i].z)&&!isPond(trailPoints[i+1].x,trailPoints[i+1].z))trailIndices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
  }
  const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.Float32BufferAttribute(trailPositions,3));trailGeometry.setAttribute('color',new THREE.Float32BufferAttribute(trailColors,3));trailGeometry.setIndex(trailIndices);trailGeometry.computeVertexNormals();
  mesh('woodland-walking-trail',trailGeometry,standard('#ffffff',{vertexColors:true,roughness:1,side:THREE.DoubleSide}));
  const bank=mesh('soft-moss-pond-bank',new THREE.RingGeometry(pond.radius-.04,pond.radius+.38,96),standard('#6e8b66'),pond.x,.007,pond.z);bank.rotation.x=-Math.PI/2;
  const bankWall=mesh('visible-pond-bank-depth',new THREE.CylinderGeometry(pond.radius,pond.radius-.35,.7,96,1,true),standard('#31594e',{side:THREE.DoubleSide}),pond.x,-.34,pond.z);
  const bottom=mesh('pond-depth-color',new THREE.CircleGeometry(pond.radius,96),standard('#123f43'),pond.x,-.72,pond.z);bottom.rotation.x=-Math.PI/2;
  const waterMat=mat(new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uCenter:{value:new THREE.Vector2(pond.x,pond.z)},uRadius:{value:pond.radius}}]),vertexShader:`varying vec3 vWorld;
    #include <fog_pars_vertex>
    void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,fragmentShader:`uniform float uTime;uniform vec2 uCenter;uniform float uRadius;varying vec3 vWorld;
    #include <fog_pars_fragment>
    void main(){vec2 p=vWorld.xz-uCenter;float a=sin(p.x*2.5+p.y*1.6+uTime*.8);float c=cos(p.x*1.3-p.y*2.4-uTime*.65);
    vec3 n=normalize(vec3(a*.055,1.0,c*.045));vec3 eye=normalize(cameraPosition-vWorld);float fresnel=pow(1.0-max(dot(n,eye),0.0),3.0);
    vec3 water=mix(vec3(.07,.25,.28),vec3(.39,.62,.60),fresnel*.85);float band=pow(max(0.0,sin(p.x*.45+p.y*1.6+uTime*.55)),24.0);
    float shore=smoothstep(uRadius-.35,uRadius,length(p));water+=vec3(.24,.35,.25)*band*.16;water=mix(water,vec3(.32,.52,.43),shore*.45);
    gl_FragColor=vec4(water,.92);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    }`}));
  const water=mesh('animated-stylized-pond',new THREE.CircleGeometry(pond.radius-.03,96),waterMat,pond.x,-.12,pond.z);water.rotation.x=-Math.PI/2;water.renderOrder=1;

  const trunks=[],branches=[],roots=[],crowns=[],tips=[],rocks=[],rockMoss=[];
  for(const o of WORLD.obstacles){
    stats.renderedObstacleIds.push(o.id);const angle=Number.isFinite(o.rotation)?o.rotation:rand()*TAU,y=terrainHeight(o.x,o.z);
    if(String(o.type).includes('rock')){
      const h=o.height??o.radius*1.25;rocks.push({x:o.x,y:y+h*.37,z:o.z,ry:angle,sx:o.radius,sy:h*.67,sz:o.radius,color:['#6e8175','#758879','#5d776f'][Math.floor(rand()*3)]});
      rockMoss.push({x:o.x-.1,y:y+h*.72,z:o.z,ry:angle,sx:o.radius*.8,sy:h*.22,sz:o.radius*.77,color:'#557d58'});continue;
    }
    const h=o.height??(7+rand()*4),r=o.radius;
    trunks.push({x:o.x,y:y+h*.48,z:o.z,ry:angle,sx:r,sy:h,sz:r,color:['#6d5b43','#605341','#756248'][Math.floor(rand()*3)]});
    for(let k=0;k<3;k++){const a=angle+k*TAU/3;roots.push(linkRow([o.x,y+.5,o.z],[o.x+Math.sin(a)*r*.75,y+.04,o.z+Math.cos(a)*r*.75],r*.2,'#5c513d'));}
    for(let k=0;k<3;k++){const a=angle+k*2.1,bh=y+h*(.59+k*.08),reach=Math.max(1.7,r*2);branches.push(linkRow([o.x,bh,o.z],[o.x+Math.sin(a)*reach,bh+.9,o.z+Math.cos(a)*reach],r*.2,'#61543f'));}
    const cr=Math.max(2.2,r*3.3);crowns.push({x:o.x,y:y+h*.86,z:o.z,ry:angle,sx:cr,sy:cr*.72,sz:cr,color:['#35674e','#3c7355','#4b7c57','#2c6051'][Math.floor(rand()*4)]});
    tips.push({x:o.x+cr*.35,y:y+h*.96,z:o.z-cr*.18,ry:-angle,sx:cr*.73,sy:cr*.53,sz:cr*.73,color:'#5b8960'});
  }
  instances('collidable-tree-trunks',new THREE.CylinderGeometry(.74,1,1,8),barkMat,trunks);
  instances('tree-root-buttresses',new THREE.CylinderGeometry(.6,1,1,6),barkMat,roots);
  instances('lifted-tree-branches',new THREE.CylinderGeometry(.55,1,1,6),barkMat,branches);
  instances('layered-forest-canopies',new THREE.IcosahedronGeometry(1,1),leafMat,crowns);
  instances('sunlit-canopy-clusters',new THREE.IcosahedronGeometry(1,1),leafMat,tips);
  instances('collidable-faceted-rocks',new THREE.IcosahedronGeometry(1,1),rockMat,rocks);
  instances('rock-moss-caps',new THREE.IcosahedronGeometry(1,0),leafMat,rockMoss);

  // Soft scenery beyond the gameplay radius hides the bounded terrain edge.
  const ridge=[],farTrees=[],farCrowns=[];
  for(let i=0;i<50;i++){const a=i*TAU/50,r=WORLD.radius+5+rand()*6,h=4+rand()*9;ridge.push({x:Math.cos(a)*r,y:h*.22,z:Math.sin(a)*r,sx:5+rand()*4,sy:h,sz:5+rand()*4,color:i%2?'#345c59':'#426e63'});}
  for(let i=0;i<110;i++){const a=rand()*TAU,r=WORLD.radius+4+rand()*12,h=10+rand()*8,x=Math.cos(a)*r,z=Math.sin(a)*r;farTrees.push({x,y:h*.4,z,sx:.65,sy:h,sz:.65});farCrowns.push({x,y:h*.8,z,sx:3.4+rand()*2,sy:4.2+rand()*2,sz:3.4+rand()*2,color:i%3?'#2a5951':'#457566'});}
  instances('scenic-outer-ridges',new THREE.IcosahedronGeometry(1,0),standard('#365f58'),ridge,{shadow:false});
  instances('distant-tree-columns',new THREE.CylinderGeometry(.6,1,1,5),barkMat,farTrees,{shadow:false});
  instances('distant-canopy-silhouettes',new THREE.IcosahedronGeometry(1,0),leafMat,farCrowns,{shadow:false});

  function bladeGeometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.12,0,0,.12,0,0,.07,.45,.02,-.12,0,0,.07,.45,.02,-.01,.85,.05],3));g.computeVertexNormals();return g;}
  const grassRows=scatter(2400,.2,(x,z)=>({x,y:.008,z,ry:rand()*TAU,sx:.7+rand(),sy:.18+rand()*.42,sz:1,color:['#5c925f','#739c60','#448264','#8fae6d'][Math.floor(rand()*4)]}));
  instances('wind-meadow-blades',bladeGeometry(),windMaterial('#6d9863',.16),grassRows,{shadow:false});
  const fernShape=new THREE.Shape();fernShape.moveTo(0,0);for(let i=1;i<=8;i++){const y=i*.11,width=(1-y)*.38;fernShape.lineTo(-width,y-.05);fernShape.lineTo(-.035,y);}fernShape.lineTo(0,1);for(let i=8;i>=1;i--){const y=i*.11,width=(1-y)*.38;fernShape.lineTo(.035,y);fernShape.lineTo(width,y-.05);}fernShape.closePath();
  const fernRows=[];for(const r of scatter(130,.35,(x,z)=>({x,z}))){for(let i=0;i<5;i++)fernRows.push({x:r.x,y:.01,z:r.z,ry:i*TAU/5,rx:.65,sy:.55+rand()*.55,sx:.8,sz:1,color:'#4b936e'});}
  instances('five-frond-fern-patches',new THREE.ShapeGeometry(fernShape),windMaterial('#4b936e',.08),fernRows,{shadow:false});
  const flowers=scatter(360,.15,(x,z)=>{const height=.20+rand()*.25;return{x,y:height/2,z,ry:rand()*TAU,sx:.035,sy:height,sz:.035,color:'#718d58'};});
  instances('wildflower-stems',new THREE.CylinderGeometry(1,1,1,4),leafMat,flowers,{shadow:false});
  instances('wildflower-heads',new THREE.IcosahedronGeometry(1,0),standard('#d5c68f'),flowers.map(r=>({...r,y:r.y+r.sy*.5,sx:.08,sy:.04,sz:.08,color:rand()>.55?'#e7c480':'#a6d8b2'})),{shadow:false});
  const mushrooms=scatter(85,.4,(x,z)=>({x,y:.14,z,ry:rand()*TAU,sx:.065,sy:.28,sz:.065}));
  instances('mushroom-stalks',new THREE.CylinderGeometry(.8,1,1,6),standard('#d1cbb0'),mushrooms,{shadow:false});
  instances('mushroom-caps',new THREE.SphereGeometry(1,10,6,0,TAU,0,Math.PI/2),standard('#c88a68'),mushrooms.map(r=>({...r,y:.28,sx:.24,sy:.12,sz:.24,color:rand()>.45?'#d39870':'#81b9ac'})),{shadow:false});
  const reeds=[],lilies=[];
  for(let i=0;i<150;i++){const a=rand()*TAU,r=pond.radius+.24+rand()*.5,x=pond.x+Math.cos(a)*r,z=pond.z+Math.sin(a)*r;if(Math.abs(z-b.z)<b.width/2+.65)continue;reeds.push({x,y:0,z,ry:rand()*TAU,sx:.6,sy:.65+rand()*.65,sz:1,color:'#79a47b'});}
  for(let i=0;i<22;i++){const a=rand()*TAU,r=pond.radius*(.58+rand()*.3),x=pond.x+Math.cos(a)*r,z=pond.z+Math.sin(a)*r;if(isBridge(x,z))continue;lilies.push({x,y:-.105,z,rx:-Math.PI/2,rz:rand()*TAU,sx:.28+rand()*.18,sy:.28+rand()*.18,sz:1,color:'#78a37e'});}
  instances('waterside-reeds',bladeGeometry(),windMaterial('#79a47b',.10),reeds,{shadow:false});
  instances('pond-lily-pads',new THREE.CircleGeometry(1,12,0,TAU*.94),standard('#83aa80',{side:THREE.DoubleSide}),lilies,{shadow:false});

  const planks=[],beams=[],posts=[];const bridgeLength=bridgeMax-bridgeMin;
  for(let x=bridgeMin+.2;x<bridgeMax;x+=.45)planks.push({x,y:b.deckY-.07,z:b.z,sx:.43,sy:.14,sz:b.width,color:Math.floor((x-bridgeMin)/.45)%3?'#aa875c':'#bc986b'});
  for(const side of [-1,1]){beams.push({x:(bridgeMin+bridgeMax)/2,y:b.deckY-.20,z:b.z+side*b.width*.32,sx:bridgeLength,sy:.2,sz:.18});for(let i=0;i<=5;i++)posts.push({x:bridgeMin+i*bridgeLength/5,y:b.deckY+.38,z:b.z+side*(b.width/2+.15),sx:.11,sy:1.05,sz:.11});}
  instances('bridge-top-planks',new THREE.BoxGeometry(1,1,1),woodMat,planks);
  instances('bridge-underbeams',new THREE.BoxGeometry(1,1,1),darkWood,beams);
  instances('bridge-edge-posts',new THREE.CylinderGeometry(.85,1,1,8),darkWood,posts);
  for(const side of [-1,1]){
    const pts=[];for(let i=0;i<=80;i++){const x=bridgeMin+bridgeLength*i/80,local=(i/80*5)%1;pts.push(new THREE.Vector3(x,b.deckY+.85-Math.sin(local*Math.PI)*.14,b.z+side*(b.width/2+.15)));}
    const rope=mesh(`bridge-rope-${side}`,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),120,.025,5,false),standard('#c5b98c'));rope.castShadow=true;
  }

  const denStone=mat(rockMat.clone());denStone.transparent=true;
  const denArch=mesh('den-stone-arch',new THREE.TorusGeometry(2.1,.36,7,20,Math.PI),denStone,den.x,.72,den.z+.45);denArch.castShadow=true;
  const denFeet=instances('den-arch-feet',new THREE.CylinderGeometry(.37,.45,.82,7),denStone,[-1,1].map(s=>({x:den.x+s*2.1,y:.41,z:den.z+.45})));
  const denLeaves=[];for(let i=0;i<13;i++){const a=Math.PI*i/12;denLeaves.push({x:den.x+Math.cos(a)*2.1,y:.9+Math.sin(a)*2.1,z:den.z+.47,sx:.42,sy:.29,sz:.5,color:'#73935d'});}
  const denMoss=instances('den-arch-moss',new THREE.IcosahedronGeometry(1,0),leafMat,denLeaves);denMoss.material.transparent=true;
  const denBounds=new THREE.Box3(new THREE.Vector3(den.x-2.6,0,den.z+.06),new THREE.Vector3(den.x+2.6,3.5,den.z+1.1));
  const denRay=new THREE.Ray(),denTarget=new THREE.Vector3(),denHit=new THREE.Vector3(),denDirection=new THREE.Vector3();
  const denSeal=mesh('den-return-medallion',new THREE.RingGeometry(.95,1.08,48),basic('#d5bf83',{transparent:true,opacity:.7}),den.x,.018,den.z);denSeal.rotation.x=-Math.PI/2;

  const shrineStones=[],shrinePillars=[];
  for(const s of WORLD.shrines){for(let i=0;i<10;i++){const a=i*TAU/10;shrineStones.push({x:s.x+Math.cos(a)*1.5,y:.08,z:s.z+Math.sin(a)*1.5,ry:a,sx:.22,sy:.11,sz:.14});}for(const sign of [-1,1])shrinePillars.push({x:s.x+sign*1.8,y:1.15,z:s.z-.85,sx:.24,sy:2.3,sz:.24,color:'#6c8579'});}
  instances('shrine-ground-stone-rings',new THREE.IcosahedronGeometry(1,0),rockMat,shrineStones);
  instances('shrine-flanking-pillars',new THREE.CylinderGeometry(.8,1,1,6),rockMat,shrinePillars);
  const shrineCores=instances('shrine-floating-crystals',new THREE.OctahedronGeometry(1,0),standard('#9ee3bf',{emissive:'#6ecfa8',emissiveIntensity:.65,metalness:.15,roughness:.35}),WORLD.shrines.map(s=>({x:s.x,y:2.65,z:s.z,sx:.32,sy:.56,sz:.32})),{shadow:false});
  const shrineRings=instances('shrine-activation-runes',new THREE.RingGeometry(1.08,1.16,48),basic('#8bd9ba',{transparent:true,opacity:.8,side:THREE.DoubleSide}),WORLD.shrines.map(s=>({x:s.x,y:.021,z:s.z,rx:-Math.PI/2})),{shadow:false});
  const shrineHalos=instances('shrine-crystal-halos',new THREE.SphereGeometry(1,12,8),basic('#8fe4c8',{transparent:true,opacity:.08,blending:THREE.AdditiveBlending,depthWrite:false}),WORLD.shrines.map(s=>({x:s.x,y:2.65,z:s.z,sx:.68,sy:.9,sz:.68})),{shadow:false});

  const wispMat=basic('#ffe2a2'),haloMat=basic('#ffc77d',{transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false});
  const wisps=instances('collectible-wisp-cores',new THREE.IcosahedronGeometry(1,1),wispMat,WORLD.wisps.map(s=>({x:s.x,y:1.1,z:s.z,sx:.15,sy:.21,sz:.15})),{shadow:false});
  const wings=instances('articulated-wisp-wings',new THREE.SphereGeometry(1,8,5),basic('#faecc0',{transparent:true,opacity:.8,depthWrite:false}),WORLD.wisps.flatMap(s=>[-1,1].map(sign=>({x:s.x+sign*.22,y:1.15,z:s.z,sx:.19,sy:.05,sz:.09}))),{shadow:false});
  const halos=instances('wisp-soft-halos',new THREE.SphereGeometry(1,10,7),haloMat,WORLD.wisps.map(s=>({x:s.x,y:1.1,z:s.z,sx:.4,sy:.44,sz:.4})),{shadow:false});
  const wispRings=instances('wisp-ground-hints',new THREE.RingGeometry(.40,.45,32),basic('#d7c487',{transparent:true,opacity:.55,side:THREE.DoubleSide}),WORLD.wisps.map(s=>({x:s.x,y:(isBridge(s.x,s.z)?b.deckY:0)+.018,z:s.z,rx:-Math.PI/2})),{shadow:false});
  const moteCount=130,motePositions=new Float32Array(moteCount*3),moteData=[];
  for(let i=0;i<moteCount;i++){const a=rand()*TAU,r=Math.sqrt(rand())*WORLD.radius;moteData.push({x:Math.cos(a)*r,z:Math.sin(a)*r,y:.7+rand()*4.5,phase:rand()*TAU});}
  const moteGeometry=geo(new THREE.BufferGeometry());moteGeometry.setAttribute('position',new THREE.BufferAttribute(motePositions,3));
  const motes=new THREE.Points(moteGeometry,mat(new THREE.PointsMaterial({color:'#e3da9e',size:.055,sizeAttenuation:true,transparent:true,opacity:.58,depthWrite:false,blending:THREE.AdditiveBlending})));motes.name='dusk-firefly-points';root.add(motes);
  function put(m,index,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){object.position.set(x,y,z);object.rotation.set(rx,ry,rz);object.scale.set(sx,sy,sz);object.updateMatrix();m.setMatrixAt(index,object.matrix);}
  function update(time,state={},cameraPosition=null){
    const t=Number.isFinite(time)?time:0;clock.value=t;waterMat.uniforms.uTime.value=t;
    // Fade only this decorative arch when it lies between the camera and hero.
    // This is an occlusion aid, not additional collision or learned motion.
    let denOccludes=false;
    if(cameraPosition&&[state.x,state.y,state.z].every(Number.isFinite)){
      denTarget.set(state.x,state.y+.55,state.z);denDirection.subVectors(denTarget,cameraPosition);
      const distance=denDirection.length();denRay.set(cameraPosition,denDirection.normalize());
      denOccludes=distance>.05&&!!denRay.intersectBox(denBounds,denHit)&&denHit.distanceTo(cameraPosition)<distance;
    }
    const denOpacity=denOccludes?.13:1;
    for(const node of [denArch,denFeet,denMoss]){node.material.opacity=denOpacity;node.material.depthWrite=!denOccludes;node.castShadow=!denOccludes;}
    stats.denOcclusionFade=denOccludes;
    const sniff=Number(state.sniffUntil)>(Number.isFinite(state.time)?state.time:t);
    for(let i=0;i<WORLD.wisps.length;i++){
      const w=WORLD.wisps[i],collected=has(state.collectedIds,w.id),scale=collected?0:1,phase=i*2.399,y=(isBridge(w.x,w.z)?b.deckY:0)+1.05+Math.sin(t*1.9+phase)*.16;
      put(wisps,i,w.x,y,w.z,.15*scale,.21*scale,.15*scale,0,t*.4+phase,Math.sin(t+phase)*.15);
      put(halos,i,w.x,y,w.z,(sniff ? .65 : .4)*scale,(sniff ? .7 : .44)*scale,(sniff ? .65 : .4)*scale);
      for(let side=0;side<2;side++){const sign=side?1:-1,flap=Math.sin(t*11+phase)*.5;put(wings,i*2+side,w.x+sign*.2,y+.04,w.z,.20*scale,.045*scale,.09*scale,0,0,sign*(.3+flap));}
      put(wispRings,i,w.x,(isBridge(w.x,w.z)?b.deckY:0)+.018,w.z,(sniff?1.4:1)*scale,(sniff?1.4:1)*scale,scale,-Math.PI/2);
    }
    for(let i=0;i<WORLD.shrines.length;i++){
      const s=WORLD.shrines[i],active=has(state.activatedIds,s.id),y=2.65+Math.sin(t*.9+i)*.1;
      put(shrineCores,i,s.x,y,s.z,.32,.56,.32,0,t*.18+i,0);shrineCores.setColorAt(i,color.set(active?'#d6ffe3':'#628c7a'));
      put(shrineHalos,i,s.x,y,s.z,active ? .9 : .45,active?1.1:.6,active ? .9 : .45);shrineRings.setColorAt(i,color.set(active?'#d5ffca':'#527269'));
    }
    for(let i=0;i<moteCount;i++){const m=moteData[i];motePositions[i*3]=m.x+Math.sin(t*.27+m.phase)*.25;motePositions[i*3+1]=m.y+Math.sin(t*.52+m.phase)*.3;motePositions[i*3+2]=m.z+Math.cos(t*.3+m.phase)*.25;}
    for(const m of [wisps,wings,halos,wispRings,shrineCores,shrineHalos])m.instanceMatrix.needsUpdate=true;
    shrineCores.instanceColor.needsUpdate=true;shrineRings.instanceColor.needsUpdate=true;moteGeometry.attributes.position.needsUpdate=true;
    stats.visibleWisps=WORLD.wisps.filter(w=>!has(state.collectedIds,w.id)).length;stats.activeShrines=WORLD.shrines.filter(s=>has(state.activatedIds,s.id)).length;stats.sniffVisible=sniff;
  }
  root.traverse(node=>{if(node.isMesh||node.isPoints){stats.drawObjects++;stats.estimatedDrawCalls+=1;const g=node.geometry,count=g?.index?.count??g?.attributes?.position?.count??0;stats.triangles+=node.isPoints?0:Math.floor(count/3)*(node.isInstancedMesh?node.count:1);}});
  stats.protectedVegetationCorridors=corridors.length;stats.recommendedPalette=recommendedPalette;
  update(0,{});let disposed=false;
  return{update,stats,recommendedPalette,root,dispose(){if(disposed)return;disposed=true;scene.remove(root);root.traverse(n=>{if(n.isInstancedMesh)n.dispose();});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();root.clear();}};
}

import {WIDTH,HEIGHT,DURATION,stateAt,chapterAt,captionAt,poseFingerprint,TRAIL_BONES,clamp} from './model.mjs';

const FONT='"Segoe UI", Arial, sans-serif';
const P={bg:'#071b22',panel:'#102b33',line:'#28464d',ink:'#f0faf5',muted:'#a8c4c4',mint:'#8fe8cb',apricot:'#ffbf8f',blue:'#91c8e8'};
const rounded=(c,x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}};
const text=(c,s,x,y,size,color=P.ink,weight=600)=>{c.font=`${weight} ${size}px ${FONT}`;c.fillStyle=color;c.fillText(String(s),x,y);};
function lines(c,s,width,size,weight=600){c.font=`${weight} ${size}px ${FONT}`;const out=[];let line='';for(const word of String(s??'').split(/\s+/)){const next=line?`${line} ${word}`:word;if(line&&c.measureText(next).width>width){out.push(line);line=word;}else line=next;}if(line)out.push(line);return out;}
function block(c,s,{x,y,w,size=36,lineHeight=44,max=3,color=P.ink,weight=600},warnings,label){const a=lines(c,s,w,size,weight);if(a.length>max)warnings.push(`${label}-text-overflow`);a.slice(0,max).forEach((v,i)=>text(c,v,x,y+i*lineHeight,size,color,weight));return a.length;}
function stroke(c,points,color,width=2){if(points.length<2)return;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.stroke();}
function circle(c,x,y,r,fill,strokeColor){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();if(strokeColor){c.lineWidth=1.5;c.strokeStyle=strokeColor;c.stroke();}}
const round=n=>Number(n.toFixed(7));

function createRigStage(THREE,library,clip){
  if(!THREE||!library?.createInstance)throw Error('The verified Three.js runtime and supplied rig library are required.');
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const world=new THREE.Scene();world.add(new THREE.HemisphereLight(0xe2fff3,0x18333d,1.7));
  const key=new THREE.DirectionalLight(0xffeddb,2.9);key.position.set(4,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.bias=-.0003;world.add(key);
  const rim=new THREE.DirectionalLight(0x8fdcce,1.7);rim.position.set(-4,4,-5);world.add(rim);
  const fill=new THREE.DirectionalLight(0x9ec8e2,.7);fill.position.set(4,2,-1);world.add(fill);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(2.7,2.77,.13,80),new THREE.MeshStandardMaterial({color:0x183a43,roughness:.88,metalness:.1}));
  platform.position.y=-.11;platform.receiveShadow=true;world.add(platform);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.5,.009,8,96),new THREE.MeshBasicMaterial({color:0x436c70}));ring.rotation.x=Math.PI/2;ring.position.y=-.037;world.add(ring);
  const instances=new Map();
  for(const id of ['surface','wire','skeleton','profile']){
    const inst=library.createInstance('fox');
    if(!inst.clips.some(c=>c.name===clip))throw Error(`The supplied fox does not have the required ${clip} clip.`);
    inst.root.name=`microscope-${id}`;inst.root.visible=false;world.add(inst.root);instances.set(id,inst);
    inst.root.traverse(node=>{
      if(!node.isMesh)return;
      const mats=Array.isArray(node.material)?node.material:[node.material];
      mats.forEach(m=>{if(id==='wire'){m.color?.set(0x91e7cc);m.map=null;}if(id==='skeleton'){m.color?.set(0x698b8e);m.map=null;}});
    });
  }
  const sampler=library.createInstance('fox');
  const duration=sampler.clips.find(c=>c.name===clip).duration;
  const vector=new THREE.Vector3(),union=new THREE.Box3();
  const boneLookup=new Map();sampler.root.traverse(n=>{if(n.isBone)boneLookup.set(n.name,n);});
  for(const item of TRAIL_BONES)if(!boneLookup.has(item.name))throw Error(`Required bone ${item.name} is missing from the supplied fox.`);
  // Cache actual clip samples, not interpolated trajectories or invented contact arcs.
  const sampleCount=180, samples=[];
  for(let i=0;i<=sampleCount;i++){
    const clipTime=duration*i/sampleCount;sampler.seek(clipTime,clip);sampler.root.updateMatrixWorld(true);
    if(i%6===0)union.union(new THREE.Box3().setFromObject(sampler.root,true));
    const bones={};for(const b of TRAIL_BONES){boneLookup.get(b.name).getWorldPosition(vector);bones[b.name]=vector.toArray();}
    samples.push({clipTime,bones});
  }
  sampler.dispose();
  if(union.isEmpty())throw Error('Animated rig bounds are empty.');
  const center=union.getCenter(new THREE.Vector3());
  const cameras=new Map();let renderSize='';
  function cameraFor(id,w,h){
    const key=`${id}:${w}:${h}`;if(cameras.has(key))return cameras.get(key);
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
    // True orthographic side view: no yaw or automatic turntable drift.
    const direction=id==='profile'?new THREE.Vector3(1,.13,0):new THREE.Vector3(1,.38,.92);
    camera.position.copy(center).add(direction.normalize().multiplyScalar(12));camera.lookAt(center);camera.updateMatrixWorld(true);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [union.min.x,union.max.x])for(const y of [union.min.y,union.max.y])for(const z of [union.min.z,union.max.z]){
      vector.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);minX=Math.min(minX,vector.x);maxX=Math.max(maxX,vector.x);minY=Math.min(minY,vector.y);maxY=Math.max(maxY,vector.y);
    }
    const aspect=w/h,halfH=Math.max((maxY-minY)/2,(maxX-minX)/2/aspect)*1.17;
    camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();
    cameras.set(key,camera);return camera;
  }
  function project(position,camera,w,h){const q=vector.fromArray(position).project(camera);return {x:(q.x+1)*w/2,y:(1-q.y)*h/2,z:q.z};}
  function currentGeometry(inst,camera,w,h){
    const bones=[];inst.root.traverse(node=>{if(!node.isBone)return;node.getWorldPosition(vector);const worldPosition=vector.toArray();const point=project(worldPosition,camera,w,h);let parent=null;if(node.parent?.isBone){node.parent.getWorldPosition(vector);parent=project(vector.toArray(),camera,w,h);}bones.push({name:node.name,world:worldPosition.map(round),point,parent});});
    const box=new THREE.Box3().setFromObject(inst.root,true);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=project([x,y,z],camera,w,h);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    return {bones,bounds:{x:minX,y:minY,w:maxX-minX,h:maxY-minY},inside:minX>=0&&minY>=0&&maxX<=w&&maxY<=h};
  }
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  const backend={backend:'Canvas2D + Three.js WebGL2',threeReady:true,threeRevision:THREE.REVISION,pixelRatio:1,outputColorSpace:'sRGB',toneMapping:'ACESFilmic',webglRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),stageError:null};
  return {
    backend,clipDuration:duration,
    render(panel,s,w,h){
      const inst=instances.get(panel.id);for(const i of instances.values())i.root.visible=i===inst;
      inst.setView(panel.view);inst.seek(s.poseTime,s.clip);inst.root.rotation.set(0,0,0);inst.root.updateMatrixWorld(true);
      // Thick readable bones are projected from actual nodes below, avoiding WebGL's one-pixel line limit.
      inst.root.traverse(n=>{if(n.isSkeletonHelper)n.visible=false;});
      const camera=cameraFor(panel.id,w,h),size=`${w}x${h}`;if(renderSize!==size){renderer.setSize(w,h,false);renderSize=size;}
      world.updateMatrixWorld(true);renderer.render(world,camera);
      const geometry=currentGeometry(inst,camera,w,h),pose=inst.samplePose();
      const paths=[];
      if(s.trailsEnabled&&panel.id==='profile')for(const target of TRAIL_BONES){
        const points=[];
        for(let n=0;n<s.trailSampleCount;n++){
          const requested=s.poseTime-s.trailWindow+(s.trailWindow*n/(s.trailSampleCount-1));
          const wrapped=((requested%duration)+duration)%duration,index=Math.round(wrapped/duration*sampleCount),sample=samples[index];
          points.push({...project(sample.bones[target.name],camera,w,h),clipTime:sample.clipTime,world:sample.bones[target.name].map(round)});
        }
        paths.push({...target,points,kind:'sampled-bone-world-history',requestedWindowSeconds:s.trailWindow,maximumSamplingErrorSeconds:duration/sampleCount/2});
      }
      return {image:renderer.domElement,geometry,paths,receipt:{asset:'fox',view:panel.id,renderView:panel.view,clip:s.clip,poseTime:s.poseTime,clipTime:((s.poseTime%duration)+duration)%duration,clipDuration:duration,poseFingerprint:poseFingerprint(pose.bones),boneCount:pose.bones.length,bonePose:pose.bones.filter(b=>['Hips','Head','Front_Leg_Foot_L','Tail_Tip'].includes(b[0])).map(b=>b.map(v=>typeof v==='number'?round(v):v)),projectedBounds:geometry.bounds,silhouetteInsideViewport:geometry.inside,camera:panel.id==='profile'?'orthographic-side':'orthographic-three-quarter',normalizedHeight:inst.stats.normalizedHeight,sourceSha256:inst.stats.sha256,provenance:inst.stats.provenance,trailPaths:paths.map(p=>({name:p.name,kind:p.kind,requestedWindowSeconds:p.requestedWindowSeconds,sampleCount:p.points.length,maximumSamplingErrorSeconds:p.maximumSamplingErrorSeconds,samples:p.points.map(q=>({clipTime:q.clipTime,world:q.world}))}))}};
    },
    dispose(){for(const i of instances.values())i.dispose();for(const mesh of [platform,ring]){mesh.geometry.dispose();mesh.material.dispose();}renderer.dispose();}
  };
}

export function createScene({canvas,THREE,story={},resources={}}){
  if(!canvas)throw Error('A canvas is required.');canvas.width=WIDTH;canvas.height=HEIGHT;
  const c=canvas.getContext('2d',{alpha:false});if(!c)throw Error('Canvas2D composition unavailable.');
  const episode=(story.episode??story.id)==='trails'?'trails':'microscope';
  const stage=createRigStage(THREE,resources.rigLibrary,stateAt(0,episode).clip);
  let last=null,disposed=false;
  function renderPanel(panel,s,warnings,receipts){
    const focus=s.focusPanel===s.panels.findIndex(p=>p.id===panel.id);
    c.save();c.shadowColor='#00000035';c.shadowBlur=24;c.shadowOffsetY=8;rounded(c,panel.x,panel.y,panel.w,panel.h,24,P.panel);c.restore();
    const glow=c.createRadialGradient(panel.x+panel.w*.55,panel.y+panel.h*.40,10,panel.x+panel.w*.5,panel.y+panel.h*.5,panel.w*.8);glow.addColorStop(0,'#244750');glow.addColorStop(1,P.panel);
    rounded(c,panel.x,panel.y,panel.w,panel.h,24,glow,focus?P.mint:P.line);
    text(c,panel.label,panel.x+24,panel.y+43,26,focus?P.mint:P.ink,700);
    const number=String(s.panels.findIndex(p=>p.id===panel.id)+1).padStart(2,'0');text(c,number,panel.x+panel.w-57,panel.y+43,25,P.muted,600);
    const viewport={x:panel.x+12,y:panel.y+65,w:panel.w-24,h:354};
    const rendered=stage.render(panel,s,viewport.w,viewport.h);c.save();c.beginPath();c.rect(viewport.x,viewport.y,viewport.w,viewport.h);c.clip();
    c.drawImage(rendered.image,viewport.x,viewport.y);
    if(panel.id==='skeleton'){
      for(const bone of rendered.geometry.bones)if(bone.parent)stroke(c,[{x:viewport.x+bone.parent.x,y:viewport.y+bone.parent.y},{x:viewport.x+bone.point.x,y:viewport.y+bone.point.y}],P.mint,2.4);
      for(const bone of rendered.geometry.bones)circle(c,viewport.x+bone.point.x,viewport.y+bone.point.y,/Foot|Ankle|Head|Hips/.test(bone.name)?3.7:2.2,P.ink,'#234b50');
    }
    if(panel.id==='profile'&&s.trailsEnabled){
      for(const path of rendered.paths){const points=path.points.map(p=>({x:viewport.x+p.x,y:viewport.y+p.y}));c.save();c.globalAlpha=.25;stroke(c,points,path.color,7);c.globalAlpha=.95;stroke(c,points,path.color,2.5);c.restore();const bone=rendered.geometry.bones.find(b=>b.name===path.name);if(bone)circle(c,viewport.x+bone.point.x,viewport.y+bone.point.y,4.5,path.color,P.bg);}
    }
    c.restore();
    const notes={surface:'Material + silhouette',wire:'Actual mesh triangles',skeleton:`${rendered.receipt.boneCount} actual bones`,profile:s.trailsEnabled?'Sampled joint histories':'Side camera / same pose'};
    text(c,notes[panel.id],panel.x+24,panel.y+454,25,P.muted,500);
    if(focus){c.fillStyle=P.mint;c.fillRect(panel.x+24,panel.y+474,56,3);}
    if(!rendered.receipt.silhouetteInsideViewport)warnings.push(`${panel.id}-silhouette-outside-stage`);
    receipts.push({...rendered.receipt,panelBounds:{...panel},viewportBounds:viewport});
  }
  function seek(time,options={}){
    if(disposed)throw Error('Scene disposed.');
    const s=stateAt(time,episode),chapter=chapterAt(s.time,story),warnings=[],receipts=[];
    // Reduced motion intentionally selects a common static pose; the receipt and visible clock say so.
    if(options.reducedMotion){s.poseTime=0;s.playbackRate=0;s.frozen=true;s.phase='reduced-motion';s.label='REDUCED MOTION / STATIC POSE';}
    s.reducedMotion=!!options.reducedMotion;s.chapter=chapter;
    c.setTransform(1,0,0,1,0,0);c.fillStyle=P.bg;c.fillRect(0,0,WIDTH,HEIGHT);
    const wash=c.createRadialGradient(860,170,10,800,280,1050);wash.addColorStop(0,'#163a43');wash.addColorStop(1,P.bg);c.fillStyle=wash;c.fillRect(0,0,WIDTH,HEIGHT);
    circle(c,61,69,5,P.mint);text(c,'LUXE / MOTION LAB',80,78,26,P.muted,650);
    text(c,`${String(chapter.index+1).padStart(2,'0')} / 06`,911,78,26,P.muted,650);
    text(c,chapter.kicker,52,130,25,P.mint,700);
    block(c,chapter.title,{x:49,y:204,w:982,size:60,lineHeight:67,max:2,weight:750},warnings,'headline');
    block(c,chapter.body,{x:53,y:321,w:974,size:36,lineHeight:41,max:2,color:P.muted,weight:500},warnings,'subtitle');
    const clockY=392;
    text(c,`${s.clip.toUpperCase()} / ${s.label}`,52,clockY,25,s.frozen?P.apricot:P.mint,650);
    const clock=`POSE ${s.poseTime.toFixed(2)}s`;c.font=`650 25px ${FONT}`;text(c,clock,1028-c.measureText(clock).width,clockY,25,P.ink,650);
    s.panels.forEach(p=>renderPanel(p,s,warnings,receipts));
    if(s.trailsEnabled){circle(c,66,1484,5,P.mint);text(c,'FRONT FOOT',81,1492,25,P.muted,650);circle(c,360,1484,5,P.apricot);text(c,'TAIL TIP',375,1492,25,P.muted,650);text(c,'0.48s CLIP HISTORY',722,1492,25,P.muted,650);}
    else{text(c,'ONE CLOCK',52,1492,25,P.mint,700);text(c,'Shared clip. Matched pose. Different evidence.',244,1492,25,P.muted,500);}
    const caption=captionAt(s.time,resources.phrases??[],chapter);
    if(options.captions!==false&&caption.text){
      rounded(c,52,1540,976,236,25,'#102e37',P.line);c.fillStyle=P.mint;c.fillRect(78,1572,4,168);
      const a=lines(c,caption.text,884,36,600),y=1540+(236-a.length*44)/2+34;
      block(c,caption.text,{x:103,y,w:884,size:36,lineHeight:44,max:4},warnings,'caption');
    }
    text(c,'SUPPLIED MESH2MOTION FOX / ORIGINAL VIEW STUDY',52,1820,25,P.muted,500);
    for(let n=0;n<6;n++){const x=52+n*166;rounded(c,x,1854,146,5,3,P.line);const progress=clamp((s.time-n*8)/8,0,1);if(progress)rounded(c,x,1854,146*progress,5,3,P.mint);}
    const fingerprints=receipts.map(r=>r.poseFingerprint),synchronized=fingerprints.every(x=>x===fingerprints[0])&&receipts.every(r=>r.poseTime===s.poseTime&&r.clip===s.clip);
    if(!synchronized)throw Error('The four actual rig poses are not synchronized.');
    last={...s,...stage.backend,captionMode:caption.mode,captionVisible:options.captions!==false&&!!caption.text,narrationTiming:'measured-sentence-only',rigViews:receipts,synchronized,poseFingerprint:fingerprints[0],layoutWarnings:[...new Set(warnings)],layoutBounds:{width:WIDTH,height:HEIGHT,panels:s.panels,caption:{x:52,y:1540,w:976,h:236}},trailEvidence:s.trailsEnabled?'actual supplied-clip bone-world samples; no physical contact or travel claim':'not-used',clipDuration:stage.clipDuration};
    return last;
  }
  return {seek,getState(){return last;},dispose(){if(disposed)return;disposed=true;stage.dispose();}};
}

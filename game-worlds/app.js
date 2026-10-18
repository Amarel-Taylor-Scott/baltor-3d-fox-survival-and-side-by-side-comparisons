import * as THREE from 'three';
import {MODES} from './modes.js';
import {createRacing} from './racing.js';
import {createFlight} from './flight.js';
import {createSurvival} from './survival.js';

const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),capture=params.has('capture');
if(capture)document.body.classList.add('capture');
const scene=new THREE.Scene();
const renderer=new THREE.WebGLRenderer({canvas:$('#view'),antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:capture});
renderer.setPixelRatio(capture?1:Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const hemi=new THREE.HemisphereLight('#dce8ed','#64654e',.7);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff0d8',2.8);sun.position.set(-60,100,55);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:300});sun.shadow.bias=-.00025;sun.shadow.normalBias=.06;scene.add(sun,sun.target);
const embed=params.has('embed');if(embed)document.body.classList.add('embed');
const environmentReady=Promise.resolve().then(()=>{
  const w=128,h=64,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++){
    const v=y/(h-1);
    for(let x=0;x<w;x++){
      const u=x/w,sunDot=Math.max(0,Math.cos((u-0.32)*Math.PI*2)*Math.sin(v*Math.PI));
      const r=v<0.5?185+70*sunDot:110+35*(1-v);
      const g=v<0.5?212+40*sunDot:124+30*(1-v);
      const b=v<0.5?225+25*sunDot:95+25*(1-v);
      const idx=(y*w+x)*4;
      data[idx]=Math.min(255,r);data[idx+1]=Math.min(255,g);data[idx+2]=Math.min(255,b);data[idx+3]=255;
    }
  }
  const tex=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
  tex.mapping=THREE.EquirectangularReflectionMapping;tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer);
  scene.environment=pmrem.fromEquirectangular(tex).texture;scene.environmentIntensity=.65;
  tex.dispose();pmrem.dispose();
});
const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{horizon:{value:new THREE.Color('#c4d2d6')},zenith:{value:new THREE.Color('#406b90')}},vertexShader:'varying vec3 vSky;void main(){vSky=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vSky;uniform vec3 horizon;uniform vec3 zenith;void main(){vec3 d=normalize(vSky);float h=pow(max(0.0,d.y),.45);vec3 col=mix(horizon,zenith,h);float s=pow(max(0.,dot(d,normalize(vec3(-.6,1.,.55)))),170.);col+=vec3(1.,.78,.48)*s*.3;gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(3000,32,16),skyMaterial);skyDome.frustumCulled=false;scene.add(skyDome);
const perspective=new THREE.PerspectiveCamera(54,1,.15,4500),ortho=new THREE.OrthographicCamera(-50,50,50,-50,.1,4500);
let camera=perspective,game,mode,seed=42,ticks=0,paused=false,driver='auto',history=[],replayFrames=null,replayIndex=0,lastRecord=null,cameraView='chase',W=1,H=1,snapCamera=true,accumulator=0,lastNow=null,noticeUntil=0;
const keys=['up','down','left','right','ascend','descend','action'],held=new Set(),touch=new Set();
const keyMap={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyE:'ascend',KeyQ:'descend',Space:'action'};
const target=new THREE.Vector3(),eye=new THREE.Vector3(),look=new THREE.Vector3();
let audio=null,sound=false,lastToneTick=-200,lastMessage='';
let heroObject=null,heroCenterOffset=new THREE.Vector3(),heroSize=new THREE.Vector3(),obstacles=[];
const cameraRay=new THREE.Raycaster(),heroWorld=new THREE.Vector3();
const factories={racing:createRacing,flight:createFlight,survival:createSurvival};
const dt=1/60;
function validSeed(value){const n=Number(value);return Number.isSafeInteger(n)&&n>=1&&n<=999999?n:42;}
function dimensions(){const r=$('#stage').getBoundingClientRect();W=Math.max(1,Math.round(r.width));H=Math.max(1,Math.round(r.height));renderer.setSize(W,H,false);perspective.aspect=W/H;perspective.updateProjectionMatrix();snapCamera=true;}
new ResizeObserver(()=>{dimensions();if(game)draw(0);}).observe($('#stage'));
function notify(text){$('#notice').textContent=text;noticeUntil=performance.now()+10000;}
function setPause(value){paused=Boolean(value);$('#pause').textContent=paused?'Resume':'Pause';$('#paused').hidden=!paused;accumulator=0;}
function setDriver(value){driver=value;document.body.classList.toggle('human',value==='human');$('#take-control').textContent=value==='human'?'You are playing':'Take control';$('#auto').setAttribute('aria-pressed',String(value==='auto'));$('#control-status').textContent=value==='auto'?'BOT RUN':value==='replay'?'SAVED REPLAY':'YOUR RUN';}
function selectMode(id,newSeed=seed,keepURL=false){
 game?.dispose();mode=MODES.find(m=>m.id===id)||MODES[0];seed=validSeed(newSeed);$('#seed').value=seed;
 scene.background=new THREE.Color(mode.sky);scene.fog=new THREE.Fog(mode.sky,550,2400);hemi.groundColor.set(mode.ground);
 game=factories[mode.factory]({THREE,scene,seed,variant:mode.id});camera=game.orthographic?ortho:perspective;
 heroObject=(typeof game.hero==='function'?game.hero():game.hero)||null;obstacles=(typeof game.occluders==='function'?game.occluders():game.occluders)||game.cameraObstacles||[];if(heroObject){scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(heroObject);box.getCenter(heroCenterOffset);box.getSize(heroSize);heroCenterOffset.sub(heroObject.getWorldPosition(new THREE.Vector3()));}else heroCenterOffset.set(0,1,0);
 skyMaterial.uniforms.horizon.value.set(mode.sky);skyDome.visible=!game.orthographic;
 ticks=0;history=[];replayFrames=null;replayIndex=0;held.clear();touch.clear();snapCamera=true;lastMessage='';setPause(false);setDriver('auto');
 $('#stage-title').textContent=mode.name;$('#stage-kicker').textContent=`GAME WORLDS / ${mode.symbol}`;$('#stage-goal').textContent=capture?mode.hook:mode.description;$('#mode-kind').textContent=mode.kind;$('#controls').textContent=mode.controls;$('#lesson').textContent=mode.lesson;
 for(const b of $('#modes').children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode.id));
 if(!keepURL){const p=new URLSearchParams(location.search);p.set('mode',mode.id);p.set('seed',seed);window.history.replaceState({},'',`?${p}`);}
 draw(0);return snapshot();
}
function inputBits(){let n=0;keys.forEach((k,i)=>{if(held.has(k)||touch.has(k))n|=1<<i;});return n;}
function unpack(bits){return Object.fromEntries(keys.map((k,i)=>[k,Boolean(bits&(1<<i))]));}
function tick(forcedBits){
 if(driver!=='replay'&&history.length>=36000){setPause(true);notify('This replay reached 10 minutes. Save it, then restart for another round.');return false;}
 let bits=forcedBits;
 if(bits===undefined){if(driver==='replay'){if(replayIndex>=replayFrames.length){setPause(true);notify('Replay complete. The original inputs have all been played.');return false;}bits=replayFrames[replayIndex++];}else bits=inputBits()|(driver==='auto'?128:0);}
 game.step(dt,unpack(bits),Boolean(bits&128));ticks++;updateCamera(dt);
 if(driver!=='replay'&&history.length<36000)history.push(bits);
 return true;
}
function updateCamera(elapsed=dt){
 if(!game)return;
 const pose=game.cameraPose(cameraView);eye.fromArray(pose.position);look.fromArray(pose.target);
 if(heroObject&&cameraView!=='top'){heroObject.getWorldPosition(heroWorld).add(heroCenterOffset);look.lerp(heroWorld,.45);}
 if(capture&&camera===perspective){eye.sub(look).multiplyScalar(mode.factory==='flight'?1.5:1.25).add(look);}
 if(cameraView==='detail'&&heroObject){heroObject.getWorldPosition(heroWorld).add(heroCenterOffset);look.copy(heroWorld);const angle=ticks/60*.14+.75,dist=Math.max(12,heroSize.length()*1.55);eye.copy(look).add(new THREE.Vector3(Math.sin(angle)*dist,dist*.4,Math.cos(angle)*dist));}
 const factor=snapCamera?1:1-Math.exp(-6*Math.max(0,elapsed));camera.position.lerp(eye,factor);target.lerp(look,factor);camera.lookAt(target);
 if(camera===ortho){const half=Math.max(15,eye.distanceTo(look)*.52),aspect=W/H;camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();}
 snapCamera=false;
}
function draw(elapsed=dt){
 if(!game)return;if(snapCamera)updateCamera(0);
 skyDome.position.copy(camera.position);sun.target.position.copy(target);sun.target.position.x=Math.round(sun.target.position.x*16)/16;sun.target.position.z=Math.round(sun.target.position.z*16)/16;sun.position.copy(sun.target.position).add(new THREE.Vector3(-60,100,55));sun.target.updateMatrixWorld();camera.updateMatrixWorld();game.prepareFrame?.(camera,elapsed,ticks/60);renderer.render(scene,camera);
 const h=game.hud(),parts=h.primary.split(' · ');$('#primary').textContent=parts.shift();$('#secondary').textContent=[...parts,h.secondary].filter(Boolean).join(' · ');$('#mission-copy').textContent=h.message&&!/^W\/?A?S?D?\b|^W\/S/.test(h.message)?h.message:h.objective;$('#mission-label').textContent=h.status==='won'?'MISSION COMPLETE':h.status==='lost'?'TRY AGAIN':'YOUR MISSION';$('#progress').style.transform=`scaleX(${Math.max(0,Math.min(1,h.progress||0))})`;
 const sec=Math.floor(ticks/60);$('#elapsed').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
 const done=h.status==='won'||h.status==='lost';$('#result').hidden=!done;$('#result-label').textContent=h.status==='won'?'ROUND COMPLETE':'ROUND ENDED';$('#result-copy').textContent=h.status==='won'?'You made it.':'Another route awaits.';
 if(capture){const phase=ticks<480?0:ticks<1200?1:done?3:2;$('#film-phase').textContent=['THE CHALLENGE','FIND THE RHYTHM','READ THE WORLD','THE PAYOFF'][phase];$('#film-line').textContent=[mode.hook,mode.lesson,h.objective||mode.description,h.status==='won'?'A complete run. Now try your own route.':'Reset, change your approach, try again.'][phase];}
 if(sound&&h.message&&h.message!==lastMessage&&ticks-lastToneTick>35){tone(h.status==='won'?880:420);lastToneTick=ticks;}lastMessage=h.message;
}
function snapshot(){return{mode:mode.id,seed,tick:ticks,time:ticks/60,driver,paused,hud:game.hud(),game:game.snapshot(),render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},camera:{position:camera.position.toArray(),target:target.toArray(),orthographic:camera===ortho}};}
function quality(){
 const issues=[],b=heroObject?new THREE.Box3().setFromObject(heroObject):null;if(!b||b.isEmpty())return{issues:['Hero bounds unavailable'],samples:[]};
 const center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),points=[];
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new THREE.Vector3(x,y,z).project(camera);points.push([(q.x+1)*W/2,(1-q.y)*H/2,q.z]);}
 const bounds=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
 if(!bounds.every(Number.isFinite)||bounds[0]<10||bounds[2]>W-10||bounds[1]<10||bounds[3]>H-10)issues.push('Hero clipped by frame');
 const c=center.clone().project(camera);if(c.z<-1||c.z>1)issues.push('Hero behind camera');
 const visible=object=>{for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;};
 const samples=[];for(let y=0;y<9;y++)for(let x=0;x<7;x++){
  const px=bounds[0]+(bounds[2]-bounds[0])*(x+.5)/7,py=bounds[1]+(bounds[3]-bounds[1])*(y+.5)/9;
  cameraRay.setFromCamera(new THREE.Vector2(px/W*2-1,1-py/H*2),camera);cameraRay.far=Infinity;
  const surface=cameraRay.intersectObject(heroObject,true).find(h=>visible(h.object));if(!surface)continue;
  cameraRay.far=Math.max(0,surface.distance-.03);
  const hit=cameraRay.intersectObjects(obstacles,true).find(h=>{const m=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;return visible(h.object)&&(!m?.transparent||m.opacity>.85);});
  samples.push({blocked:Boolean(hit),screen:[px,py],distance:hit?.distance||null,object:hit?.object.name||null});
 }
 if(!samples.length)issues.push('Hero surface samples unavailable');
 const obscuredFraction=samples.length?samples.filter(s=>s.blocked).length/samples.length:0;
 if(obscuredFraction>.18)issues.push('Hero partly obscured by scenery');
 const textOverlaps=(window.gameLab?.layout()||[]).filter(label=>samples.some(({screen:[x,y]})=>x>label.box[0]&&x<label.box[2]&&y>label.box[1]&&y<label.box[3])).map(label=>label.text);
 if(textOverlaps.length)issues.push('Text covers lead model');
 return{time:ticks/60,issues,bounds,center:[(c.x+1)*W/2,(1-c.y)*H/2],samples,obscuredFraction,textOverlaps,objects:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
function exportReplay(){return{format:'game-worlds-replay',version:1,build:'20260919.2',mode:mode.id,seed,tickRate:60,frames:driver==='replay'?replayFrames.slice():history.slice()};}
function validateReplay(data){if(!data||data.format!=='game-worlds-replay'||data.version!==1||data.build!=='20260919.2'||data.tickRate!==60||!MODES.some(m=>m.id===data.mode)||!Number.isSafeInteger(data.seed)||data.seed<1||data.seed>999999||!Array.isArray(data.frames)||data.frames.length<1||data.frames.length>36000||!data.frames.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw Error('This is not a supported replay. Choose a replay saved by this sampler (up to 10 minutes).');return data;}
function loadReplay(data){validateReplay(data);lastRecord=structuredClone(data);selectMode(data.mode,data.seed);replayFrames=data.frames.slice();replayIndex=0;setDriver('replay');setPause(false);draw(0);return snapshot();}
function restart(){const d=driver==='human'?'human':'auto';selectMode(mode.id,seed);setDriver(d);$('#stage').focus({preventScroll:true});}
async function tone(f=440){if(!sound)return;try{audio??=new AudioContext();if(audio.state==='suspended')await audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,audio.currentTime);g.gain.exponentialRampToValueAtTime(.045,audio.currentTime+.012);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.18);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.2);}catch{sound=false;$('#sound').textContent='Sound unavailable';}}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const m of MODES){const b=document.createElement('button');b.className='mode-card';b.dataset.mode=m.id;b.innerHTML=`<span class="mode-icon" style="--accent:${m.color}">${m.symbol}</span><span><strong>${m.name}</strong><small>${m.kind}</small></span>`;b.onclick=()=>{selectMode(m.id);notify(m.description);};$('#modes').append(b);}
$('#take-control').onclick=()=>{if(driver==='replay'||game.hud().status!=='playing')selectMode(mode.id,seed);setDriver('human');setPause(false);$('#stage').focus({preventScroll:true});notify(mode.controls);};
$('#auto').onclick=()=>{if(driver==='replay'||game.hud().status!=='playing')selectMode(mode.id,seed);setDriver('auto');setPause(false);};
$('#restart').onclick=restart;$('#pause').onclick=()=>setPause(!paused);$('#camera').onchange=e=>{cameraView=e.target.value;snapCamera=true;draw(0);};
$('#seed').onchange=e=>selectMode(mode.id,e.target.value);$('#new-seed').onclick=()=>selectMode(mode.id,(seed*1664525+1013904223)%999999+1);
$('#save').onclick=()=>{const r=exportReplay();if(!r.frames.length)return notify('Play a little of a round before saving its replay.');download(r,`${mode.id}-seed-${seed}.replay.json`);notify(`Saved ${(r.frames.length/60).toFixed(1)} seconds of replay.`);};
$('#replay').onclick=()=>{const data=driver==='replay'?lastRecord:exportReplay();if(!data?.frames.length)return notify('Play a little of a round first.');loadReplay(data);notify('Replaying the same inputs, world, and starting state.');};
$('#load').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>3_000_000)throw Error('Replay exceeds the 3 MB file limit.');loadReplay(JSON.parse(await f.text()));notify('Replay loaded.');}catch(err){notify(err.message);}e.target.value='';};
$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',sound);if(sound)tone(660);};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#stage').requestFullscreen();}catch{notify('Full screen is unavailable in this browser.');}};
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(keyMap[e.code]){e.preventDefault();held.add(keyMap[e.code]);}if(e.code==='KeyP'&&!e.repeat){e.preventDefault();setPause(!paused);}if(e.code==='KeyR'&&!e.repeat){e.preventDefault();restart();}});
window.addEventListener('keyup',e=>{if(keyMap[e.code])held.delete(keyMap[e.code]);});window.addEventListener('blur',()=>{held.clear();touch.clear();lastNow=null;});document.addEventListener('visibilitychange',()=>{held.clear();touch.clear();lastNow=null;});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(b.dataset.key);};const release=()=>touch.delete(b.dataset.key);b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
window.gameLab={ready:false,modes:MODES.map(m=>({id:m.id,name:m.name})),selectMode,snapshot,exportReplay,loadReplay,setDriver,setPause,setCamera:value=>{cameraView=value;$('#camera').value=value;snapCamera=true;draw(0);},step:(count=1,bits)=>{for(let i=0;i<count;i++)tick(bits);draw(count*dt);return snapshot();},renderAt:seconds=>{if(!Number.isFinite(seconds)||seconds<0||seconds>600)throw Error('Render time must be between 0 and 600 seconds');const goal=Math.round(Math.max(0,seconds)*60);if(goal<ticks)selectMode(mode.id,seed,true);while(ticks<goal)tick(128);draw(dt);return snapshot();},layout:()=>{const b=$('#stage').getBoundingClientRect();return [...document.querySelectorAll('.stage-heading p,.stage-heading h2,#clock span,#clock b,.mission p,#mission-label,.metrics strong,.metrics span,#film-caption span,#film-caption p,#result span,#result b')].filter(n=>n.textContent&&n.getClientRects().length&&getComputedStyle(n).display!=='none').map(n=>{const r=document.createRange();r.selectNodeContents(n);const a=r.getBoundingClientRect();return{text:n.textContent,box:[a.left-b.left,a.top-b.top,a.right-b.left,a.bottom-b.top]};});}};
gameLab.quality=quality;
try{await environmentReady;dimensions();selectMode(params.get('mode')||'race',validSeed(params.get('seed')));$('#loading').remove();gameLab.ready=true;
 if(!capture){function animate(now){if(lastNow===null)lastNow=now;const delta=Math.min(.12,(now-lastNow)/1000);lastNow=now;if(!paused){accumulator+=delta;let n=0;while(accumulator>=dt&&n++<8){tick();accumulator-=dt;}}draw(delta);if(noticeUntil&&now>noticeUntil){$('#notice').textContent='';noticeUntil=0;}requestAnimationFrame(animate);}requestAnimationFrame(animate);}
}catch(error){$('#loading').textContent='Unable to start this world. '+error.message;console.error(error);}

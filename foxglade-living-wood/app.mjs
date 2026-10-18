import * as THREE from 'three';
import { loadRigLibrary } from './rig-loader.mjs';
import { createState, step, snapshot as modelSnapshot, nextObjective, FIXED_DT } from './model.mjs';
import { WORLD } from './world-data.mjs';
import { createWorld } from './world.mjs';
import { createPlayer } from './player.mjs';
import { demoInput } from './demo.mjs';
import { cameraClearance } from './camera-math.mjs';
import {createCompanion,stepCompanion,companionSnapshot,prepareCompanionNavigation} from './companion.mjs';
import {createLivingEffects} from './living-effects.mjs';
import {inspectMotionProfile} from './motion-profile.mjs';

const $=id=>document.getElementById(id), params=new URLSearchParams(location.search);
const capture=params.has('capture'), reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas=$('world'), keys=new Set(), touch={x:0,z:0,jump:false,interact:false,sniff:false,sprint:false};
let state=createState(), ready=false, started=false, paused=false, demo=params.has('demo')||params.has('embed'), dismissedWin=false;
let renderer,scene,camera,world,player,friend,effects,accumulator=0,lastNow=0,lowQuality=false;
let companion=createCompanion(),cameraMode='follow',photoMode=false,lighting='golden',motionProfile=null,measured=false;
let sunlight,ambientLight,rimLight;
let camYaw=0,camPitch=.48,camDistance=8.8,manualCameraUntil=0,dragging=false,lastPointer=null;
let toastUntil=0,toastText='',soundEnabled=false,audioContext=null,master=null;
let frameStats={drawCalls:0,triangles:0},eventHistory=[];
const cameraTarget=new THREE.Vector3(), desiredCamera=new THREE.Vector3(), lookAt=new THREE.Vector3();
if(demo){
  document.body.classList.remove('in-intro');
  document.body.classList.add('started');
  if($('welcome')){$('welcome').style.display='none';$('welcome').hidden=true;}
}else{
  document.body.classList.add('in-intro');
}
const setText=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
function showToast(text,duration=2.7){toastText=text;toastUntil=state.time+duration;}
function tone(frequency,duration=.25,delay=0){
  if(!soundEnabled||!audioContext)return;
  const osc=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime+delay;
  osc.type='sine';osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*.985,t+duration);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.15,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(g).connect(master);osc.start(t);osc.stop(t+duration+.01);
}
async function toggleSound(){
  if(!audioContext){audioContext=new AudioContext();master=audioContext.createGain();master.gain.value=.32;master.connect(audioContext.destination);}
  await audioContext.resume();soundEnabled=!soundEnabled;$('sound').innerHTML=`♪<span>${soundEnabled?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-label',soundEnabled?'Mute sound':'Enable sound');
  if(soundEnabled){tone(523,.5);tone(784,.5,.1);}
}
function processEvents(){
  for(const event of state.events){
    eventHistory.push({...event,time:state.time});if(eventHistory.length>100)eventHistory.shift();
    if(event.type==='collect'){showToast(`A little light found you. ${state.totalCollected} of 9.`);tone(660+state.totalCollected*40,.35);tone(1046,.4,.1);}
    if(event.type==='shrine'){showToast('A shrine wakes. The woodland remembers.',3.4);[392,494,587,784].forEach((f,i)=>tone(f,.8,i*.1));}
    if(event.type==='need-wisps')showToast(`This shrine needs ${event.needed} more ${event.needed===1?'light':'lights'}.`);
    if(event.type==='fall')showToast('A soft landing at your last safe place.');
    if(event.type==='jump')tone(180,.14);
    if(event.type==='call'){showToast('A familiar face follows your call.');tone(310,.18);tone(390,.21,.12);}
    if(event.type==='pounce')showToast('A little leap of courage.',1.1);
    if(event.type==='win'){dismissedWin=false;[523,659,784,1046].forEach((f,i)=>tone(f,1,i*.16));}
  }
}
function input(){
  if(demo)return demoInput(state);
  let horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touch.z;
  return {moveX:horizontal*Math.cos(camYaw)-forward*Math.sin(camYaw),moveZ:-horizontal*Math.sin(camYaw)-forward*Math.cos(camYaw),
    sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.sprint,jump:keys.has('Space')||touch.jump,
    interact:keys.has('KeyE')||touch.interact,sniff:keys.has('KeyQ')||touch.sniff,
    sneak:keys.has('ControlLeft')||keys.has('ControlRight')||touch.sneak,pounce:keys.has('KeyF')||touch.pounce,
    sit:keys.has('KeyT')||touch.sit,call:keys.has('KeyB')||touch.call};
}
function updateCamera(dt,instant=false){
  const k=instant?1:1-Math.exp(-5*dt);
  // Capture and play use identical fixed-step camera damping.
  if(demo && state.speed>.2 && state.time>manualCameraUntil && !dragging){
    const desiredYaw=state.yaw+Math.PI;
    camYaw+=Math.atan2(Math.sin(desiredYaw-camYaw),Math.cos(desiredYaw-camYaw))*(instant?1:1-Math.exp(-1.3*dt));
  }
  const lookHeight=Math.max(.55,state.y+.78);
  cameraTarget.set(state.x,lookHeight,state.z);
  if(!started){camYaw=.56;cameraTarget.set(0,.65,21.5);}
  if(started&&cameraMode==='fox-eye'&&!photoMode){
    player.setVisible(false);
    desiredCamera.set(state.x,state.y+.72,state.z);
    camera.position.lerp(desiredCamera,instant?1:1-Math.exp(-12*dt));
    camera.lookAt(state.x-Math.sin(camYaw)*8,state.y+.72+Math.sin(.48-camPitch)*5,state.z-Math.cos(camYaw)*8);
    return;
  }
  player.setVisible(true);
  const pitch=cameraMode==='overlook'&&!photoMode ? .92 : camPitch;
  const nominal=cameraMode==='overlook'&&!photoMode?15:camDistance;
  const distance=cameraClearance(cameraTarget,camYaw,pitch,nominal,WORLD.obstacles);
  const dx=Math.sin(camYaw)*Math.cos(pitch), dz=Math.cos(camYaw)*Math.cos(pitch);
  desiredCamera.set(cameraTarget.x+dx*distance,Math.max(1.8,cameraTarget.y+Math.sin(pitch)*distance),cameraTarget.z+dz*distance);
  if(instant){camera.position.copy(desiredCamera);lookAt.copy(cameraTarget);}else{camera.position.lerp(desiredCamera,k);lookAt.lerp(cameraTarget,k);}
  camera.lookAt(lookAt);
}
function tick(){
  if(started&&!paused){step(state,input(),FIXED_DT);stepCompanion(companion,state,FIXED_DT);processEvents();effects.tick(state);player.update(state,FIXED_DT);friend.update(companion,FIXED_DT);updateCamera(FIXED_DT);}
  else if(!started){player.update(state,FIXED_DT);friend.update(companion,FIXED_DT);updateCamera(FIXED_DT);}
}
function drawMap(){
  const ctx=$('minimap').getContext('2d'),s=2.65,c=128;
  const px=x=>c+x*s,pz=z=>c+z*s;
  ctx.clearRect(0,0,256,256);ctx.save();ctx.beginPath();ctx.arc(c,c,121,0,Math.PI*2);ctx.clip();
  ctx.fillStyle='#123d3e';ctx.beginPath();ctx.arc(c,c,WORLD.radius*s,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=7;ctx.strokeStyle='#50776888';ctx.beginPath();WORLD.route.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.stroke();
  ctx.fillStyle='#43808a';ctx.beginPath();ctx.arc(px(WORLD.pond.x),pz(WORLD.pond.z),WORLD.pond.radius*s,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#aa936e';ctx.fillRect(px(WORLD.bridge.minX),pz(WORLD.bridge.z-WORLD.bridge.width/2),(WORLD.bridge.maxX-WORLD.bridge.minX)*s,WORLD.bridge.width*s);
  ctx.fillStyle='#31584d';for(const o of WORLD.obstacles){ctx.beginPath();ctx.arc(px(o.x),pz(o.z),o.radius*s+1,0,7);ctx.fill();}
  for(const w of WORLD.wisps){if(state.collectedIds.includes(w.id))continue;ctx.fillStyle='#f4cf82';ctx.beginPath();ctx.arc(px(w.x),pz(w.z),3.5,0,7);ctx.fill();}
  for(const p of WORLD.shrines){ctx.save();ctx.translate(px(p.x),pz(p.z));ctx.rotate(Math.PI/4);ctx.fillStyle=state.activatedIds.includes(p.id)?'#c1ffe3':'#6fa896';ctx.fillRect(-4.3,-4.3,8.6,8.6);ctx.restore();}
  ctx.strokeStyle='#f4cf82';ctx.lineWidth=2;ctx.beginPath();ctx.arc(px(0),pz(22),6,0,7);ctx.stroke();
  ctx.fillStyle='#b6edd2';ctx.beginPath();ctx.arc(px(companion.x),pz(companion.z),3.5,0,7);ctx.fill();
  ctx.save();ctx.translate(px(state.x),pz(state.z));ctx.rotate(-state.yaw);ctx.fillStyle='#fff5d5';ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-5,-5);ctx.lineTo(5,-5);ctx.closePath();ctx.fill();ctx.restore();ctx.restore();
}
function updateHUD(){
  const objective=nextObjective(state),won=state.status==='won';
  setText('chapter',won?'HOME, AT LAST':state.activatedIds.length===3?'THE LAST STRETCH':`CHAPTER ${String(state.activatedIds.length+1).padStart(2,'0')} / WAKE THE WOOD`);
  setText('objective',won?'The lantern wood is glowing':objective.type==='shrine'?'Bring your light to a shrine':objective.type==='den'?'Follow the trail home':`Find ${Math.max(0,3-state.carried)} woodland ${3-state.carried===1?'light':'lights'}`);
  setText('objectiveDetail',won?'Thank you, little fox.':objective.type==='shrine'?'Approach a sleeping shrine and press E.':objective.type==='den'?'Your den is marked with a gold circle.':`${state.carried} of 3 in your care. Press Q to follow a scent.`);
  $('lights').innerHTML=`${state.totalCollected}<span>/ 9</span>`;$('shrines').innerHTML=`${state.activatedIds.length}<span>/ 3</span>`;
  $('demoLabel').hidden=!demo||!started;
  $('toast').classList.toggle('visible',state.time<toastUntil&&started);setText('toast',toastText);
  const nearby=WORLD.shrines.find(p=>!state.activatedIds.includes(p.id)&&Math.hypot(state.x-p.x,state.z-p.z)<=3);
  $('interactHint').hidden=!nearby||!started||paused;
  $('interactHint').querySelector('span').textContent=state.carried>=3?'Awaken this shrine':`Needs ${3-state.carried} more lights`;
  $('sniffHint').hidden=state.time>=state.sniffUntil||!started||won;
  setText('scentDistance',`${Math.round(objective.distance)} m`);
  const bearing=Math.atan2(objective.x-state.x,objective.z-state.z);
  $('scentArrow').style.transform=`rotate(${(camYaw+Math.PI-bearing)*180/Math.PI}deg)`;
  $('paused').hidden=!paused||photoMode;
  $('photoPanel').hidden=!photoMode;
  setText('companionStatus',`PIP · ${companion.mode??'following'} · ${Math.round(Math.hypot(state.x-companion.x,state.z-companion.z))} m`);
  setText('actionState',state.sitting?'RESTING':state.animation.toUpperCase());
  setText('cameraLabel',cameraMode==='fox-eye'?'FOX EYE':cameraMode==='overlook'?'OVERLOOK':'FOLLOW');
  const readyIn=Math.max(0,(state.pounceReadyAt??0)-state.time);
  setText('pounceStatus',readyIn>0?`POUNCE ${readyIn.toFixed(1)}s`:'POUNCE READY');
  $('victory').hidden=!won||dismissedWin||demo;
  setText('result',`${Math.floor(state.time/60)}m ${Math.floor(state.time%60)}s exploring · ${state.jumpCount} leaps · ${state.deaths} recoveries`);
  drawMap();
}
function render(){if(!ready)return;world.update(state.time,state,camera.position);effects.update(state.time);renderer.render(scene,camera);frameStats={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};updateHUD();}
function reset(options={}){
  state=createState();companion=createCompanion();demo=options.demo??false;started=true;paused=false;photoMode=false;dismissedWin=false;toastUntil=0;eventHistory=[];keys.clear();clearTouch();
  document.body.classList.remove('photo-mode');effects.reset();friend.reset(companion);
  camYaw=0;camPitch=.48;camDistance=8.8;manualCameraUntil=0;accumulator=0;player.reset(state);updateCamera(0,true);
  document.body.classList.remove('in-intro');document.body.classList.add('started');
  if($('welcome')){$('welcome').style.display='none';$('welcome').hidden=true;}
  render();return publicSnapshot();
}
function startGame(isDemo=true){return reset({demo:isDemo});}
window.startGame=startGame;
function publicSnapshot(){return {...modelSnapshot(state),ready,started,paused,demo,photoMode,lighting,companion:companionSnapshot(companion),effects:effects?.stats,world:world?.stats,player:player?.stats,camera:{position:camera?.position.toArray(),yaw:camYaw,distance:camDistance,mode:cameraMode},graphics:frameStats,eventHistory:[...eventHistory]};}
function resize(){if(!renderer)return;renderer.setPixelRatio(capture?1:Math.min(devicePixelRatio,lowQuality?1:1.5));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();render();}
function clearTouch(){Object.keys(touch).forEach(k=>touch[k]=['x','z'].includes(k)?0:false);}
function setPause(value){if(!started)return;paused=value;keys.clear();clearTouch();accumulator=0;render();if(paused&&!photoMode)$('resume').focus();else canvas.focus();}
function changeCamera(){cameraMode=({follow:'fox-eye','fox-eye':'overlook',overlook:'follow'})[cameraMode];updateCamera(0,true);render();}
function togglePhoto(){if(!ready||!started)return;photoMode=!photoMode;document.body.classList.toggle('photo-mode',photoMode);setPause(photoMode);updateCamera(0,true);render();}
function setLighting(){
  const blue=lighting==='moon';scene.background.set(blue?'#273e51':'#6faaa7');scene.fog.color.copy(scene.background);
  sunlight.color.set(blue?'#a5c7ff':'#ffd6a1');sunlight.intensity=blue?1.7:3.1;
  ambientLight.intensity=blue?1.3:2.1;rimLight.intensity=blue?1.7:1.3;
  $('lightMode').textContent=blue?'MOON':'SUN';render();
}
function takeover(){demo=false;dismissedWin=true;if(state.status==='won')state.freeRoam=true;showToast('Your paws, your path.');canvas.focus();render();}
document.addEventListener('keydown',e=>{
  // Keep native Enter/Space activation and arrow navigation on focused controls.
  if(e.target.closest?.('input,select,textarea'))return;
  if(e.target.closest?.('button')&&['Space','Enter'].includes(e.code))return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code)&&e.code!=='Tab')e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Escape'){if(photoMode)togglePhoto();else setPause(!paused);return;}
  if(e.code==='KeyP'){togglePhoto();return;}
  if(e.code==='KeyV'&&started){changeCamera();return;}
  if(e.code==='KeyR'&&started){reset({demo:false});return;}
  if(e.code==='KeyM'){toggleSound();return;}
  if(e.code==='KeyC'){camDistance=camDistance>7?5.8:8.8;return;}
  if(started&&!paused){keys.add(e.code);if(demo&&['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code))takeover();}
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();touch.x=touch.z=0;if(!capture&&started&&!demo)setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!capture&&started&&!demo)setPause(true);});
canvas.addEventListener('pointerdown',e=>{dragging=true;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging||!lastPointer)return;camYaw-=(e.clientX-lastPointer.x)*.006;camPitch=THREE.MathUtils.clamp(camPitch+(e.clientY-lastPointer.y)*.004,.15,.95);manualCameraUntil=state.time+4;lastPointer={x:e.clientX,y:e.clientY};if(paused)updateCamera(0,true);});
canvas.addEventListener('pointerup',()=>{dragging=false;lastPointer=null;});canvas.addEventListener('pointercancel',()=>{dragging=false;lastPointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();camDistance=THREE.MathUtils.clamp(camDistance+e.deltaY*.006,4,13);if(paused){updateCamera(0,true);render();}},{passive:false});
const stick=$('stick'),stickKnob=stick.querySelector('i');let stickPointer=null;
function moveStick(e){const rect=stick.getBoundingClientRect();let x=(e.clientX-rect.left-rect.width/2)/40,z=(e.clientY-rect.top-rect.height/2)/40;const len=Math.hypot(x,z);if(len>1){x/=len;z/=len;}touch.x=x;touch.z=z;stickKnob.style.transform=`translate(${x*32}px,${z*32}px)`;}
stick.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);if(demo)takeover();moveStick(e);});
stick.addEventListener('pointermove',e=>{if(stickPointer===e.pointerId)moveStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,()=>{stickPointer=null;touch.x=touch.z=0;stickKnob.style.transform='';});
document.querySelectorAll('[data-input]').forEach(button=>{const name=button.dataset.input;button.addEventListener('pointerdown',e=>{if(demo)takeover();touch[name]=true;button.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touch[name]=false);});
$('play').onclick=()=>{reset({demo:false});canvas.focus();};$('watch').onclick=()=>reset({demo:true});$('takeover').onclick=takeover;
$('pause').onclick=()=>setPause(!paused);$('resume').onclick=()=>setPause(false);$('restart').onclick=()=>reset({demo:false});$('again').onclick=()=>reset({demo:false});
$('explore').onclick=()=>{dismissedWin=true;state.freeRoam=true;render();};$('sound').onclick=toggleSound;
$('quality').onclick=()=>{lowQuality=!lowQuality;renderer.shadowMap.enabled=!lowQuality;$('quality').textContent=lowQuality?'LITE':'HIGH';resize();};
$('viewMode').onclick=changeCamera;$('photoMode').onclick=togglePhoto;$('leavePhoto').onclick=togglePhoto;
$('lightMode').onclick=()=>{lighting=lighting==='golden'?'moon':'golden';setLighting();};
$('savePhoto').onclick=()=>{render();canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='Foxglade-Living-Wood.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);},'image/png');};
$('measuredCadence').onclick=()=>{if(!inspectMotionProfile(motionProfile).eligible)return;measured=!measured;player.setCadence(motionProfile,measured);$('measuredCadence').textContent=measured?'MEASURED TIMING':'AUTHORED TIMING';};
window.addEventListener('resize',resize);
window.foxgame={get ready(){return ready;},reset,startGame,advance(frames=1){if(!Number.isInteger(frames)||frames<0||frames>36000)throw Error('frames must be 0..36000');for(let i=0;i<frames;i++)tick();render();return publicSnapshot();},render,snapshot:publicSnapshot,captureFrame(){render();return canvas.toDataURL('image/jpeg',.94).split(',')[1];},setPaused:setPause};

async function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:capture,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#6faaa7');scene.fog=new THREE.FogExp2('#6faaa7',.018);
  camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,220);
  const ambient=new THREE.HemisphereLight(0xe0ffe7,0x244641,2.1);ambientLight=ambient;scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffd6a1,3.1);sun.position.set(-22,38,19);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;sun.shadow.camera.far=110;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);
  sunlight=sun;const rim=new THREE.DirectionalLight(0x95d6d2,1.3);rimLight=rim;rim.position.set(20,12,-30);scene.add(rim);
  world=createWorld(THREE,scene);
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  camera.position.set(0,3.2,29);camera.lookAt(0,1.2,21.5);renderer.render(scene,camera);
  const library=await loadRigLibrary(THREE);player=createPlayer(THREE,library,scene);friend=createPlayer(THREE,library,scene,{scale:.45});
  effects=createLivingEffects(THREE,scene);player.reset(state);friend.reset(companion);updateCamera(0,true);
  prepareCompanionNavigation();
  try{const result=await fetch('./motion-lab/output/real-animal-v2/profile.json');if(result.ok)motionProfile=await result.json();}catch{}
  const profileCheck=inspectMotionProfile(motionProfile);$('measuredCadence').disabled=!profileCheck.eligible;
  $('measuredCadence').title=profileCheck.eligible?'Experimental video-derived timing only. Source joint poses remain authored.':'Real-video evidence did not pass the cadence gate. Authored animation retained.';
  ready=true;resize();$('play').disabled=false;$('watch').disabled=false;$('play').textContent='Enter the wood';
  if(demo)startGame(true);
  if(!capture)requestAnimationFrame(loop);
}
function loop(now){
  const dt=lastNow?Math.min(.1,(now-lastNow)/1000):0;lastNow=now;accumulator+=dt;
  while(accumulator>=FIXED_DT){tick();accumulator-=FIXED_DT;}
  render();requestAnimationFrame(loop);
}
init().catch(error=>{console.error(error);$('failure').hidden=false;$('failure').textContent=`The forest could not load: ${error.message}. Use the local start.ps1 server and a WebGL2 browser.`;$('play').textContent='Loading failed';});

import * as THREE from '../foxglade-living-wood/vendor/three/three.module.js';
import {loadRigLibrary} from './rig-loader.mjs';
import {createScene} from './scene.mjs';
const $=id=>document.getElementById(id), params=new URLSearchParams(location.search), capture=params.has('capture');
const episode=['microscope','trails'].includes(params.get('episode'))?params.get('episode'):'microscope';
if(capture)document.documentElement.classList.add('capture');
const getJSON=async path=>{const response=await fetch(path);if(!response.ok)throw Error(`Required asset unavailable: ${path}`);return response.json();};
const [story,timing,rigLibrary]=await Promise.all([getJSON(`stories/${episode}.json`),getJSON(`media/audio/${episode}/timing.json`),loadRigLibrary(THREE)]);
const scene=createScene({canvas:$('stage'),THREE,story,resources:{rigLibrary,phrases:timing.phrases}});
const audio=new Audio(`media/audio/${episode}/narration.wav`);let playing=false,t=0;
const opts=()=>({captions:$('captions').checked});
function seek(value,options=opts()){t=Math.max(0,Math.min(48,value));scene.seek(t,options);$('scrub').value=t;$('time').textContent=`00:${String(Math.floor(t)).padStart(2,'0')} / 00:48`;$('chapter').textContent=(story.chapters.find(c=>t>=c.start&&t<c.end)||story.chapters.at(-1)).title;return scene.getState();}
window.explainer={ready:true,story,seek,async snapshot(time,options){seek(time,options);return {image:$('stage').toDataURL('image/jpeg',.94).split(',')[1],receipt:{...scene.getState(),time,width:1080,height:1920,episode,threeRevision:THREE.REVISION,narrationCueMode:'measured-sentence'}};},getState:()=>scene.getState()};
$('play').onclick=async()=>{try{playing=!playing;if(playing){if(t>=48)t=0;audio.currentTime=t;await audio.play();}else audio.pause();$('play').textContent=playing?'Pause':'Play with narration';}catch(error){playing=false;$('status').textContent=error.message;}};
$('scrub').oninput=()=>{audio.currentTime=Number($('scrub').value);seek(audio.currentTime);};
$('captions').onchange=()=>seek(t);
let autoLoop=!params.has('static'),lastWall=performance.now();
$('scrub').addEventListener('pointerdown',()=>{autoLoop=false;});
function tick(now){
  const dt=Math.min(0.1,Math.max(0,(now-lastWall)/1000));lastWall=now;
  if(playing){seek(audio.currentTime);if(audio.ended){playing=false;$('play').textContent='Play with narration';}}
  else if(autoLoop&&!capture){t=(t+dt)%48;seek(t);}
  requestAnimationFrame(tick);
}
seek(Number(params.get('t'))||2.4);if(!capture)requestAnimationFrame(tick);$('episode-name').textContent=story.title;$('status').textContent='Ready · Verified 49-bone rig · Four synchronized views';

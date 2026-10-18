/** Exact editorial clock. No physics, contact, retargeting or model-generation claim. */
export const DURATION = 48;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const normalizeTime = value => Number.isFinite(Number(value)) ? clamp(Number(value), 0, DURATION) : 0;
export const EPISODES = Object.freeze({
  microscope: Object.freeze({id:'microscope', clip:'Walk', assetId:'fox', title:'Motion, under the lens.', rates:[1,1,.35,0,.6,1]}),
  trails: Object.freeze({id:'trails', clip:'Run', assetId:'fox', title:'See the path of a pose.', rates:[.7,.7,.3,0,.5,.85]})
});
export const TIME_SEGMENTS = Object.freeze([[0,8],[8,16],[16,24],[24,28],[28,40],[40,48]].map(Object.freeze));
export const TRAIL_BONES = Object.freeze([
  Object.freeze({name:'Front_Leg_Foot_L', label:'FRONT FOOT', color:'#8fe8cb'}),
  Object.freeze({name:'Tail_Tip', label:'TAIL TIP', color:'#ffbf8f'})
]);
export const PANEL_RECTS = Object.freeze([
  {id:'surface', label:'SURFACE', view:'beauty', x:52,y:420,w:476,h:498},
  {id:'wire', label:'WIREFRAME', view:'wire', x:552,y:420,w:476,h:498},
  {id:'skeleton', label:'SKELETON', view:'skeleton', x:52,y:942,w:476,h:498},
  {id:'profile', label:'PROFILE', view:'beauty', x:552,y:942,w:476,h:498}
].map(Object.freeze));
export function panelRects(){ return PANEL_RECTS.map(r=>({...r})); }
export const TEXT_RECTS = Object.freeze({header:{x:52,y:45,w:976,h:316},clock:{x:52,y:365,w:976,h:39},caption:{x:52,y:1540,w:976,h:236},footer:{x:52,y:1800,w:976,h:84}});
export function mapPoseTime(value, episode='microscope') {
  const t=normalizeTime(value), config=EPISODES[episode]??EPISODES.microscope;
  let poseTime=0, rate=config.rates.at(-1);
  for(let i=0;i<TIME_SEGMENTS.length;i++){
    const [start,end]=TIME_SEGMENTS[i];
    poseTime+=clamp(t-start,0,end-start)*config.rates[i];
    if(t>=start&&t<end) rate=config.rates[i];
  }
  return {poseTime, playbackRate:rate, frozen:rate===0, phase:rate===0?'freeze':rate<1?'slow':'normal', label:rate===0?'FREEZE / SAME INSTANT':`${rate.toFixed(2)}× CLIP SPEED`};
}
export function stateAt(value, episode='microscope') {
  const time=normalizeTime(value),config=EPISODES[episode]??EPISODES.microscope,index=Math.min(5,Math.floor(time/8));
  const pose=mapPoseTime(time,config.id);
  return {time,duration:DURATION,width:WIDTH,height:HEIGHT,episode:config.id,asset:'fox',assetId:'fox',clip:config.clip,...pose,
    chapterIndex:index,chapterProgress:clamp((time-index*8)/8,0,1),focusPanel:(config.id==='trails'?[0,3,3,2,3,3]:[0,0,1,2,2,3])[index],
    layout:'synchronized-quad',panels:panelRects(),trailWindow:.48,trailSampleCount:29,
    trailsEnabled:config.id==='trails',trailBones:TRAIL_BONES.map(x=>({...x})),seed:10417};
}
export function chapterAt(value, story={}){
  const time=normalizeTime(value),index=Math.min(5,Math.floor(time/8));
  const supplied=story.chapters?.find(c=>time>=c.start&&time<c.end)??story.chapters?.[index]??{};
  return {index,start:index*8,end:(index+1)*8,kicker:'THE MOTION MICROSCOPE',title:EPISODES[story.episode]?.title??'One fox. Four views.',body:'Same rig. Same clip. Same instant.',...supplied};
}
/** Only measured sentence intervals supplied by the narrator are displayed. */
export function captionAt(value, phrases=[], chapter={}){
  const time=normalizeTime(value);
  const valid=phrases.filter(p=>typeof p.text==='string'&&p.text.trim()&&Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.end>p.start&&p.start>=(chapter.start??0)&&p.start<(chapter.end??DURATION));
  const active=valid.find(p=>time>=p.start&&time<p.end);
  return active?{mode:'measured-sentence',text:active.text,start:active.start,end:active.end,words:[]}:{mode:'silent',text:'',words:[]};
}
/** Noncryptographic reproducibility fingerprint of every actual local bone transform. */
export function poseFingerprint(bones){
  let h=2166136261;
  const serialized=JSON.stringify(bones.map(b=>b.map(v=>typeof v==='number'?Number(v.toFixed(7)):v)));
  for(let i=0;i<serialized.length;i++){h^=serialized.charCodeAt(i);h=Math.imul(h,16777619);}
  return `fnv1a-${(h>>>0).toString(16).padStart(8,'0')}`;
}

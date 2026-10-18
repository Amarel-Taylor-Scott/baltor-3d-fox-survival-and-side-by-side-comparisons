// Global pixel coordinates. Layout names mean rows x columns.
export const W=1080,H=1920;
export const clamp=x=>Math.min(1,Math.max(0,x));
export const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function panelLayout(kind){
  const defs=kind==='2x2'?[[87,448,441,469],[552,448,441,469],[87,941,441,469],[552,941,441,469]]:
    kind==='1x2'?[[87,448,441,962],[552,448,441,962]]:
    kind==='2x1'?[[87,448,906,469],[87,941,906,469]]:null;
  if(!defs)throw Error('Unknown rows-by-columns layout');
  return defs.map(([x,y,width,height],i)=>({id:'panel-'+i,x,y,width,height}));
}
export function pendulumAngle(t,length){return .1*Math.cos(Math.sqrt(9.81/length)*t);}
// A conceptual two-request sequence, not measured network time.
export function cacheFlow(t,cached){
  const repeat=t>=3.8,start=repeat?3.8:.35,span=repeat&&cached?1.35:2.6;
  const phase=clamp((t-start)/span),u=phase<=.5?ease(phase*2):1-ease((phase-.5)*2);
  return {repeat,phase,u,endpoint:repeat&&cached?'cache':'origin',stored:t>=2.95,
    originCalls:repeat&&!cached?2:1,packetVisible:t>=start&&phase<1,completed:phase>=1};
}

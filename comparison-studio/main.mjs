import {createTextLayout,drawTextLayout} from './lab_text.mjs';
import {renderPanel} from './panels.mjs';
import {W,H,clamp,ease,panelLayout,pendulumAngle,cacheFlow} from './composition.mjs';
const canvas=document.querySelector('#picture'),ctx=canvas.getContext('2d');
const recipes=await(await fetch('./recipes.json')).json();
const palettes={editorial:{bg:'#08121f',card:'#12273a',ink:'#f1f1e7',dim:'#9db4c8',a:'#f0ba66',b:'#77ded2',line:'#304d66'},neon:{bg:'#100e23',card:'#211a3d',ink:'#faf4ff',dim:'#b9acd1',a:'#ff9bc2',b:'#82e6e8',line:'#49365e'}};
let lastState;
function rounded(x,y,w,h,r=24){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function glow(x,y,r,color,alpha=1){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color+'50');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}
function background(p,t,neon){
  ctx.fillStyle=p.bg;ctx.fillRect(0,0,W,H);
  glow(820+30*Math.sin(t*.16),240,740,p.b,.30);glow(180,1400+25*Math.sin(t*.12),720,p.a,.23);
  ctx.save();ctx.strokeStyle=p.line;ctx.globalAlpha=.16;ctx.lineWidth=1;
  for(let x=24;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.globalAlpha=.22;ctx.strokeStyle=p.b;ctx.lineWidth=1.5;
  for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(1020,390,350+i*48,540+i*44,-.4,0,Math.PI*2);ctx.stroke();}
  ctx.restore();const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,p.bg+'88');g.addColorStop(.5,p.bg+'00');g.addColorStop(1,p.bg+'cc');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}
function card(p,b,index,t,total,neon){
  ctx.save();ctx.shadowColor='#00000070';ctx.shadowBlur=28;ctx.shadowOffsetY=14;rounded(b.x,b.y,b.width,b.height);ctx.fillStyle=p.card;ctx.fill();ctx.restore();
  ctx.save();rounded(b.x,b.y,b.width,b.height);ctx.clip();const g=ctx.createLinearGradient(b.x,b.y,b.x+b.width,b.y+b.height);g.addColorStop(0,'#ffffff0b');g.addColorStop(.5,'#ffffff00');g.addColorStop(1,p.b+'12');ctx.fillStyle=g;ctx.fillRect(b.x,b.y,b.width,b.height);
  // Slow lighting sweep confined to the background, beneath content.
  ctx.globalAlpha=.06;const pos=b.x-200+((t+index*.8)/10)*(b.width+300);ctx.fillStyle=p.b;ctx.beginPath();ctx.moveTo(pos,b.y);ctx.lineTo(pos+34,b.y);ctx.lineTo(pos+b.height*.4+34,b.y+b.height);ctx.lineTo(pos+b.height*.4,b.y+b.height);ctx.fill();ctx.restore();
  const focus=clamp(1-Math.abs(t-(index+.5)*(8/total))/(8/total));
  ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle=p.line;rounded(b.x+.75,b.y+.75,b.width-1.5,b.height-1.5);ctx.stroke();
  const border=ctx.createLinearGradient(b.x,b.y,b.x+b.width,b.y+b.height);border.addColorStop(0,p.b);border.addColorStop(.5,p.a);border.addColorStop(1,p.b);
  ctx.strokeStyle=border;ctx.globalAlpha=.24+.48*ease(focus);ctx.lineWidth=2.5;if(neon){ctx.shadowColor=p.b;ctx.shadowBlur=8;}rounded(b.x+2,b.y+2,b.width-4,b.height-4);ctx.stroke();ctx.restore();
  ctx.fillStyle=p.b+'80';ctx.fillRect(b.x+24,b.y+85,b.width-48,1);
}
function add(items,id,text,x,y,width,size,color,panelId=null,min=36){items.push({id,text,x,y,maxWidth:width,fontSize:size,minFontSize:Math.min(min,size),fontWeight:'600',color,panelId});}
function node(x,y,color,type){
  ctx.save();ctx.shadowColor='#00000060';ctx.shadowBlur=20;ctx.shadowOffsetY=12;rounded(x-75,y-55,150,110,18);ctx.fillStyle=color+'22';ctx.fill();ctx.restore();
  const g=ctx.createLinearGradient(x-70,y-60,x+75,y+60);g.addColorStop(0,color+'55');g.addColorStop(1,color+'15');ctx.fillStyle=g;rounded(x-75,y-55,150,110,18);ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=color+'aa';ctx.stroke();
  if(type==='origin'){for(let i=0;i<3;i++){rounded(x-52,y-34+i*26,104,17,4);ctx.fillStyle=color+'55';ctx.fill();ctx.fillStyle=color;ctx.fillRect(x+34,y-29+i*26,5,5);}}
  else if(type==='cache'){for(let i=0;i<3;i++){rounded(x-40+i*4,y-32+i*14,72,36,7);ctx.fillStyle='#15263b';ctx.fill();ctx.strokeStyle=color;ctx.stroke();}}
  else{rounded(x-46,y-32,92,60,6);ctx.strokeStyle=color;ctx.stroke();ctx.fillStyle=color;ctx.fillRect(x-20,y+34,40,3);ctx.fillRect(x-2,y+28,4,8);}
}
function drawCache(p,b,index,t,items){
  const cached=index===1,s=cacheFlow(t,cached),xs=[b.x+145,b.x+453,b.x+761],cy=b.y+203;
  ctx.save();ctx.strokeStyle=p.line;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(xs[0]+78,cy);ctx.lineTo(xs[2]-78,cy);ctx.stroke();
  ctx.setLineDash([5,14]);ctx.lineDashOffset=-t*18;ctx.strokeStyle=p.b+'70';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  node(xs[0],cy,p.b,'client');node(xs[2],cy,p.a,'origin');if(cached)node(xs[1],cy,s.stored?p.b:p.dim,'cache');
  if(s.packetVisible){const end=s.endpoint==='cache'?xs[1]:xs[2],x=xs[0]+(end-xs[0])*s.u;glow(x,cy,45,p.a,.7);ctx.fillStyle=p.a;ctx.beginPath();ctx.arc(x,cy,11,0,Math.PI*2);ctx.fill();}
  if(cached&&s.stored){ctx.fillStyle=p.b;ctx.beginPath();ctx.arc(xs[1]+62,cy-45,7,0,Math.PI*2);ctx.fill();}
  for(const [i,txt]of[[0,'INPUT'],[2,'COMPUTE'],...(cached?[[1,'CACHE']]:[])])add(items,b.id+'-node-'+i,txt,xs[i]-106,b.y+280,212,36,p.dim,b.id);
  add(items,b.id+'-count',t<3.8?'First request: compute':`Computations: ${s.originCalls}`,b.x+24,b.y+375,b.width-48,40,cached?p.b:p.a,b.id);
  return {finite:true,originCalls:s.originCalls,stored:cached&&s.stored,phase:s.phase,model:'authored conceptual packet route; no timing benchmark'};
}
function angleTrace(p,b,index,t){
  const x=b.x+40,y=b.y+b.height-142,w=b.width-80,h=34,L=index?4:1;
  ctx.save();ctx.lineWidth=1;ctx.strokeStyle=p.line;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();
  ctx.strokeStyle=index?p.b:p.a;ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=120;i++){const at=t*i/120,px=x+w*at/8,py=y-pendulumAngle(at,L)/.1*h;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();ctx.restore();
}
function render(t,options={}){
  if(!Number.isFinite(t)||t<0||t>=8)throw Error('Time must be in [0,8)');
  const r=recipes.find(r=>r.id===(options.id||recipes[0].id));if(!r)throw Error('Unknown recipe');
  const p=palettes[r.style],panels=panelLayout(r.layout),neon=r.style==='neon',items=[],metrics=[];background(p,t,neon);
  add(items,'brand','CONTENT LOOP / '+r.layout+' VISUAL LAB',87,154,906,28,p.b,null,28);
  add(items,'title',r.title,87,232,906,76,p.ink,null,58);
  for(const [i,b]of panels.entries()){
    card(p,b,i,t,panels.length,neon);
    add(items,b.id+'-label',r.panels[i],b.x+24,b.y+12,b.width-48,44,p.ink,b.id,40);
    if(r.topic==='cache')metrics.push(drawCache(p,b,i,t,items));else{
      const image={x:b.x+20,y:b.y+106,width:b.width-40,height:r.topic==='pendulum'?680:269};
      const result=renderPanel({topic:r.topic,index:i,t,width:image.width,height:image.height,style:r.style});
      ctx.save();rounded(image.x,image.y,image.width,image.height,12);ctx.clip();ctx.drawImage(result.canvas,image.x,image.y,image.width,image.height);ctx.restore();metrics.push({...result.metrics,image,panelId:b.id});
      if(r.topic==='surface'){
        // Matched 3x detail lenses sample actual rendered edge pixels in every panel.
        const alpha=ease((t-1.2)/.9),cx=image.x+image.width-48,cy=image.y+134,radius=42;
        ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=p.b+'80';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(image.x+278,image.y+125);ctx.lineTo(cx-radius,cy);ctx.stroke();
        ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();ctx.fillStyle=p.card;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
        ctx.drawImage(result.canvas,264,111,28,28,cx-radius,cy-radius,radius*2,radius*2);ctx.restore();
        ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=p.b;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
      let foot=r.topic==='lighting'?['Low contrast','Crisp shadows','Gentler shading','Edge separation'][i]:r.topic==='surface'?['Smooth edge','Light-only detail','Raised silhouette','Relief + finish'][i]:['Period: 2.01 s','Period: 4.01 s'][i];
      if(r.topic==='pendulum')angleTrace(p,b,i,t);
      add(items,b.id+'-foot',foot,b.x+24,b.y+b.height-92,b.width-48,36,i%2?p.b:p.a,b.id);
    }
  }
  const takeaway=r.topic==='lighting'?(t<3.8?'Watch the edges.':'Same shape. Different lighting.'):
    r.topic==='surface'?(t<3.8?'Follow the silhouette.':'Bump shades. Geometry reshapes.'):
    r.topic==='pendulum'?(t<3.8?'Same gravity. Same small angle.':'4× the length. 2× the period.'):
    (t<3.8?'First, save the result.':'Then reuse a valid result.');
  // A continuous progress ruler replaces hard flashing transitions.
  ctx.fillStyle=p.line;rounded(87,1450,906,4,2);ctx.fill();ctx.fillStyle=p.b;rounded(87,1450,Math.max(4,906*t/8),4,2);ctx.fill();
  add(items,'takeaway',takeaway,87,1490,906,56,p.ink,null,44);
  const scope={lighting:'STYLIZED LIGHTING STUDY',surface:'PROCEDURAL MESH + BUMP STUDY',pendulum:'IDEAL SMALL-ANGLE MODEL / NO DRAG',cache:'CONCEPTUAL FLOW / NOT A SPEED TEST'}[r.topic];
  add(items,'scope',scope,87,1695,906,28,p.dim,null,28);
  const layout=createTextLayout(ctx,items,{width:W,height:H,insetX:87,insetY:154,minGap:24});
  for(const box of layout.boxes)box.panelId=items.find(i=>i.id===box.id).panelId;
  if(!layout.pass)throw Error(JSON.stringify(layout.errors));drawTextLayout(ctx,layout);
  const panelsSafe=layout.boxes.every(b=>!b.panelId||panels.some(p=>p.id===b.panelId&&b.x>=p.x&&b.y>=p.y&&b.x+b.width<=p.x+p.width&&b.y+b.height<=p.y+p.height));
  const state={id:r.id,time:t,width:W,height:H,textSafe:layout.pass,layout,panelsSafe,panels,metrics,finite:metrics.every(m=>m.finite!==false),motion:'absolute time; synchronized matched panel cameras; no camera shake',effects:['layered gradient backdrop','vector contour field','masked panels','subtle border glow','background light sweep','progress ruler'],beat:t<3.8?0:1};
  lastState=state;document.querySelector('#state').textContent=JSON.stringify({id:r.id,layout:layout.pass,panels:panels.length,time:t.toFixed(2)},null,2);return state;
}
window.forgeExample={ready:false,error:null,duration:8,inspect:()=>({width:W,height:H,duration:8,engine:'Three.js + Canvas compositing',scope:'Original educational pilots'}),render,framePNG:()=>canvas.toDataURL('image/png'),frameJPEG:()=>canvas.toDataURL('image/jpeg',.95)};
try{const select=document.querySelector('#film');for(const r of recipes){const o=document.createElement('option');o.value=r.id;o.textContent=r.id;select.append(o);}const requested=new URLSearchParams(location.search).get('id');if(recipes.some(r=>r.id===requested))select.value=requested;const seek=()=>render(Number(document.querySelector('#time').value),{id:select.value});select.onchange=seek;document.querySelector('#time').oninput=seek;let playback=0;document.querySelector('#play').onclick=()=>{const token=++playback,start=performance.now();function tick(now){if(token!==playback)return;const t=Math.max(0,Math.min(239/30,(now-start)/1000));document.querySelector('#time').value=t;render(t,{id:select.value});if(t<239/30)requestAnimationFrame(tick);}requestAnimationFrame(tick);};const initT=Number(new URLSearchParams(location.search).get('t'))||2.2;
document.querySelector('#time').value=initT;
render(initT,{id:select.value});
window.forgeExample.ready=true;
if(!new URLSearchParams(location.search).has('static')){
  document.querySelector('#play').click();
}
}catch(e){window.forgeExample.error=String(e);throw e;}

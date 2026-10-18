const $=id=>document.getElementById(id),base='./motion-lab/output/real-animal-v2/';
const colors=['#b6edd2','#efb76c','#87bde6','#e6a0b1'],paws=[7,10,13,16];
const edges=[[0,1],[0,2],[1,2],[2,3],[3,4],[3,5],[5,6],[6,7],[3,8],[8,9],[9,10],[4,11],[11,12],[12,13],[4,14],[14,15],[15,16]];
async function json(file){const response=await fetch(base+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);return response.json();}
try{
  const [poses,profile,report]=await Promise.all(['poses.json','profile.json','report.json'].map(json));
  if(poses.schemaVersion!==1||!Array.isArray(poses.frames)||!poses.frames.length)throw Error('No verified pose frames available.');
  const video=$('source'),canvas=$('pose'),ctx=canvas.getContext('2d'),trace=$('trace'),plot=trace.getContext('2d');
  canvas.width=poses.image.width;canvas.height=poses.image.height;
  // Pin the viewer to the attributed local excerpt, never a URL from remote text.
  video.src='./motion-lab/sources/fox-walk-22-31.mp4';
  const frames=poses.frames,last=frames.at(-1).timeSeconds;
  const blocked=profile.status!=='experimental-measured';
  $('gate').textContent=blocked?'NOT ADMITTED TO GAME':'EXPERIMENTAL TIMING ONLY';
  $('findingTitle').textContent=blocked?'Useful observations. Not a reliable gait loop.':'A timing signal worth testing.';
  $('findingBody').textContent=blocked?'The fox changes pace, turns its head and walks through grass. The fitted paw rhythms did not stay reliable on held-out frames, so the game keeps its supplied animation timing.':'Several paw rhythms held up on unseen frames from this clip. Timing remains opt-in; the game still uses its supplied 3D joint poses.';
  $('frameCount').textContent=frames.length;
  $('passing').textContent=`${profile.quality.passingPawSignals} / ${profile.quality.totalPawSignals}`;
  $('coverage').textContent=`${Math.round(profile.quality.torsoCoverage*100)}%`;
  for(const signal of report.signals??[]){const div=document.createElement('div');div.textContent=`${signal.joint}: ${signal.passes?'passes':'not accepted'} · held-out error ${Number.isFinite(signal.holdoutNRMSE)?signal.holdoutNRMSE.toFixed(2):'unavailable'} · improvement ${Number.isFinite(signal.holdoutImprovement)?(signal.holdoutImprovement*100).toFixed(1)+'%':'unavailable'}`;$('signals').append(div);}
  const torso=frames.map(f=>Math.hypot(f.points[3][0]-f.points[4][0],f.points[3][1]-f.points[4][1])).filter(Number.isFinite).sort((a,b)=>a-b);
  const scale=torso[Math.floor(torso.length/2)]||1;
  const traces=paws.map(j=>frames.map(f=>f.valid[j]&&f.valid[3]&&f.valid[4]?(f.points[j][0]-(f.points[3][0]+f.points[4][0])/2)/scale:null));
  function paint(){
    const time=video.currentTime,index=Math.min(frames.length-1,Math.max(0,Math.round(time*(poses.source.sampleFps||25)))),frame=frames[index];
    ctx.fillStyle='#0b2027';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(video.readyState>=2){ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.fillStyle='#071e2840';ctx.fillRect(0,0,canvas.width,canvas.height);}
    ctx.lineWidth=3;ctx.strokeStyle='#b6edd2';
    for(const [a,b] of edges)if(frame.valid[a]&&frame.valid[b]){ctx.beginPath();ctx.moveTo(...frame.points[a]);ctx.lineTo(...frame.points[b]);ctx.stroke();}
    frame.points.forEach((p,j)=>{if(!frame.valid[j])return;ctx.fillStyle=paws.includes(j)?colors[paws.indexOf(j)]:'#fff0d6';ctx.beginPath();ctx.arc(p[0],p[1],5,0,Math.PI*2);ctx.fill();});
    $('frameLabel').textContent=`FRAME ${index+1} / ${frames.length} · ${time.toFixed(2)}s`;
    const w=trace.width,h=trace.height,left=55,right=w-28,top=25,bottom=h-48;
    plot.fillStyle='#102d33';plot.fillRect(0,0,w,h);plot.fillStyle='#efb76c0f';plot.fillRect(left+(right-left)*.7,top,(right-left)*.3,bottom-top);
    plot.font='15px Arial';plot.fillStyle='#a5bcb7';plot.fillText('FIT',left+10,top+20);plot.fillText('HELD OUT',left+(right-left)*.7+10,top+20);
    const x=i=>left+i/(frames.length-1)*(right-left),y=value=>bottom-(Math.max(-1.5,Math.min(1.5,value))+1.5)/3*(bottom-top);
    for(let level=-1.5;level<=1.5;level+=.5){const yy=y(level);plot.strokeStyle='#b6edd218';plot.beginPath();plot.moveTo(left,yy);plot.lineTo(right,yy);plot.stroke();plot.fillStyle='#8aaba5';plot.fillText(level.toFixed(1),5,yy+5);}
    traces.forEach((values,j)=>{plot.strokeStyle=colors[j];plot.lineWidth=2;plot.beginPath();let active=false;values.forEach((value,i)=>{if(value===null){active=false;return;}if(active)plot.lineTo(x(i),y(value));else{plot.moveTo(x(i),y(value));active=true;}});plot.stroke();});
    plot.strokeStyle='#f3f0de';plot.lineWidth=1.5;plot.beginPath();plot.moveTo(x(index),top);plot.lineTo(x(index),bottom);plot.stroke();
    plot.fillStyle='#a5bcb7';for(let sec=0;sec<=last;sec+=2)plot.fillText(`${sec}s`,left+sec/last*(right-left),h-17);
  }
  video.addEventListener('timeupdate',paint);video.addEventListener('seeked',paint);video.addEventListener('loadeddata',paint);
  const loop=()=>{if(!video.paused)paint();requestAnimationFrame(loop);};requestAnimationFrame(loop);
  $('loading').hidden=true;$('study').hidden=false;paint();video.play().catch(()=>{});
}catch(error){$('loading').textContent=`The study could not load: ${error.message}`;console.error(error);}

import test from 'node:test';
import assert from 'node:assert/strict';
import {DURATION,WIDTH,HEIGHT,stateAt,mapPoseTime,captionAt,chapterAt,panelRects,TEXT_RECTS,poseFingerprint} from './model.mjs';
test('two episodes retain one actual asset and clip across all 1441 samples',()=>{
  for(const ep of ['microscope','trails'])for(let f=0;f<=1440;f++){
    const s=stateAt(f/30,ep);assert.equal(s.asset,'fox');assert.equal(s.clip,ep==='trails'?'Run':'Walk');assert.equal(s.panels.length,4);assert.ok(Number.isFinite(s.poseTime));assert.ok(s.poseTime>=0);assert.ok(s.chapterIndex>=0&&s.chapterIndex<6);
  }
  assert.deepEqual([DURATION,WIDTH,HEIGHT],[48,1080,1920]);
});
test('piecewise clock is monotonic, continuous, and explicitly frozen at 24–28 seconds',()=>{
  for(const ep of ['microscope','trails']){
    let prior=-1;for(let f=0;f<=5760;f++){const p=mapPoseTime(f/120,ep);assert.ok(p.poseTime>=prior);prior=p.poseTime;}
    for(const t of [8,16,24,28,40])assert.ok(Math.abs(mapPoseTime(t-1e-7,ep).poseTime-mapPoseTime(t+1e-7,ep).poseTime)<1e-6);
    assert.equal(mapPoseTime(24,ep).poseTime,mapPoseTime(27.999,ep).poseTime);assert.equal(mapPoseTime(26,ep).phase,'freeze');assert.notEqual(mapPoseTime(28.1,ep).phase,'freeze');
  }
  assert.equal(mapPoseTime(48).poseTime,34);assert.ok(Math.abs(mapPoseTime(48,'trails').poseTime-26.4)<1e-12);
});
test('seeking backwards cannot affect states and invalid time is bounded',()=>{
  const a=stateAt(21.35,'trails');stateAt(47);stateAt(0);assert.deepEqual(stateAt(21.35,'trails'),a);
  assert.equal(stateAt(-10).time,0);assert.equal(stateAt(NaN).time,0);assert.equal(stateAt(Infinity).time,0);assert.equal(stateAt(60).time,48);assert.equal(chapterAt(48).index,5);
});
test('panels and typography regions are inside canvas with no mutual overlap',()=>{
  const boxes=[...panelRects(),...Object.values(TEXT_RECTS)];
  for(const p of boxes){assert.ok(p.x>=0&&p.y>=0&&p.x+p.w<=WIDTH&&p.y+p.h<=HEIGHT);assert.ok(p.w>0&&p.h>0);}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`boxes ${i}/${j} overlap`);}
});
test('caption words and unspoken chapter filler cannot be fabricated',()=>{
  const phrases=[{start:1,end:3,text:'Actual sentence.'}];assert.equal(captionAt(2,phrases).text,'Actual sentence.');assert.deepEqual(captionAt(2,phrases).words,[]);assert.equal(captionAt(3.1,phrases).mode,'silent');assert.equal(captionAt(2,phrases,{start:8,end:16}).text,'');
});
test('pose fingerprints respond to actual transforms and ignore subprecision noise',()=>{
  const a=[['Head',0,1,2,0,0,0,1]],b=[['Head',0,1,2,0,0,.1,1]];assert.equal(poseFingerprint(a),poseFingerprint(a));assert.notEqual(poseFingerprint(a),poseFingerprint(b));assert.equal(poseFingerprint(a),poseFingerprint([['Head',1e-10,1,2,0,0,0,1]]));
});

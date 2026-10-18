import test from 'node:test';
import assert from 'node:assert/strict';
import {createTextLayout,drawTextLayout} from './lab_text.mjs';

// Controlled metrics test geometry and rejection paths, not real browser fonts.
function context() {
  const stack=[],calls=[];
  return {font:'10px Arial',textAlign:'start',textBaseline:'alphabetic',calls,
    save(){stack.push({font:this.font,textAlign:this.textAlign,textBaseline:this.textBaseline});},
    restore(){Object.assign(this,stack.pop());},
    measureText(text){const size=Number(this.font.match(/(\d+)px/)[1]),width=text.length*size*.5;
      return {width,actualBoundingBoxLeft:2,actualBoundingBoxRight:width-2,
        actualBoundingBoxAscent:size*.75,actualBoundingBoxDescent:size*.25};},
    fillText(...args){calls.push({type:'text',args,font:this.font});},
    fillRect(...args){calls.push({type:'rect',args});}};
}
const item=(extra={})=>({id:'title',text:'Build something useful',x:87,y:154,maxWidth:906,fontSize:52,...extra});

test('actual ink plus padding is centered in the supplied region',()=>{
  const ctx=context(),layout=createTextLayout(ctx,[item()]);
  assert.equal(layout.pass,true);assert.equal(layout.boxes[0].fontSize,52);
  const b=layout.boxes[0],line=b.lines[0];
  assert.equal(b.x+b.width/2,540);assert.equal(line.ink.x+line.ink.width/2,540);
  assert.equal(b.y,154);assert.equal(b.height,84);assert.equal(ctx.font,'10px Arial');
});
test('bounded wrapping preserves exact words and never uses a fourth line',()=>{
  const layout=createTextLayout(context(),[item({text:'One two three four five six seven eight nine',maxWidth:340})]);
  assert.equal(layout.pass,true);const b=layout.boxes[0];
  assert.ok(b.lines.length<=3);assert.ok(b.fontSize>=36);
  assert.equal(b.lines.map(x=>x.text).join(' '),'One two three four five six seven eight nine');
});
test('unbreakable long tokens fail instead of going below the font floor',()=>{
  const layout=createTextLayout(context(),[item({text:'x'.repeat(80),maxWidth:180})]);
  assert.equal(layout.pass,false);assert.equal(layout.boxes.length,0);
  assert.match(layout.errors[0],/font floor/);
});
test('metadata has an explicit 28px exception; arbitrary smaller floors fail',()=>{
  assert.equal(createTextLayout(context(),[item({fontSize:28,minFontSize:28})]).pass,true);
  assert.equal(createTextLayout(context(),[item({minFontSize:27})]).pass,false);
  assert.equal(createTextLayout(context(),[item({minFontSize:30})]).pass,false);
});
test('authored regions outside safe bounds fail without being relocated',()=>{
  for(const change of [{x:86},{y:153},{maxWidth:907},{y:1750}])
    assert.equal(createTextLayout(context(),[item(change)]).pass,false);
});
test('exact 24px gap passes; 23px gap and overlapping boxes fail',()=>{
  const a=item({text:'A',fontSize:40}),b=item({id:'subtitle',text:'B',fontSize:40,y:250});
  assert.equal(createTextLayout(context(),[a,b]).pass,true); // 154+72+24
  assert.equal(createTextLayout(context(),[a,{...b,y:249}]).pass,false);
  const overlap=createTextLayout(context(),[a,{...b,y:160}]);
  assert.equal(overlap.pass,false);assert.match(overlap.errors[0],/overlap/);
});
test('missing actual ink metrics fail rather than using estimated font boxes',()=>{
  const ctx=context();ctx.measureText=()=>({width:100});
  const layout=createTextLayout(ctx,[item()]);
  assert.equal(layout.pass,false);assert.match(layout.errors[0],/actual ink metrics/);
});
test('explicit paragraph breaks are preserved and empty paragraphs rejected',()=>{
  const layout=createTextLayout(context(),[item({text:'One\nTwo\nThree'})]);
  assert.equal(layout.pass,true);assert.equal(layout.boxes[0].lines.length,3);
  assert.equal(createTextLayout(context(),[item({text:'One\n\nThree'})]).pass,false);
});
test('duplicate IDs and malformed frame parameters fail',()=>{
  assert.equal(createTextLayout(context(),[item(),item()]).pass,false);
  assert.equal(createTextLayout(context(),[item()],{width:100}).pass,false);
  assert.equal(createTextLayout(context(),[item()],{minGap:NaN}).pass,false);
});
test('draw uses measured baselines and restores caller text state',()=>{
  const ctx=context(),layout=createTextLayout(ctx,[item({background:'#102030'})]);
  drawTextLayout(ctx,layout);const line=layout.boxes[0].lines[0];
  assert.deepEqual(ctx.calls[1].args,[line.text,line.baselineX,line.baselineY]);
  assert.equal(ctx.calls[1].font,layout.boxes[0].font);assert.equal(ctx.font,'10px Arial');
  assert.throws(()=>drawTextLayout(ctx,{pass:false}),/Refusing/);
});

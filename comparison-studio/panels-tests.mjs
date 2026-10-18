import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import {makeVaseGeometry,vaseRelief,analyticalPendulum,VASE_PROFILE,sampledVaseProfile,normalizedBounds} from './panels.mjs';

test('True flute geometry alters positions while preserving vessel height and positive wall thickness',()=>{
  const smooth=makeVaseGeometry(false),fluted=makeVaseGeometry(true);
  const a=smooth.getAttribute('position'),b=fluted.getAttribute('position');
  assert.equal(a.count,b.count);
  let changed=0;
  for(let i=0;i<a.count;i++){
    assert.ok([b.getX(i),b.getY(i),b.getZ(i)].every(Number.isFinite));
    assert.equal(a.getY(i),b.getY(i));
    changed+=Math.hypot(a.getX(i)-b.getX(i),a.getZ(i)-b.getZ(i))>.001?1:0;
  }
  // The deliberately smooth lip, foot and bottom remain unchanged.
  assert.ok(changed>a.count*.35);
  assert.equal(smooth.boundingBox.min.y,fluted.boundingBox.min.y);
  assert.equal(smooth.boundingBox.max.y,fluted.boundingBox.max.y);
  assert.ok(fluted.boundingBox.max.x>smooth.boundingBox.max.x+.04);
  // Both walls receive the same physical-height displacement, preserving
  // the radial thickness for corresponding inner/outer body points.
  for(let i=6;i<=13;i++){
    const [outer,y]=VASE_PROFILE[i];
    const innerProfile=VASE_PROFILE.slice(22,34).slice().reverse();
    let inner;
    for(let j=1;j<innerProfile.length;j++)if(y>=innerProfile[j-1][1]&&y<=innerProfile[j][1]){
      const [r0,y0]=innerProfile[j-1],[r1,y1]=innerProfile[j];
      inner=r0+(r1-r0)*(y-y0)/(y1-y0);break;
    }
    assert.ok(outer-inner>.045,`wall at ${y}`);
    for(let k=0;k<40;k++)assert.ok(outer+vaseRelief(y,k*Math.PI/20,true)-(inner+vaseRelief(y,k*Math.PI/20,true))>.045);
  }
  smooth.dispose();fluted.dispose();
});

test('Vase triangle winding and area form exterior, interior and solid bottom without zero-area faces',()=>{
  const g=makeVaseGeometry(true),p=g.getAttribute('position'),idx=g.index;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  let signedVolume=0;
  for(let i=0;i<idx.count;i+=3){
    a.fromBufferAttribute(p,idx.getX(i));b.fromBufferAttribute(p,idx.getX(i+1));c.fromBufferAttribute(p,idx.getX(i+2));
    const area=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;
    assert.ok(area>1e-10,`face ${i/3} has zero area`);
    signedVolume+=a.dot(b.clone().cross(c))/6;
  }
  assert.ok(signedVolume>.25&&signedVolume<2,`positive material volume ${signedVolume}`);
  const normals=g.getAttribute('normal');
  for(let row=0;row<sampledVaseProfile().length;row++)for(let axis=0;axis<3;axis++){
    const first=normals.array[(row*161)*3+axis],last=normals.array[(row*161+160)*3+axis];
    assert.equal(first,last,'UV seam normals must agree');
  }
  g.dispose();
});

test('Smooth interpolation maintains separation between inner and outer vessel walls',()=>{
  const profile=sampledVaseProfile();
  for(let y=.48;y<2.66;y+=.01){
    const crossings=[];
    for(let i=1;i<profile.length;i++){
      const [r0,y0]=profile[i-1],[r1,y1]=profile[i];
      if((y>=y0&&y<y1)||(y>=y1&&y<y0))crossings.push(r0+(r1-r0)*(y-y0)/(y1-y0));
    }
    crossings.sort((a,b)=>a-b);
    assert.equal(crossings.length,2,`One interior and exterior at height ${y}`);
    assert.ok(crossings[1]-crossings[0]>.045,`wall thickness at height ${y}`);
  }
});

test('Mesh projection bounds do not count empty world-AABB corners',()=>{
  const hero=new THREE.Group();
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.MeshBasicMaterial());hero.add(mesh);
  hero.rotation.y=.3;hero.updateMatrixWorld(true);
  const camera=new THREE.OrthographicCamera(-1.1,1.1,1.1,-1.1,.1,10);
  camera.position.set(3,3,3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const bounds=normalizedBounds(hero,camera);
  assert.equal(bounds.inside,true);
  assert.ok(bounds.left>.04&&bounds.right<.96);
  assert.ok(bounds.vertices>1000);
  mesh.geometry.dispose();mesh.material.dispose();
});

test('Small-angle pendulums preserve exact pivot distance and four-to-one length has two-to-one period',()=>{
  const one=analyticalPendulum(0,1),four=analyticalPendulum(0,4);
  assert.equal(four.period/one.period,2);
  for(let frame=0;frame<240;frame++)for(const length of [1,4]){
    const pose=analyticalPendulum(frame/30,length);
    assert.ok(Math.abs(Math.hypot(pose.bob[0],pose.bob[1]-4.65)-length)<1e-12);
    assert.ok(Math.abs(pose.angle)<=.1);
  }
  assert.throws(()=>analyticalPendulum(0,0));
});

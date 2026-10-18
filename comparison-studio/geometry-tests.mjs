import test from 'node:test';import assert from 'node:assert/strict';
import {roundedBoxGeometry} from './geometry.mjs';
test('bevelled solids preserve nominal contact and cube dimensions',()=>{
 for(const dims of [[.9,.9,.9,.09],[9,.35,6.4,.16],[1.15,.4,1.4,.1],[.36,.36,.025,.008],[.85,.15,.7,.1]]){
  const g=roundedBoxGeometry(...dims),a=g.boundingBox;
  for(const [i,k] of ['x','y','z'].entries()){
   assert.ok(Math.abs(a.max[k]-a.min[k]-dims[i])<1e-5);
   assert.ok(Math.abs(a.max[k]+a.min[k])<1e-5);
  }
  assert.ok([...g.attributes.normal.array].every(Number.isFinite));g.dispose();
 }
 assert.throws(()=>roundedBoxGeometry(1,NaN,1));
});

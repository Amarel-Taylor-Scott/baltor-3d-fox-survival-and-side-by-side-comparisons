import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from './vendor/three/three.module.js';
import {createLivingEffects} from './living-effects.mjs';
import {createCompanion,stepCompanion,COMPANION,companionPositionSafe} from './companion.mjs';
import {createPlayer} from './player.mjs';
import {createState} from './model.mjs';
import {WORLD} from './world-data.mjs';
import {createWorld} from './world.mjs';

test('woodland trail shares segment edges and closes without cracks',()=>{
  const scene=new THREE.Scene(),world=createWorld(THREE,scene);
  const geometry=scene.getObjectByName('woodland-walking-trail').geometry;
  assert.equal(geometry.attributes.position.count,842);
  assert.ok(geometry.index.count>0);
  const p=geometry.attributes.position;
  for(const side of [0,1])assert.ok(new THREE.Vector3().fromBufferAttribute(p,side).distanceTo(new THREE.Vector3().fromBufferAttribute(p,840+side))<1e-6);
  world.dispose();
});

test('den decoration fades for a blocked camera without fading shared world materials',()=>{
  const scene=new THREE.Scene(),world=createWorld(THREE,scene);
  const arch=scene.getObjectByName('den-stone-arch'),rocks=scene.getObjectByName('collidable-faceted-rocks');
  const hero={x:WORLD.den.x,y:0,z:WORLD.den.z};
  world.update(0,hero,new THREE.Vector3(hero.x,2,hero.z+7));
  assert.equal(arch.material.opacity,.13);assert.equal(rocks.material.opacity,1);assert.equal(arch.castShadow,false);
  world.update(0,hero,new THREE.Vector3(hero.x,2,hero.z-7));
  assert.equal(arch.material.opacity,1);assert.equal(arch.castShadow,true);
  world.dispose();
});

test('every literal app UI ID exists exactly once in the HTML', async()=>{
  const app=await readFile(new URL('./app.mjs',import.meta.url),'utf8');
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  for(const id of new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1])))
    assert.equal(ids.filter(value=>value===id).length,1,`Missing or duplicated ID: ${id}`);
});

test('footprint reset reproduces the first print on the same side',()=>{
  const scene=new THREE.Scene(),effects=createLivingEffects(THREE,scene);
  const base={x:0,y:0,z:22,yaw:Math.PI,time:0,grounded:true,speed:4,events:[]};
  const replay=()=>{
    effects.tick(base);effects.tick({...base,x:1,time:1});effects.update(1);
    const prints=scene.getObjectByName('living-wood-flourishes').children[0];
    const matrix=new THREE.Matrix4();prints.getMatrixAt(0,matrix);
    return [...matrix.elements];
  };
  const first=replay();effects.reset();assert.deepEqual(replay(),first);
  effects.dispose();assert.equal(scene.children.length,0);
});

test('call flourish follows bridge support height',()=>{
  const scene=new THREE.Scene(),effects=createLivingEffects(THREE,scene);
  effects.tick({x:WORLD.bridge.x,y:WORLD.bridge.deckY,z:WORLD.bridge.z,yaw:0,time:1,grounded:true,speed:0,events:[{type:'call'}]});
  effects.update(1.1);
  const ring=scene.getObjectByName('living-wood-flourishes').children[2];
  assert.equal(ring.visible,true);assert.ok(ring.position.y>WORLD.bridge.deckY,'Call ring is below the bridge surface');
  effects.dispose();
});

test('shared character renderer supports grounded companion shadow on the bridge',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),head=new THREE.Bone(),hips=new THREE.Bone();
  head.name='Head';head.position.z=1;hips.name='Hips';root.add(head,hips);
  const library={createInstance(){return {root,mixer:new THREE.AnimationMixer(root),clips:[new THREE.AnimationClip('Idle',1,[])],stats:{},dispose(){}};}};
  const rendered=createPlayer(THREE,library,scene,{scale:.45});
  const friend=createCompanion(),player=createState();stepCompanion(friend,player);
  friend.x=WORLD.bridge.x;friend.z=WORLD.bridge.z;friend.y=WORLD.bridge.deckY;friend.animation='idle';
  rendered.update(friend,0);
  const shadow=scene.children.find(child=>child.geometry?.type==='CircleGeometry');
  assert.ok(shadow.position.y>WORLD.bridge.deckY,'Companion shadow is below the bridge support');
  rendered.dispose();
});

test('companion settled at formation arrival distance is beside player, not falsely blocked',()=>{
  const friend=createCompanion(),hero=createState();
  hero.yaw=0;
  const arrival=COMPANION.arrivalRadius+5e-10;
  let found=false;
  for(let z=-30;z<=30&&!found;z+=2)for(let x=-30;x<=30&&!found;x+=2){
    const target={x:x+COMPANION.sideOffset,z:z-COMPANION.backOffset};
    if(companionPositionSafe(x,z)&&companionPositionSafe(target.x,target.z)&&companionPositionSafe(target.x+arrival,target.z)){
      hero.x=x;hero.z=z;friend.x=target.x+arrival;friend.z=target.z;found=true;
    }
  }
  assert.ok(found,'Could not locate clear test positions');
  stepCompanion(friend,hero);
  assert.equal(friend.speed,0);
  assert.equal(friend.mode,'beside-player');
});

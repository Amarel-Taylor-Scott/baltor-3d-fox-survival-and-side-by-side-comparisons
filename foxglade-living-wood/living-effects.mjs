import {WORLD,isPond,isBridge} from './world-data.mjs';

/** Small deterministic flourishes. Decorative, not physics or inferred animal motion. */
export function createLivingEffects(THREE,scene){
  const root=new THREE.Group();root.name='living-wood-flourishes';scene.add(root);
  const matrix=new THREE.Object3D(),footprints=[],maxPrints=72;
  const footGeometry=new THREE.CircleGeometry(.065,7);
  const footMaterial=new THREE.MeshBasicMaterial({color:'#b8cf9e',transparent:true,opacity:.23,depthWrite:false});
  const feet=new THREE.InstancedMesh(footGeometry,footMaterial,maxPrints);feet.frustumCulled=false;feet.count=0;root.add(feet);
  const mothGeometry=new THREE.PlaneGeometry(.18,.25),mothMaterial=new THREE.MeshBasicMaterial({color:'#ffe5a3',side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false});
  const moths=new THREE.InstancedMesh(mothGeometry,mothMaterial,36);moths.frustumCulled=false;root.add(moths);
  const ringGeometry=new THREE.RingGeometry(.95,1,64),ringMaterial=new THREE.MeshBasicMaterial({color:'#e6d69a',side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
  const callRing=new THREE.Mesh(ringGeometry,ringMaterial);callRing.rotation.x=-Math.PI/2;root.add(callRing);
  let lastX=null,lastZ=null,side=-1,callAt=-100,callX=0,callY=0,callZ=0;
  function reset(){footprints.length=0;feet.count=0;lastX=lastZ=null;side=-1;callAt=-100;ringMaterial.opacity=0;}
  function tick(state){
    if(state.events.some(e=>e.type==='call')){callAt=state.time;callX=state.x;callY=state.y;callZ=state.z;}
    if(state.events.some(e=>e.type==='fall'))lastX=lastZ=null;
    if(lastX===null){lastX=state.x;lastZ=state.z;}
    const distance=Math.hypot(state.x-lastX,state.z-lastZ);
    if(distance>.55&&state.grounded&&state.speed>.2){
      lastX=state.x;lastZ=state.z;side*=-1;
      if(!isPond(state.x,state.z)||isBridge(state.x,state.z)){
        footprints.push({x:state.x+Math.cos(state.yaw)*.15*side,z:state.z-Math.sin(state.yaw)*.15*side,y:state.y+.024,yaw:state.yaw,time:state.time});
        if(footprints.length>maxPrints)footprints.shift();
      }
    }
    while(footprints.length&&state.time-footprints[0].time>9)footprints.shift();
  }
  function update(time){
    feet.count=footprints.length;
    footprints.forEach((p,i)=>{const fade=Math.max(0,1-(time-p.time)/9);matrix.position.set(p.x,p.y,p.z);matrix.rotation.set(-Math.PI/2,0,-p.yaw);matrix.scale.set(fade,fade*1.4,fade);matrix.updateMatrix();feet.setMatrixAt(i,matrix.matrix);});
    feet.instanceMatrix.needsUpdate=true;
    for(let i=0;i<36;i++){
      const anchor=WORLD.shrines[Math.floor(i/12)],pair=Math.floor(i/2),wing=i%2?1:-1;
      const a=time*.36+pair*2.399,r=1.25+Math.sin(pair*5)*.65;
      matrix.position.set(anchor.x+Math.cos(a)*r,1.1+Math.sin(time*1.3+pair)*.35,anchor.z+Math.sin(a*.82)*r);
      matrix.rotation.set(Math.PI/2,a,wing*(.2+Math.sin(time*17+pair)*.9));matrix.scale.set(1,1,1);matrix.updateMatrix();moths.setMatrixAt(i,matrix.matrix);
    }
    moths.instanceMatrix.needsUpdate=true;
    const age=time-callAt;callRing.visible=age>=0&&age<1.2;
    if(callRing.visible){callRing.position.set(callX,callY+.04,callZ);callRing.scale.setScalar(.4+age*3.5);ringMaterial.opacity=.65*(1-age/1.2);}
  }
  return {tick,update,reset,stats:{moths:18,footprintLimit:maxPrints,effects:'authored deterministic decoration'},dispose(){scene.remove(root);for(const g of [footGeometry,mothGeometry,ringGeometry])g.dispose();for(const m of [footMaterial,mothMaterial,ringMaterial])m.dispose();}};
}

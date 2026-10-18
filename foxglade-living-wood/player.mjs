import {cadenceScale} from './motion-profile.mjs';
/** Supplied poses with bounded opt-in measured cadence. No learned 3D joints. */
export function createPlayer(THREE, library, scene, options={}) {
  const rig = library.createInstance('fox');
  const scale=options.scale??.63;
  rig.root.scale.setScalar(scale);
  scene.add(rig.root);
  rig.mixer.stopAllAction();
  const actions = new Map(rig.clips.map(clip => [clip.name, rig.mixer.clipAction(clip)]));
  let current = null, smoothYaw = Math.PI, motionProfile=null, useMeasuredCadence=false;
  const clipNames = {idle:'Idle', walk:'Walk', run:'Run', jump:'Jump', fall:'Fall', celebrate:'Sit',sit:'Sit',sneak:'Sneak',bark:'Bark',pounce:'Jump'};
  const oneShot=new Set(['Jump','Fall','Sit','Bark']);
  // Establish the source's authored facing direction from bone positions.
  rig.root.updateMatrixWorld(true);
  const head = rig.root.getObjectByName('Head'), hips = rig.root.getObjectByName('Hips');
  const forward = head.getWorldPosition(new THREE.Vector3()).sub(hips.getWorldPosition(new THREE.Vector3()));
  const sourceYaw = Math.atan2(forward.x, forward.z);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.7,32), new THREE.MeshBasicMaterial({color:0x102824,transparent:true,opacity:.19,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2; shadow.scale.set(scale/.63,1.8*scale/.63,1); scene.add(shadow);
  const stats={...rig.stats,scale,sourceYaw,collision:'bounded kinematic circle; tail excluded',animation:'supplied blended clips; no learned joint poses or terrain IK',cadenceMode:'authored',activeClip:'Idle',effectiveTimeScale:1};
  function reset(state) {
    rig.mixer.stopAllAction(); rig.mixer.setTime(0); current=null; smoothYaw=state.yaw;
    update(state,0);
  }
  function update(state,dt) {
    const name=clipNames[state.animation] || 'Idle';
    if(name!==current){
      const next=actions.get(name), previous=actions.get(current);
      if(!next)throw Error(`Required fox clip missing: ${name}`);
      next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(oneShot.has(name)?THREE.LoopOnce:THREE.LoopRepeat,oneShot.has(name)?1:Infinity);
      next.clampWhenFinished=oneShot.has(name);next.play();
      if(previous)next.crossFadeFrom(previous,.18,false);
      current=name;
    }
    const moving=['Run','Walk','Sneak'].includes(name);
    let timing=name==='Run'?1.12*Math.max(.3,state.speed/7):name==='Walk'?1.1*Math.max(.3,state.speed/4):name==='Sneak'?.85:1;
    if(moving)timing*=cadenceScale(motionProfile,useMeasuredCadence);
    timing=Math.max(.25,Math.min(1.8,timing));
    actions.get(name).setEffectiveTimeScale(timing);
    rig.mixer.update(dt);
    const difference=Math.atan2(Math.sin(state.yaw-smoothYaw),Math.cos(state.yaw-smoothYaw));
    smoothYaw+=difference*(1-Math.exp(-15*dt));
    rig.root.rotation.y=smoothYaw-sourceYaw;
    rig.root.position.set(state.x,state.y+.015,state.z);
    shadow.position.set(state.x, Math.max(.025,state.grounded!==false?state.y+.025:.025), state.z);
    shadow.material.opacity=state.y<-.1?0:.18/(1+Math.max(0,state.y));
    shadow.rotation.z=-smoothYaw;
    rig.root.updateMatrixWorld(true);stats.activeClip=name;stats.effectiveTimeScale=timing;
    stats.cadenceMode=useMeasuredCadence&&cadenceScale(motionProfile,true)!==1?'experimental-2d-timing':'authored';
  }
  return {rig,update,reset,stats,
    setCadence(profile,enabled=false){motionProfile=profile;useMeasuredCadence=enabled===true;},
    setVisible(value){rig.root.visible=value;shadow.visible=value;},
    dispose(){rig.dispose();scene.remove(rig.root,shadow);shadow.geometry.dispose();shadow.material.dispose();}};
}

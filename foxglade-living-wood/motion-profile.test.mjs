import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMotionProfile,cadenceScale} from './motion-profile.mjs';
const accepted=()=>({schemaVersion:1,status:'experimental-measured',enabledByDefault:false,cyclesPerSecond:1.8,speedScale:1.2,quality:{visualReview:'approved',independentClipValidated:true},application:{mode:'clip-cadence-only',requiresExplicitToggle:true}});
test('cadence is opt-in even for an eligible profile',()=>{assert.equal(cadenceScale(accepted(),false),1);assert.equal(cadenceScale(accepted(),true),1.2);});
test('missing, blocked and unsafe profiles fail closed',()=>{for(const p of [null,{}, {...accepted(),status:'blocked'}, {...accepted(),enabledByDefault:true}, {...accepted(),speedScale:Infinity}, {...accepted(),speedScale:2}, {...accepted(),cyclesPerSecond:0}, {...accepted(),application:{mode:'3d-mocap'}}]){assert.equal(inspectMotionProfile(p).eligible,false);assert.equal(cadenceScale(p,true),1);}});
test('validation does not mutate source evidence',()=>{const p=accepted(),before=JSON.stringify(p);inspectMotionProfile(p);assert.equal(JSON.stringify(p),before);});
test('same-clip fitting alone cannot enable measured cadence',()=>{for(const quality of [{visualReview:'pending',independentClipValidated:true},{visualReview:'approved',independentClipValidated:false},{}])assert.equal(inspectMotionProfile({...accepted(),quality}).eligible,false);});

/** A measured 2D cadence may change clip timing, never the mesh's 3D poses. */
export function inspectMotionProfile(profile) {
  const reasons=[];
  if(profile?.schemaVersion!==1)reasons.push('schema');
  if(profile?.status!=='experimental-measured')reasons.push('measurement-not-accepted');
  if(profile?.enabledByDefault!==false)reasons.push('unsafe-default');
  if(profile?.quality?.visualReview!=='approved')reasons.push('visual-review-required');
  if(profile?.quality?.independentClipValidated!==true)reasons.push('independent-validation-required');
  if(profile?.application?.mode!=='clip-cadence-only'||profile?.application?.requiresExplicitToggle!==true)reasons.push('application-scope');
  const scale=profile?.speedScale,rate=profile?.cyclesPerSecond;
  if(typeof scale!=='number'||!Number.isFinite(scale)||scale<.75||scale>1.35)reasons.push('scale-out-of-bounds');
  if(typeof rate!=='number'||!Number.isFinite(rate)||rate<=0||rate>8)reasons.push('invalid-cadence');
  return {eligible:reasons.length===0,reasons,scale:reasons.length?1:scale,cyclesPerSecond:rate??null};
}
export function cadenceScale(profile,enabled){return enabled===true?inspectMotionProfile(profile).scale:1;}

import * as THREE from '../foxglade-living-wood/vendor/three/three.module.js';

// The public dimensions include the bevel. Contact equations use these bounds.
export function roundedBoxGeometry(w,h,d,r=.1){
  if(![w,h,d,r].every(Number.isFinite)||Math.min(w,h,d,r)<=0)throw Error('Positive finite box dimensions required');
  r=Math.min(r,w/3,h/3,d/3);
  const iw=w-2*r,ih=h-2*r,x=-iw/2,y=-ih/2,q=Math.min(r,iw/2,ih/2);
  const s=new THREE.Shape();
  s.moveTo(x+q,y);s.lineTo(x+iw-q,y);s.quadraticCurveTo(x+iw,y,x+iw,y+q);
  s.lineTo(x+iw,y+ih-q);s.quadraticCurveTo(x+iw,y+ih,x+iw-q,y+ih);
  s.lineTo(x+q,y+ih);s.quadraticCurveTo(x,y+ih,x,y+ih-q);
  s.lineTo(x,y+q);s.quadraticCurveTo(x,y,x+q,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r,bevelThickness:r,curveSegments:8});
  g.translate(0,0,-d/2+r);g.computeBoundingBox();
  // Extrusion corner miters can overshoot by a fraction of a millimetre.
  // Normalize the measured envelope so supported parts share exact dimensions.
  const size=new THREE.Vector3();g.boundingBox.getSize(size);
  g.scale(w/size.x,h/size.y,d/size.z);g.center();g.computeBoundingBox();return g;
}

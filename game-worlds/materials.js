// Original deterministic surface maps. World-space coordinates keep texture scale
// consistent on stretched boxes, road ribbons, and instanced scenery.
export function createMaterialKit(T){
 const resources=[],materials=[];
 const texture=(kind,size=256)=>{
  const data=new Uint8Array(size*size*4);let seed=91;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const palettes={asphalt:[66,69,70],concrete:[156,151,139],stone:[179,128,92],sand:[202,175,128],grass:[102,117,70],wood:[128,92,59],metal:[184,187,183],rubber:[54,55,53]};
  const rgb=palettes[kind];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   let v=(random()-.5)*(kind==='asphalt'?.48:.26),large=Math.sin(x*.037+Math.sin(y*.05)*2)*Math.sin(y*.043)*.055;
   if(kind==='stone')v+=Math.sin(y*.13+Math.sin(x*.04)*1.6)*.15+Math.sin(y*.62)*.035;
   if(kind==='wood')v+=Math.sin(x*.37+Math.sin(y*.045)*2)*.12+Math.sin(x*.16+Math.sin(y*.02)*4)*.07;
   if(kind==='grass')v+=Math.sin(x*.8+y*.7)*.055;
   if(kind==='concrete'&&random()>.991)v-=.27;
   if(kind==='metal')v=(random()-.5)*.055+Math.sin(y*2.9)*.015;
   const j=(y*size+x)*4;for(let c=0;c<3;c++)data[j+c]=Math.max(0,Math.min(255,rgb[c]*(1+v+large)));data[j+3]=255;
  }
  const tex=new T.DataTexture(data,size,size,T.RGBAFormat);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=8;tex.needsUpdate=true;resources.push(tex);return tex;
 };
 function triplanar(kind,scale,roughness,metalness=0){
  const m=new T.MeshStandardMaterial({color:0xffffff,map:texture(kind),roughness,metalness});
  m.onBeforeCompile=s=>{
   s.uniforms.worldTextureScale={value:scale};
   s.vertexShader='varying vec3 vSurfaceWorld; varying vec3 vSurfaceNormal;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    vec4 surfacePosition=vec4(transformed,1.0);
    vec3 surfaceNormal=objectNormal;
    #ifdef USE_INSTANCING
     surfacePosition=instanceMatrix*surfacePosition;
     surfaceNormal=mat3(instanceMatrix)*surfaceNormal;
    #endif
    vSurfaceWorld=(modelMatrix*surfacePosition).xyz;
    vSurfaceNormal=normalize(mat3(modelMatrix)*surfaceNormal);`);
   s.fragmentShader='varying vec3 vSurfaceWorld; varying vec3 vSurfaceNormal; uniform float worldTextureScale;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
    vec3 triWeight=pow(abs(normalize(vSurfaceNormal)),vec3(6.0));triWeight/=max(dot(triWeight,vec3(1.0)),0.0001);
    vec4 surfaceMap=texture2D(map,vSurfaceWorld.yz*worldTextureScale)*triWeight.x+texture2D(map,vSurfaceWorld.xz*worldTextureScale)*triWeight.y+texture2D(map,vSurfaceWorld.xy*worldTextureScale)*triWeight.z;
    diffuseColor*=surfaceMap;
   #endif`);
  };
  m.customProgramCacheKey=()=>`world-surface-${kind}-${scale}`;materials.push(m);return m;
 }
 const kit={asphalt:triplanar('asphalt',.34,.94),concrete:triplanar('concrete',.21,.91),stone:triplanar('stone',.075,.94),sand:triplanar('sand',.11,.98),grass:triplanar('grass',.20,.95),wood:triplanar('wood',.32,.81),metal:triplanar('metal',.18,.34,.82),rubber:triplanar('rubber',.8,.95)};
 kit.paint=color=>{const m=new T.MeshPhysicalMaterial({color,roughness:.28,metalness:.30,clearcoat:.75,clearcoatRoughness:.2});materials.push(m);return m;};
 kit.glass=new T.MeshPhysicalMaterial({color:'#354f60',roughness:.12,metalness:.3,clearcoat:1,transparent:true,opacity:.88});materials.push(kit.glass);
 kit.dispose=()=>{materials.forEach(m=>m.dispose());resources.forEach(t=>t.dispose());};return kit;
}

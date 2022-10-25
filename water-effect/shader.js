import * as THREE from 'three';

const divingRippleVertex = `\             
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  varying vec2 vUv;
  
  void main() {
    vUv = uv;

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`;
const divingRippleFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform float uTime;
  uniform float vBroken;
  uniform sampler2D rippleTexture;
  uniform sampler2D noiseMap;
  uniform sampler2D voronoiNoiseTexture;

  varying vec2 vUv;
  
  void main() {
    vec2 mainUv = vec2(
      vUv.x , 
      vUv.y - uTime / 1.
    ); 
    vec4 voronoiNoise = texture2D(
      voronoiNoiseTexture,
      mainUv
    );
    vec2 distortionUv = mix(vUv, mainUv + voronoiNoise.rg, 0.3);
    vec4 ripple = texture2D(
      rippleTexture,
      (distortionUv + mainUv) / 2.
    );
    vec4 noise = texture2D(
      noiseMap,
      (distortionUv + mainUv) / 2.
    );
    if (ripple.a > 0.5) {
      gl_FragColor = ripple;
    }
    else {
      gl_FragColor.a = 0.;
      discard;
    }
    gl_FragColor.a *= 1.5;
    float broken = abs(sin(1.0 - vBroken)) - noise.g;
    float noiseThreshold = 0.0001;
    if (broken < noiseThreshold) discard;
    gl_FragColor.rgb *= 0.8;
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`;
const divingLowerSplashVertex = `\      
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  uniform vec4 cameraBillboardQuaternion;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  varying float vTextureRotation;

  attribute float textureRotation;
  attribute float broken;
  attribute vec3 positions;
  attribute float scales;
  
  vec3 rotateVecQuat(vec3 position, vec4 q) {
    vec3 v = position.xyz;
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void main() {
    vUv = uv;
    vBroken = broken;
    vTextureRotation = textureRotation;  
    
    vec3 pos = position;
    pos = rotateVecQuat(pos, cameraBillboardQuaternion);
    pos *= scales;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    vPos = modelPosition.xyz;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const divingLowerSplashFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform sampler2D splashTexture;
  uniform sampler2D noiseMap;
  uniform float waterSurfacePos;
  uniform float noiseScale;

  varying vec2 vUv;
  varying vec3 vPos;
  
  varying float vTextureRotation;
  varying float vBroken;
  #define PI 3.1415926
  void main() {
    float mid = 0.5;
    vec2 rotated = vec2(
      cos(vTextureRotation * PI) * (vUv.x - mid) * 1.1 - sin(vTextureRotation * PI) * (vUv.y - mid) * 1.1 + mid,
      cos(vTextureRotation * PI) * (vUv.y - mid) * 1.1 + sin(vTextureRotation * PI) * (vUv.x - mid) * 1.1 + mid
    );
    vec4 splash = texture2D(
      splashTexture,
      rotated
    );
    if (splash.r > 0.1) {
      gl_FragColor = vec4(0.9, 0.9, 0.9, 1.0);
    }
    if (vPos.y < waterSurfacePos) {
      gl_FragColor.a = 0.;
    }

    float broken = abs(sin(1.0 - vBroken)) - texture2D( noiseMap, rotated * noiseScale ).g;
    float noiseThreshold = 0.0001;
    if (broken < noiseThreshold) discard;
    if (gl_FragColor.a > 0.) {
      gl_FragColor = vec4(0.9, 0.9, 0.9, 1.0);
    }
    else {
      discard;
    }
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
const divingHigherSplashVertex = `\         
  ${THREE.ShaderChunk.common}
  ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
  uniform vec4 cameraBillboardQuaternion;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  
  attribute float broken;
  attribute vec3 positions;
  attribute float scales;
  attribute float rotation;
  
  void main() {
    mat3 rotY = mat3(
      cos(rotation), 0.0, -sin(rotation), 
      0.0, 1.0, 0.0, 
      sin(rotation), 0.0, cos(rotation)
    );
    vUv = uv;
    vBroken = broken;
    vec3 pos = position;
    pos *= scales;
    pos *= rotY;
    pos += positions;
    vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    vPos = modelPosition.xyz;
    gl_Position = projectionPosition;
    ${THREE.ShaderChunk.logdepthbuf_vertex}
  }
`
const divingHigherSplashFragment = `\
  ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
  uniform sampler2D splashTexture;
  uniform sampler2D noiseMap;
  uniform float waterSurfacePos;

  varying vec2 vUv;
  varying vec3 vPos;
  varying float vBroken;
  
  void main() { 
    vec4 splash = texture2D(
      splashTexture,
      vUv
    );
    gl_FragColor = splash;
    if (splash.r < 0.5) {
      discard;
    }
    if (vPos.y < waterSurfacePos) {
      gl_FragColor.a = 0.;
    }

    float broken = abs(sin(1.0 - vBroken)) - texture2D(noiseMap, vUv).g;
    float noiseThreshold = 0.0001;
    if (broken < noiseThreshold) discard;
    if (gl_FragColor.a > 0.) {
      gl_FragColor = vec4(0.6, 0.6, 0.6, 1.0);
    }
    else {
      discard;
    }
    ${THREE.ShaderChunk.logdepthbuf_fragment}
  }
`
export {
  divingRippleVertex, divingRippleFragment,
  divingLowerSplashVertex, divingLowerSplashFragment,
  divingHigherSplashVertex, divingHigherSplashFragment,
};
import * as THREE from 'three';

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');

const textureLoader = new THREE.TextureLoader();

const _loadTexture = async (path) => {
  const texture = await textureLoader.loadAsync(baseUrl + path);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return texture;
};

const loadWaterMaterial = async () => {
  const normalSampler = await _loadTexture('assets/textures/water/water_n.jpg');
  normalSampler.wrapS = normalSampler.wrapT = THREE.RepeatWrapping;

  const waterShader = {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib['fog'],
      THREE.UniformsLib['lights'],
      {
        normalSampler: {value: normalSampler},
        mirrorSampler: {value: null},
        alpha: {value: 0.8},
        time: {value: 0.0},
        size: {value: 8.0}, //0.1 - 10
        distortionScale: {value: 4.7}, //0 - 8
        textureMatrix: {value: new THREE.Matrix4()},
        sunColor: {value: new THREE.Color(0xffffff)},
        sunDirection: {value: new THREE.Vector3(0.70707, 0.70707, 0)},
        eye: {value: new THREE.Vector3()},
        waterColor: {value: new THREE.Color(0x26455f)},
      },
    ]),

    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      uniform float time;
  
      varying vec4 mirrorCoord;
      varying vec4 worldPosition;
  
      #include <common>
      #include <fog_pars_vertex>
      #include <shadowmap_pars_vertex>
      #include <logdepthbuf_pars_vertex>
  
      void main() {
        mirrorCoord = modelMatrix * vec4( position, 1.0 );
        worldPosition = mirrorCoord.xyzw;
        mirrorCoord = textureMatrix * mirrorCoord;
        vec4 mvPosition =  modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
  
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
      #include <shadowmap_vertex>
    }`,

    fragmentShader: /* glsl */ `
      uniform sampler2D mirrorSampler;
      uniform float alpha;
      uniform float time;
      uniform float size;
      uniform float distortionScale;
      uniform sampler2D normalSampler;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform vec3 eye;
      uniform vec3 waterColor;
  
      varying vec4 mirrorCoord;
      varying vec4 worldPosition;
  
      vec4 getNoise( vec2 uv ) {
        vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
        vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
        vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
        vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
        vec4 noise = texture2D( normalSampler, uv0 ) +
          texture2D( normalSampler, uv1 ) +
          texture2D( normalSampler, uv2 ) +
          texture2D( normalSampler, uv3 );
        return noise * 0.5 - 1.0;
      }
  
      void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
        vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
        float direction = max( 0.0, dot( eyeDirection, reflection ) );
        specularColor += pow( direction, shiny ) * sunColor * spec;
        diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
      }
  
      #include <common>
      #include <packing>
      #include <bsdfs>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
  
      void main() {
  
        #include <logdepthbuf_fragment>
        vec4 noise = getNoise( worldPosition.xz * size );
        vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );
  
        vec3 diffuseLight = vec3(0.0);
        vec3 specularLight = vec3(0.0);
  
        vec3 worldToEye = eye-worldPosition.xyz;
        vec3 eyeDirection = normalize( worldToEye );
        sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );
  
        float distance = length(worldToEye);
  
        vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
        vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );
  
        float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
        float rf0 = 0.3;
        float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
        vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
        vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);
        gl_FragColor = vec4( albedo, alpha );
  
        #include <tonemapping_fragment>
        #include <fog_fragment>
      }`,
  };

  const material = new THREE.ShaderMaterial({
    fragmentShader: waterShader.fragmentShader,
    vertexShader: waterShader.vertexShader,
    uniforms: THREE.UniformsUtils.clone(waterShader.uniforms),
    lights: false,
    side: THREE.DoubleSide,
    fog: false,
    transparent: true
  });

  return material;
};

export default loadWaterMaterial;

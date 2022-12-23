import metaversefile from "metaversefile";
import * as THREE from "three";

import {MATERIALS_INFO} from "../assets.js";
import {_disableOutgoingLights} from "../utils/utils.js";
import {NUM_TERRAIN_MATERIALS} from "./terrain-mesh.js";

const {useAtlasing} = metaversefile;
const {calculateCanvasAtlasTexturePerRow} = useAtlasing();

const _createTerrainMaterial = () => {
  const materialUniforms = {
    // texture atlases
    uDiffMap: {},
    uNormalMap: {},
    uRoughnessMap: {},
    uMetalnessMap: {},
    uAoMap: {},

    uTextureScales: {value: MATERIALS_INFO.map(m => m.scale)},

    // noise texture
    uNoiseTexture: {},
  };

  const texturePerRow = calculateCanvasAtlasTexturePerRow(
    NUM_TERRAIN_MATERIALS,
  );

  const material = new THREE.MeshStandardMaterial({
    // roughness: 0.95,
    // metalness: 0.1,
    // envMap: new THREE.Texture(),
    // envMapIntensity: 1,
    onBeforeCompile: shader => {
      for (const k in materialUniforms) {
        shader.uniforms[k] = materialUniforms[k];
      }

      // ? by installing glsl-literal extension in vscode you can get syntax highlighting for glsl
      // vertex shader
      const uvParseVertex = /* glsl */ `
        #include <uv_pars_vertex>

        attribute ivec4 materials;
        attribute vec4 materialsWeights;

        flat varying ivec4 vMaterials;
        varying vec4 vMaterialsWeights;

        varying mat3 vNormalMatrix;
        varying vec3 vPosition;
        varying vec3 vCameraDepth;
        varying vec3 vObjectNormal;
      `;

      const worldPosVertex = /* glsl */ `
       #include <worldpos_vertex>

       vMaterials = materials;
       vMaterialsWeights = materialsWeights;

       vPosition = transformed;
       vNormalMatrix = normalMatrix;
       vObjectNormal = normal;
       vCameraDepth = -(modelViewMatrix * vec4(transformed, 1.)).xyz;
      `;

      // fragment shader
      const mapParseFragment = /* glsl */ `
        #include <map_pars_fragment>

        precision highp sampler2D;
        precision highp float;
        precision highp int;

        flat varying ivec4 vMaterials;
        varying vec4 vMaterialsWeights;

        varying vec3 vPosition;
        varying vec3 vCameraDepth;
        varying mat3 vNormalMatrix;
        varying vec3 vObjectNormal;
  
        uniform sampler2D uDiffMap;
        uniform sampler2D uRoughnessMap;
        uniform sampler2D uMetalnessMap;
        uniform sampler2D uNormalMap;
        uniform sampler2D uAoMap;

        uniform sampler2D uNoiseTexture;

        uniform float uTextureScales[${NUM_TERRAIN_MATERIALS}];
  
        const float TEXTURE_SCALE = 40.0;
        const float TEXTURE_PER_ROW = float(${texturePerRow});
        const float TEXTURE_SIZE = 1.0 / TEXTURE_PER_ROW;

        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

        float snoise(vec2 v){
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                  -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
          + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
            dot(x12.zw,x12.zw)), 0.0);
          m = m*m ;
          m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        vec4 blendSamples(vec4 samples[4], vec4 weights) {
          float weightSum = weights.x + weights.y + weights.z + weights.w;
          return (samples[0] * weights.x + samples[1] * weights.y + samples[2] * weights.z + samples[3] * weights.w) / weightSum;
        }

        float sum( vec3 v ) { return v.x+v.y+v.z; }

        vec4 hash4(vec2 p) {
          return fract(sin(vec4(1.0 + dot(p, vec2(37.0, 17.0)), 2.0 + dot(p, vec2(11.0, 47.0)), 3.0 + dot(p, vec2(41.0, 29.0)), 4.0 + dot(p, vec2(23.0, 31.0)))) * 103.0);
        }

        #define saturate(a) clamp( a, 0.0, 1.0 )
              
        vec3 ACESFilmicToneMapping(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return saturate((x*(a*x+b))/(x*(c*x+d)+e));
        }

        vec2 getSubTextureOffset(int textureIndex){
          float ax = mod(float(textureIndex), TEXTURE_PER_ROW);
          float ay = floor(float(textureIndex) / TEXTURE_PER_ROW);

          return vec2(ax, ay) * TEXTURE_SIZE;
        }

        // sub texture in atlas
        vec4 subTexture2D(sampler2D textureSample, vec2 tileUv, vec2 textureOffset, vec2 duvdx, vec2 duvdy) {
          vec2 subUv = fract(tileUv) * TEXTURE_SIZE + textureOffset;
          return textureGrad(textureSample, subUv, duvdx, duvdy);
        }

        // * based on this article : https://iquilezles.org/articles/texturerepetition
        vec4 textureNoTile(sampler2D textureSample, int textureIndex, vec2 inputUv ) {
          float UV_SCALE = uTextureScales[textureIndex];
          vec2 uv = inputUv * (1.f / UV_SCALE);
          // sample variation pattern
          float k = vec3(texture2D(uNoiseTexture, 0.0025*uv)).x; // cheap (cache friendly) lookup

          // compute index
          float l = k*8.0;
          float f = fract(l);

          // suslik's method
          float ia = floor(l+0.5);
          float ib = floor(l);
          f = min(f, 1.0-f)*2.0;

          // offsets for the different virtual patterns
          vec2 offa = vec2(hash4(vec2(30.0,7.0)*ia)); // can replace with any other hash
          vec2 offb = vec2(hash4(vec2(30.0,7.0)*ib)); // can replace with any other hash

          vec2 textureOffset = getSubTextureOffset(textureIndex);

          // compute derivatives for mip-mapping
          vec2 duvdx = dFdx(uv);
          vec2 duvdy = dFdy(uv);

          // sample the two closest virtual patterns
          vec4 cola = subTexture2D(textureSample, uv + offa, textureOffset, duvdx, duvdy);
          vec4 colb = subTexture2D(textureSample, uv + offb, textureOffset, duvdx, duvdy);

          vec3 multiplier = vec3(1.f);
          if(textureIndex == 0 || textureIndex == 1){
            float simplexNoise = snoise(vPosition.xz / 15.f);
            multiplier = vec3(0.98f + simplexNoise / 5.5f, 1.0f + simplexNoise / 4.f, 1.f);
          }

          // interpolate between the two virtual patterns
          return mix(cola, colb, smoothstep(0.2,0.8,f-0.1*sum(cola.xyz-colb.xyz))) * vec4(multiplier, 1.f);
        }

        vec4 blendMaterials(sampler2D inputTextures, vec2 uv) {
          vec4 samples[4];

          samples[0] = textureNoTile(inputTextures, vMaterials.x, uv);
          samples[1] = textureNoTile(inputTextures, vMaterials.y, uv);
          samples[2] = textureNoTile(inputTextures, vMaterials.z, uv);
          samples[3] = textureNoTile(inputTextures, vMaterials.w, uv);

          return blendSamples(samples, vMaterialsWeights);
        }

        vec4 mapTextures(vec3 inputPosition, vec3 inputNormal, sampler2D inputTextures){
          float textureScale = TEXTURE_SCALE;
          vec2 textureUv = inputPosition.xz * (1.f / textureScale);
          vec4 textureColor = blendMaterials(inputTextures, textureUv);
          return textureColor;
        }
      `;

      const mapFragment = /* glsl */ `
        #include <map_fragment>

        vec4 diffMapColor = mapTextures(vPosition, vObjectNormal, uDiffMap);
        diffMapColor.rgb = ACESFilmicToneMapping(diffMapColor.rgb);
        diffuseColor *= diffMapColor;

      `;

      const normalFragmentMaps = /* glsl */ `
        #include <normal_fragment_maps>

        vec3 normalMapColor = mapTextures(vPosition, vObjectNormal, uNormalMap).xyz;
        normal = normalize(vNormalMatrix * normalMapColor); 
      `;

      // * The maps below are disabled for now
      const roughnessMapFragment = /* glsl */ `
        #include <roughnessmap_fragment>

        // vec4 texelRoughness = mapTextures(vPosition, vObjectNormal, uRoughnessMap);
        // roughnessFactor *= texelRoughness.g;
      `;
      const metalnessMapFragment = /* glsl */ `
        #include <metalnessmap_fragment>

        // vec4 texelMetalness = mapTextures(vPosition, vObjectNormal, uMetalnessMap);
        // metalnessFactor *= texelMetalness.g;
      `;

      const aoMapFragment = /* glsl */ `
        #include <aomap_fragment>

        // vec4 triplanarAoColor = mapTextures(vPosition, vObjectNormal, uAoMap);

        // float ambientOcclusion = triplanarAoColor.r;
        // reflectedLight.indirectDiffuse *= ambientOcclusion;

        // #if defined( USE_ENVMAP ) && defined( STANDARD )
        //   float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
        //   reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        // #endif
      `;

      // extend shaders
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_pars_vertex>",
        uvParseVertex,
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        worldPosVertex,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_pars_fragment>",
        mapParseFragment,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        roughnessMapFragment,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        metalnessMapFragment,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        mapFragment,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        normalFragmentMaps,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        aoMapFragment,
      );

      return shader;
    },
  });

  material.uniforms = materialUniforms;

  _disableOutgoingLights(material);

  return material;
};

export default _createTerrainMaterial;
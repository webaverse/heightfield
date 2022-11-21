import * as THREE from 'three';

const _createWaterMaterial = () => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
        uTime: {
          value: 0
        },
        tDepth: {
          value: null
        },
        cameraNear: {
          value: 0
        },
        cameraFar: {
          value: 0
        },
        resolution: {
          value: new THREE.Vector2()
        },
        foamTexture: {
          value: null
        },
        mirror: {
          value: null
        },
        refractionTexture: {
          value: null
        },
        textureMatrix: {
          value: null
        },
        eye: {
          value: new THREE.Vector3()
        },
        playerPos: {
          value: new THREE.Vector3()
        },
        cameraInWater: {
          value: null
        },
        tDistortion: {
          value: null
        }

    },
    vertexShader: `\
        
      ${THREE.ShaderChunk.common}
      ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
      uniform float uTime;
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vPos;
      varying vec3 vNormal;

      vec3 gerstnerWave(float dirX, float dirZ, float steepness, float waveLength, inout vec3 tangent, inout vec3 binormal, vec3 pos) {
        vec2 dirXZ = vec2(dirX, dirZ);
        float k = 2. * PI / waveLength;
        float c = sqrt(9.8 / k);
        vec2 d = normalize(dirXZ);
        float f = k * (dot(d, pos.xz) - c * uTime);
        float a = (steepness / k);
        
        tangent += vec3(
          - d.x * d.x * (steepness * sin(f)),
          d.x * (steepness * cos(f)),
          -d.x * d.y * (steepness * sin(f))
        );
        binormal += vec3(
          -d.x * d.y * (steepness * sin(f)),
          d.y * (steepness * cos(f)),
          - d.y * d.y * (steepness * sin(f))
        );
        return vec3(
          d.x * (a * cos(f)),
          a * sin(f),
          d.y * (a * cos(f))
        );
      }
      
      void main() {
        vec3 pos = position;
        vUv = textureMatrix * vec4( pos, 1.0 );

        // 1.dirX  2.dirZ  3.steepness  4.waveLength
        vec4 waveA = vec4(1.0, 1.0, 0.025, 30.);
        vec4 waveB = vec4(1.0, 0.6, 0.025, 15.);
        vec4 waveC = vec4(0.1, -1.3, 0.025, 8.);
        vec4 waveD = vec4(0.6, -1.0, 0.025, 3);

        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);

        vec3 tempPos = position;
  
        pos += gerstnerWave(waveA.x, waveA.y, waveA.z, waveA.w, tangent, binormal, tempPos);
        pos += gerstnerWave(waveB.x, waveB.y, waveB.z, waveB.w, tangent, binormal, tempPos);
        pos += gerstnerWave(waveC.x, waveC.y, waveC.z, waveC.w, tangent, binormal, tempPos);
        pos += gerstnerWave(waveD.x, waveD.y, waveD.z, waveD.w, tangent, binormal, tempPos);

        vec3 waveNormal = normalize(cross(binormal, tangent));
        vNormal = waveNormal;

        
        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;
        vPos = modelPosition.xyz;
        gl_Position = projectionPosition;
        ${THREE.ShaderChunk.logdepthbuf_vertex}
      }
    `,
    fragmentShader: `\
        ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
        #include <common>
        #include <packing>
        #include <bsdfs>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>

        uniform mat4 textureMatrix;
        uniform vec3 eye;
        uniform vec3 playerPos;
        uniform sampler2D mirror;
        uniform sampler2D refractionTexture;
        uniform bool cameraInWater;
      
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec4 vUv;

        uniform float uTime;
        uniform sampler2D tDepth;
        uniform sampler2D foamTexture;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;

        uniform sampler2D tDistortion;

        const vec4 phases = vec4(0.28, 0.50, 0.07, 0);
        const vec4 amplitudes = vec4(4.02, 0.34, 0.65, 0);
        const vec4 frequencies = vec4(0.00, 0.48, 0.08, 0);
        const vec4 offsets = vec4(0.00, 0.17, 0.00, 0);

        const float TAU = 2. * 3.14159265;

        vec4 cosine_gradient(float x,  vec4 phase, vec4 amp, vec4 freq, vec4 offset){
          phase *= TAU;
          x *= TAU;

          return vec4(
            offset.r + amp.r * 0.5 * cos(x * freq.r + phase.r) + 0.5,
            offset.g + amp.g * 0.5 * cos(x * freq.g + phase.g) + 0.5,
            offset.b + amp.b * 0.5 * cos(x * freq.b + phase.b) + 0.5,
            offset.a + amp.a * 0.5 * cos(x * freq.a + phase.a) + 0.5
          );
        }
        float getDepth(const in vec2 screenPosition) {
          return unpackRGBAToDepth( texture2D(tDepth, screenPosition));
        }
        float getViewZ(const in float depth) {
          return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
        }  
        float getDepthFade(float fragmentLinearEyeDepth, float linearEyeDepth, float depthScale, float depthFalloff) {
          return pow(saturate(1. - (fragmentLinearEyeDepth - linearEyeDepth) / depthScale), depthFalloff);
        }
        vec4 cutout(float depth, float alpha) {
          return vec4(ceil(depth - saturate(alpha)));
        }
        
        void main() {
          vec2 screenUV = gl_FragCoord.xy / resolution;

          float fragmentLinearEyeDepth = getViewZ(gl_FragCoord.z);
          float linearEyeDepth = getViewZ(getDepth(screenUV));

          if (!cameraInWater) {
            //################################## compute waterColor ##################################
            float depthScale = 15.;
            float depthFalloff = 3.;
            float sceneDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, depthScale, depthFalloff);
            vec3 viewIncidentDir = normalize(eye - vPos.xyz);
            vec3 viewReflectDir = reflect(viewIncidentDir, vec3(0., 1.0, 0.));
            float fresnelCoe = (dot(viewIncidentDir,viewReflectDir) + 1.) / 2.;
            fresnelCoe = clamp(fresnelCoe, 0., 1.0);
            float waterColorDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, 20., 1.);

            float colorLerp = mix(fresnelCoe, 1. - waterColorDepth, waterColorDepth);
            colorLerp = mix(colorLerp, 1. - waterColorDepth, saturate(distance(eye, vPos) / 150.));
            
            vec4 cos_grad = cosine_gradient(saturate(1. - colorLerp), phases, amplitudes, frequencies, offsets);
            cos_grad = clamp(cos_grad, vec4(0.), vec4(1.));
            vec4 waterColor = vec4(cos_grad.rgb, 1. - sceneDepth);
            

            //################################## handle foam ##################################
            float fadeoutDistance = 50.;
            float fadeoutLerp = pow(saturate(distance(playerPos, vPos) / fadeoutDistance), 3.);
        
            vec4 ds2 = texture2D( 
              tDistortion, 
              vec2(
                0.25 * vPos.x + uTime * 0.01,
                0.25 * vPos.z + uTime * 0.01
              ) 
            );
            vec4 ds = texture2D( 
              tDistortion, 
              vec2(
                0.3 * vPos.x + uTime * 0.005,
                0.3 * vPos.z + uTime * 0.005
              ) 
            );
            
            float distortionDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, 8., 2.);
            float distortionDegree = pow(clamp((1. - distortionDepth), 0.2, 1.0), 0.2);
            vec2 foamDistortion = vec2(ds2.r + ds.r, ds2.g + ds.g) * distortionDegree;
            float foamDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, 8., 2.);
            float foamDiff = saturate( fragmentLinearEyeDepth - linearEyeDepth );
            float foamUvX = (vPos.x + vPos.z) * -0.02;
            float foamUvY = (vPos.x + vPos.z) * -0.02 + foamDepth * 1.5 - uTime * 0.4;
            vec2 foamUv = mix(vec2(foamUvX, foamUvY), foamDistortion, 0.15);
            vec4 foamTex = texture2D(foamTexture, foamUv);
            foamTex = step(vec4(0.9), foamTex);
            vec4 foamT = vec4(foamTex.r * (1.0 - foamDepth) * 2.);
            foamT = mix(vec4(0.), foamT, foamDepth * fadeoutLerp);
            vec4 foamLineCutOut = saturate(foamT);
            vec4 col2 = waterColor * ((vec4(1.0) - foamLineCutOut)) + foamT;


            //################################## handle mirror ##################################
            vec3 surfaceNormal = normalize( vNormal * vec3( 1.5, 1.0, 1.5 ) );
            vec3 worldToEye = eye - vPos.xyz;
            vec3 eyeDirection = normalize( worldToEye );
            float distance = length(worldToEye);
            float distortionScale = 3.;
            vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / distance) * distortionScale;
            vec3 reflectionSample = vec3(texture2D( mirror, vUv.xy / vUv.w + distortion));
            float theta = max(dot(eyeDirection, surfaceNormal), 0.0);
            float rf0 = 0.3;
            float reflectance = rf0 + (1.0 - rf0) * pow((1.0 - theta), 5.0);
            vec3 albedo = mix(vec3(0.2), reflectionSample * 0.4, reflectance);
            gl_FragColor = vec4(albedo, col2.a);
            gl_FragColor.rgb += col2.rgb;
          }
          else{
            //################################## refraction ##################################
            vec3 waterColor = vec3(0.126, 0.47628, 0.6048);
            
            vec3 surfaceNormal = normalize( vNormal * vec3( 1.5, 1.0, 1.5 ) );
            vec3 worldToEye = eye-vPos.xyz;
            vec3 eyeDirection = normalize( worldToEye );
            float distance = length(worldToEye);
            float distortionScale = 0.1;
            vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / distance) * distortionScale;
            vec3 reflectionSample = vec3(texture2D(refractionTexture, vUv.xy / vUv.w + distortion));
            float theta = max(dot(eyeDirection, surfaceNormal), 0.0);
            float rf0 = 0.3;
            float reflectance = rf0 + (1.0 - rf0) * pow((1.0 - theta), 5.0);
            vec3 albedo = mix(vec3(0.2), reflectionSample * 0.4, reflectance);
            gl_FragColor = vec4(albedo, 1.0);
            gl_FragColor.rgb += waterColor.rgb;
          }
          #include <tonemapping_fragment>
          #include <fog_fragment>
          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    // blending: THREE.AdditiveBlending,
  });
    return material;
};

export default _createWaterMaterial;
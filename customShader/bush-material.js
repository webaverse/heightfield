import * as THREE from "three";

export const _createBushMaterial = (attributeTextures, maxInstancesPerGeometryPerDrawCall) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {
        value: 0
      },
      map: {
        value: null
      },
      noiseTexture: {
        value: null
      },
      pTexture: {
        value: attributeTextures.p,
        needsUpdate: true,
      },
      qTexture: {
        value: attributeTextures.q,
        needsUpdate: true,
      },
      cTexture: {
        value: attributeTextures.c,
        needsUpdate: true,
      },
      lightPos: {
        value: new THREE.Vector3()
      },
      lightIntensity: {
        value: 0
      },
      eye: {
        value: new THREE.Vector3()
      }
    },
    vertexShader: /* glsl */`\
      ${THREE.ShaderChunk.common}
      ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vColorMultiplier;
      
      uniform float uTime;
      uniform sampler2D pTexture;
      uniform sampler2D qTexture;
      uniform sampler2D cTexture;
      uniform sampler2D noiseTexture;
  
      vec3 rotate_vertex_position(vec3 position, vec4 q) { 
        return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
      }
      
      void main() {
        vUv = uv;
        vNormal = normal;
  
        int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;
        const float width = ${attributeTextures.p.image.width.toFixed(8)};
        const float height = ${attributeTextures.p.image.height.toFixed(8)};
        float x = mod(float(instanceIndex), width);
        float y = floor(float(instanceIndex) / width);
        vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
        vec3 p = texture2D(pTexture, pUv).xyz;
        vec4 q = texture2D(qTexture, pUv).xyzw;
        vec3 c = texture2D(cTexture, pUv).xyz;
  
        vec3 pos = position; 
        vNormal = rotate_vertex_position(vNormal, q);
        pos = rotate_vertex_position(pos, q);
        pos += p;

        vec4 tempPos = modelMatrix * vec4(pos, 1.0);
        float noiseScale = 0.001;
        vec2 texUv = vec2(
          tempPos.x * noiseScale + uTime * 0.0001,
          tempPos.z * noiseScale + uTime * 0.0001
        );
        vec4 noise = texture2D(noiseTexture, texUv);
        pos += noise.r * vec3(2., 0., 2.);
  
        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;
        vWorldPosition = modelPosition.xyz;
        gl_Position = projectionPosition;

        vColorMultiplier = c;
        ${THREE.ShaderChunk.logdepthbuf_vertex}
      }
    `,
    fragmentShader: /* glsl */`\
        ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
        #include <common>
  
        uniform float uTime;
        uniform vec3 eye;
        uniform vec3 lightPos;
        uniform sampler2D map;
  
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vColorMultiplier;
        varying vec3 vWorldPosition;
  
        float DGGX(float a2, float NoH){
          float d = (NoH * a2 - NoH) * NoH + 1.; 
          return a2 / (PI * d * d);         
        }
        
        void main() {
          vec3 eyeDirection = normalize(eye - vWorldPosition);
          vec3 surfaceNormal = normalize(vNormal);
          vec3 lightDir = normalize(lightPos);
          float NdotL = max(0.0, dot(lightDir, surfaceNormal));
          float EdotL = max(0.0, dot(eyeDirection, surfaceNormal));
          
          vec4 col;
          vec4 bushColor = texture2D(map, vUv);
          gl_FragColor = bushColor;
          if (gl_FragColor.a < 0.9) {
            discard;
          }

          vec3 albedo = mix(vec3(0.0399, 0.570, 0.164), vec3(0.483, 0.950, 0.171), NdotL).rgb;

          vec3 diffuse = mix(albedo.rgb * 0.5, albedo.rgb, NdotL);
          vec3 lightToEye = normalize(lightPos + eye);
          float specularRoughness = 0.6;
          float specularIntensity = 0.9;
          float specular = DGGX(specularRoughness * specularRoughness, NdotL);
          
          vec3 specularColor = albedo * specular * specularIntensity;
          vec3 backLightDir = normalize(surfaceNormal + lightPos);
          float backSSS = saturate(dot(eyeDirection, -backLightDir));
          float backSSSIntensity = (1. - saturate(dot(eyeDirection, surfaceNormal))) * 1.0;
          backSSS = saturate(dot(pow(backSSS, 10.), backSSSIntensity));
  
          float colorIntensity = 0.17;
          
          gl_FragColor.rgb = (diffuse + albedo + specularColor) * colorIntensity;

          gl_FragColor.rgb *= vColorMultiplier;
          
          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });
  return material;
}




export const _createBushSingleMaterial = (attributeTextures, maxInstancesPerGeometryPerDrawCall) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {
        value: 0
      },
      map: {
        value: null
      },
      noiseTexture: {
        value: null
      },
      lightPos: {
        value: new THREE.Vector3()
      },
      lightIntensity: {
        value: 0
      },
      eye: {
        value: new THREE.Vector3()
      }
    },
    vertexShader: /* glsl */`\
      ${THREE.ShaderChunk.common}
      ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      
      uniform float uTime;
      uniform sampler2D noiseTexture;
  
      void main() {
        vUv = uv;
        vNormal = normal;
  
        vec3 pos = position; 
        vec4 tempPos = modelMatrix * vec4(pos, 1.0);
        float noiseScale = 0.001;
        vec2 texUv = vec2(
          tempPos.x * noiseScale + uTime * 0.0001,
          tempPos.z * noiseScale + uTime * 0.0001
        );
        vec4 noise = texture2D(noiseTexture, texUv);
        pos += noise.r * vec3(2., 0., 2.);
  
        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;
        vWorldPosition = modelPosition.xyz;
        gl_Position = projectionPosition;
        ${THREE.ShaderChunk.logdepthbuf_vertex}
      }
    `,
    fragmentShader: /* glsl */`\
        ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
        #include <common>
  
        uniform float uTime;
        uniform vec3 eye;
        uniform vec3 lightPos;
        uniform sampler2D map;
  
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
  
        float DGGX(float a2, float NoH){
          float d = (NoH * a2 - NoH) * NoH + 1.; 
          return a2 / (PI * d * d);         
        }
        
        void main() {
          vec3 eyeDirection = normalize(eye - vWorldPosition);
          vec3 surfaceNormal = normalize(vNormal);
          vec3 lightDir = normalize(lightPos);
          float NdotL = max(0.0, dot(lightDir, surfaceNormal));
          float EdotL = max(0.0, dot(eyeDirection, surfaceNormal));
          
          vec4 col;
          vec4 bushColor = texture2D(map, vUv);
          gl_FragColor = bushColor;
          if (gl_FragColor.a < 0.9) {
            discard;
          }

          vec3 albedo = mix(vec3(0.0399, 0.570, 0.164), vec3(0.483, 0.950, 0.171), NdotL).rgb;

          vec3 diffuse = mix(albedo.rgb * 0.5, albedo.rgb, NdotL);
          vec3 lightToEye = normalize(lightPos + eye);
          float specularRoughness = 0.6;
          float specularIntensity = 0.9;
          float specular = DGGX(specularRoughness * specularRoughness, NdotL);
          
          vec3 specularColor = albedo * specular * specularIntensity;
          vec3 backLightDir = normalize(surfaceNormal + lightPos);
          float backSSS = saturate(dot(eyeDirection, -backLightDir));
          float backSSSIntensity = (1. - saturate(dot(eyeDirection, surfaceNormal))) * 1.0;
          backSSS = saturate(dot(pow(backSSS, 10.), backSSSIntensity));
  
          float colorIntensity = 0.17;
          
          gl_FragColor.rgb = (diffuse + albedo + specularColor) * colorIntensity;
          
          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });
  return material;
}
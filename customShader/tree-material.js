import * as THREE from "three";

export const _createTreeMaterial = (attributeTextures, maxInstancesPerGeometryPerDrawCall) => {
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
      attribute vec4 color;
      
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec4 vColor;
      varying vec3 vColorMultiplier;
      varying vec3 vNormal;
      
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
        vColor = color;
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

        if (vColor.r > 0.1) {
          // vec3 offset = uv.x * sin(uv.y + uTime) * vec3(1., 0., 1.);
          vec4 tempPos = modelMatrix * vec4(pos, 1.0);
          float uvScale = 1.0;
          float speed = 0.001;
          vec2 texUv = vec2(
            tempPos.x * uvScale + uTime * speed,
            tempPos.z * uvScale + uTime * speed
          );
          vec4 noise = texture2D(noiseTexture, texUv);
          float noiseScale = 1.0;
          pos += noise.r * vec3(noiseScale, 0., noiseScale);
        }
  
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
        uniform float lightIntensity;
        uniform sampler2D map;
  
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vColorMultiplier;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
  
        float DGGX(float a2, float NoH){
          float d = (NoH * a2 - NoH) * NoH + 1.; 
          return a2 / (PI * d * d);         
        }
        
        // cosine gradient 
        const float TAU = 2. * 3.14159265;
        const vec4 phases = vec4(0.34, 0.48, 0.27, 0);
        const vec4 amplitudes = vec4(4.02, 0.34, 0.65, 0);
        const vec4 frequencies = vec4(0.00, 0.48, 0.08, 0);
        const vec4 offsets = vec4(0.21, 0.33, 0.06, -0.38);
        vec4 cosGradient(float x, vec4 phase, vec4 amp, vec4 freq, vec4 offset){
          phase *= TAU;
          x *= TAU;
          return vec4(
            offset.r + amp.r * 0.5 * cos(x * freq.r + phase.r) + 0.5,
            offset.g + amp.g * 0.5 * cos(x * freq.g + phase.g) + 0.5,
            offset.b + amp.b * 0.5 * cos(x * freq.b + phase.b) + 0.5,
            offset.a + amp.a * 0.5 * cos(x * freq.a + phase.a) + 0.5
          );
        }
  
        void main() {
          vec3 eyeDirection = normalize(eye - vWorldPosition);
          vec3 surfaceNormal = normalize(vNormal);
          vec3 lightDir = normalize(lightPos);
          float NdotL = max(0.0, dot(lightDir, surfaceNormal));
          float EdotL = max(0.0, dot(eyeDirection, surfaceNormal));


          bool isLeaf = vColor.r > 0.1;
          vec4 col;
          vec4 treeColor;
          if (isLeaf) {
            vec4 leaf = texture2D(map, vUv);
            treeColor = leaf;
            gl_FragColor.a = treeColor.a;
          }
          else {
            vec4 bark = texture2D(map, vUv);
            treeColor = bark;
            gl_FragColor.a = treeColor.a;
          }
          if (gl_FragColor.a < 0.9) {
            discard;
          }
  
          float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
          vec4 cosGradColor = cosGradient(NdotL, phases, amplitudes, frequencies, offsets);
          vec3 ambient = cosGradColor.rgb * smoothstep(0.1, 0.99, topColor);


          float albedoLerp = mix(1. - EdotL, NdotL, 0.5) + 0.4;
          vec3 albedo = mix(vec3(0.0399, 0.570, 0.164), vec3(0.483, 0.950, 0.171), albedoLerp).rgb;
          vec3 diffuse = mix(ambient.rgb * albedo.rgb, albedo.rgb, NdotL);
          vec3 lightToEye = normalize(lightPos + eye);
          float specularRoughness = 0.6;
          float specularIntensity = 0.9;
          float specular = DGGX(specularRoughness * specularRoughness, NdotL);
          // vec3 specularColor = albedo * specular * specularIntensity;
          vec3 specularColor = isLeaf ? albedo * specular * specularIntensity : vec3(specular * specularIntensity);
          vec3 backLightDir = normalize(surfaceNormal + lightPos);
          float backSSS = saturate(dot(eyeDirection, -backLightDir));
          float backSSSIntensity = (1. - EdotL) * 1.0;
          backSSS = saturate(dot(pow(backSSS, 10.), backSSSIntensity));
  
          float colorIntensity = 0.3;
          
          if (isLeaf) {
            gl_FragColor.rgb = (diffuse + albedo + specularColor) * colorIntensity;
            gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.6, gl_FragColor.rgb, treeColor.r);
            
            // float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
            // gl_FragColor.rgb *= smoothstep(0.1, 0.99, topColor) * 1.5;
            
            gl_FragColor.rgb += backSSS * lightIntensity * 0.1;

            gl_FragColor.rgb *= vColorMultiplier;
          }
          else {
            gl_FragColor.rgb = (treeColor.rgb + specularColor) * colorIntensity * 0.5;
          }
          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });
  return material;
}

export const _createTreeSingleMaterial = () => {
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
      attribute vec4 color;
      
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec4 vColor;
      varying vec3 vNormal;
      
      uniform float uTime;
      uniform sampler2D pTexture;
      uniform sampler2D qTexture;
      uniform sampler2D noiseTexture;
      
      void main() {
        vUv = uv;
        vColor = color;
        vNormal = normal;
  
        vec3 newPosition = position;
        if (vColor.r > 0.1) {
          // vec3 offset = uv.x * sin(uv.y + uTime) * vec3(1., 0., 1.);
          vec4 tempPos = modelMatrix * vec4(pos, 1.0);
          float uvScale = 1.0;
          float speed = 0.001;
          vec2 texUv = vec2(
            tempPos.x * uvScale + uTime * speed,
            tempPos.z * uvScale + uTime * speed
          );
          vec4 noise = texture2D(noiseTexture, texUv);
          float noiseScale = 1.0;
          pos += noise.r * vec3(noiseScale, 0., noiseScale);
        }
  
        vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
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
        uniform float lightIntensity;
        uniform sampler2D map;
  
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
  
        float DGGX(float a2, float NoH){
          float d = (NoH * a2 - NoH) * NoH + 1.; 
          return a2 / (PI * d * d);         
        }
        
        // cosine gradient 
        const float TAU = 2.0 * PI;
        const vec4 phases = vec4(0.34, 0.48, 0.27, 0);
        const vec4 amplitudes = vec4(4.02, 0.34, 0.65, 0);
        const vec4 frequencies = vec4(0.00, 0.48, 0.08, 0);
        const vec4 offsets = vec4(0.21, 0.33, 0.06, -0.38);
        vec4 cosGradient(float x, vec4 phase, vec4 amp, vec4 freq, vec4 offset){
          phase *= TAU;
          x *= TAU;
          return vec4(
            offset.r + amp.r * 0.5 * cos(x * freq.r + phase.r) + 0.5,
            offset.g + amp.g * 0.5 * cos(x * freq.g + phase.g) + 0.5,
            offset.b + amp.b * 0.5 * cos(x * freq.b + phase.b) + 0.5,
            offset.a + amp.a * 0.5 * cos(x * freq.a + phase.a) + 0.5
          );
        }
  
        void main() {
          vec3 eyeDirection = normalize(eye - vWorldPosition);
          vec3 surfaceNormal = normalize(vNormal);
          vec3 lightDir = normalize(lightPos);
          float NdotL = max(0.0, dot(lightDir, surfaceNormal));
          float EdotL = max(0.0, dot(eyeDirection, surfaceNormal));


          bool isLeaf = vColor.r > 0.1;
          vec4 col;
          vec4 treeColor;
          if (isLeaf) {
            vec4 leaf = texture2D(map, vUv);
            treeColor = leaf;
            gl_FragColor.a = treeColor.a;
          }
          else {
            vec4 bark = texture2D(map, vUv);
            treeColor = bark;
            gl_FragColor.a = treeColor.a;
          }
          if (gl_FragColor.a < 0.9) {
            discard;
          }
  
          float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
          vec4 cosGradColor = cosGradient(NdotL, phases, amplitudes, frequencies, offsets);
          vec3 ambient = cosGradColor.rgb * smoothstep(0.1, 0.99, topColor);

          float albedoLerp = mix(1. - EdotL, NdotL, 0.5) + 0.4;
          vec3 albedo = mix(vec3(0.0399, 0.570, 0.164), vec3(0.483, 0.950, 0.171), albedoLerp).rgb;
          vec3 diffuse = mix(ambient.rgb * albedo.rgb, albedo.rgb, NdotL);
          vec3 lightToEye = normalize(lightPos + eye);
          float specularRoughness = 0.6;
          float specularIntensity = 0.9;
          float specular = DGGX(specularRoughness * specularRoughness, NdotL);
          // vec3 specularColor = albedo * specular * specularIntensity;
          vec3 specularColor = isLeaf ? albedo * specular * specularIntensity : vec3(specular * specularIntensity);
          vec3 backLightDir = normalize(surfaceNormal + lightPos);
          float backSSS = saturate(dot(eyeDirection, -backLightDir));
          float backSSSIntensity = (1. - EdotL) * 1.0;
          backSSS = saturate(dot(pow(backSSS, 10.), backSSSIntensity));
  
          const float colorIntensity = 0.3;
          
          if (isLeaf) {
            gl_FragColor.rgb = (diffuse + albedo + specularColor) * colorIntensity;
            gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.6, gl_FragColor.rgb, treeColor.r);
            
            // float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
            // gl_FragColor.rgb *= smoothstep(0.1, 0.99, topColor) * 1.5;
            
            gl_FragColor.rgb += backSSS * lightIntensity * 0.1;
          }
          else {
            gl_FragColor.rgb = (treeColor.rgb + specularColor) * colorIntensity * 0.5;
          }

          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });

  return material;
}
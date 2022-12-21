import * as THREE from "three";

const _createGrassMaterial = (attributeTextures, maxInstancesPerGeometryPerDrawCall) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {
        value: 0
      },
      uGrassBladeHeight: {
        value: null,
      },
      map: {
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
      sTexture: {
        value: attributeTextures.s,
        needsUpdate: true,
      },
      lightPos: {
        value: new THREE.Vector3()
      },
      eye: {
        value: new THREE.Vector3()
      }
    },
    vertexShader: `\
        
      ${THREE.ShaderChunk.common}
      ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
      
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vGrassHeight;
      
      uniform sampler2D pTexture;
      uniform sampler2D qTexture;
      uniform sampler2D cTexture;
      uniform sampler2D sTexture;
      uniform float uGrassBladeHeight;
      uniform float uTime;
  
      vec3 rotateVertexPosition(vec3 position, vec4 q) { 
        return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
      }
      
      void main() {
        vUv = uv;
        vNormal = normal;
        vec3 pos = position;
  
        int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;

        const float width = ${attributeTextures.p.image.width.toFixed(8)};
        const float height = ${attributeTextures.p.image.height.toFixed(8)};

        float x = mod(float(instanceIndex), width);
        float y = floor(float(instanceIndex) / width);
        vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);

        vec3 p = texture2D(pTexture, pUv).xyz; // position
        vec4 q = texture2D(qTexture, pUv).xyzw; // quaternion
        float s = texture2D(sTexture, pUv).x; // scale
        vec3 c = texture2D(cTexture, pUv).xyz; // color

        // * Grass Height Range -> [0.0, 1.0]
        float grassHeight = pos.y / uGrassBladeHeight;
        vec3 scaledPosition = pos;
        scaledPosition *= s; // scale
        scaledPosition.y *= grassHeight; // height scale

       
       
        // transform processing
        pos = rotateVertexPosition(scaledPosition, q);
        pos += p;

        float grassWorldHeight = grassHeight * s;
        vGrassHeight = grassWorldHeight;
  
        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;
        vWorldPosition = modelPosition.xyz;
        gl_Position = projectionPosition;
        ${THREE.ShaderChunk.logdepthbuf_vertex}
      }
    `,
    fragmentShader: `\
        ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
        #include <common>
  
        uniform float uTime;
        uniform vec3 eye;
        uniform vec3 lightPos;
        uniform sampler2D map;
  
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying float vGrassHeight;
  
        
        void main() {
          vec3 eyeDirection = normalize(eye - vWorldPosition);
          vec3 surfaceNormal = normalize(vNormal);
          vec3 lightDir = normalize(lightPos);
          float NdotL = max(0.0, dot(lightDir, surfaceNormal));
          
          vec4 bush = texture2D(map, vUv);
          vec3 grassColor = vec3(0.0375, 0.750, 0.0494);
          float grassColorLerp = 0.7;
          grassColor = mix(grassColor * vGrassHeight, grassColor, grassColorLerp) * bush.r;

          vec3 diffuse = mix(grassColor * vGrassHeight, vec3(0.0450, 0.900, 0.0592), NdotL);

          vec3 flowerColor = vec3(0.7, 0.7, 0.7) * (bush.g - bush.r);

          // gl_FragColor = vec4(grassColor + flowerColor, bush.g);
          gl_FragColor = vec4(diffuse, bush.r);
          if (gl_FragColor.a < 0.9) {
            discard;
          }
          ${THREE.ShaderChunk.logdepthbuf_fragment}
        }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });
  return material;
}
export default _createGrassMaterial;
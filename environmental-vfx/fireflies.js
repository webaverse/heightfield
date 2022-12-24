import * as THREE from 'three';

const baseUrl = import.meta.url.replace(/(\/)[^\/\/]*$/, '$1'); 
const textureLoader = new THREE.TextureLoader();

const glowSpheretexture = textureLoader.load(`${baseUrl}environmental-vfx/textures/glowSphere3.png`);

export const getFireflies = (particleCount, player, camera) => {
  
  const _getGeometry = (geometry, attributeSpecs, particleCount) => {
    const geometry2 = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(k => {
    geometry2.setAttribute(k, geometry.attributes[k]);
    });
    geometry2.setIndex(geometry.index);

    const positions = new Float32Array(particleCount * 3);
    const positionsAttribute = new THREE.InstancedBufferAttribute(positions, 3);
    geometry2.setAttribute('positions', positionsAttribute);

    for(const attributeSpec of attributeSpecs){
      const {
        name,
        itemSize,
      } = attributeSpec;
      const array = new Float32Array(particleCount * itemSize);
      geometry2.setAttribute(name, new THREE.InstancedBufferAttribute(array, itemSize));
    }

    return geometry2;
  };
  const attributeSpecs = [];
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'opacity', itemSize: 1});
  
  const geometry2 = new THREE.PlaneBufferGeometry(0.17, 0.17);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
      

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      cameraBillboardQuaternion: {
        value: new THREE.Quaternion(),
      },
      glowSpheretexture: {
        value: glowSpheretexture
      },
      sun: {
        value: 1
      }
    },
    vertexShader: `
      ${THREE.ShaderChunk.common}
      ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
      uniform float uTime;
      uniform float size;
      uniform vec4 cameraBillboardQuaternion;
      
      attribute float scales;
      attribute float opacity;
      
      attribute vec3 positions;
      
      varying vec2 vUv;
      varying float vOpacity;
      
      
      vec3 rotateVecQuat(vec3 position, vec4 q) {
        vec3 v = position.xyz;
        return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
      }
      void main() {  
        vUv = uv;
        vOpacity = opacity;
        
        vec3 pos = position;
        pos = rotateVecQuat(pos, cameraBillboardQuaternion);
        pos *= scales;
        pos += positions;
        vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;
        gl_Position = projectionPosition;
        ${THREE.ShaderChunk.logdepthbuf_vertex}
      }
    `,
    fragmentShader: `
      ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
      uniform float uTime;
      uniform float sun;
      uniform sampler2D glowSpheretexture;

      varying vec2 vUv;
      varying float vOpacity;
      

      #define PI 3.1415926

      void main() {
        
        vec4 glowSphere = texture2D(glowSpheretexture, vUv);    
        gl_FragColor = glowSphere;
        
        if (sun < 0.5) {
          gl_FragColor.rgb *= vec3(0.970, 0.748, 0.0194);
          gl_FragColor.a *= vOpacity;
        }
        else {
          gl_FragColor.rgb = smoothstep(vec3(0.), vec3(2.), gl_FragColor.rgb);
          gl_FragColor.a *= 0.6;
        }
        
        
        ${THREE.ShaderChunk.logdepthbuf_fragment}
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    // depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const fireFlies = new THREE.InstancedMesh(geometry, material, particleCount);

  const info = {
    velocity: [particleCount],
    flashSpeed: [particleCount],
  }
  for (let i = 0; i < particleCount; i ++) {
    info.velocity[i] = new THREE.Vector3();
    info.flashSpeed[i] = Math.random();
  }

  const maxFireflyDistance = 100;
  let azimuth = 0.4;
  fireFlies.update = (timestamp) => {
    azimuth = (0.05 + (Date.now() / 5000) * 0.1) % 1;
    const scalesAttribute = fireFlies.geometry.getAttribute('scales');
    const opacityAttribute = fireFlies.geometry.getAttribute('opacity');
    const positionsAttribute = fireFlies.geometry.getAttribute('positions');
    
    for(let i = 0; i < particleCount; i++){
      if (scalesAttribute.getX(i) <= 0.) {
        info.velocity[i].set(
          Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).divideScalar(100);
        info.flashSpeed[i] = Math.random();
        scalesAttribute.setX(i, Math.random());
        positionsAttribute.setXYZ(i,
          player.position.x + (Math.random() - 0.5) * maxFireflyDistance, 
          player.position.y + (Math.random() - 0.5) * 2, 
          player.position.z + (Math.random() - 0.5) * maxFireflyDistance
        );
        
      }
      positionsAttribute.setXYZ(
        i,
        positionsAttribute.getX(i) + info.velocity[i].x,
        positionsAttribute.getY(i) + info.velocity[i].y,
        positionsAttribute.getZ(i) + info.velocity[i].z
      )
      scalesAttribute.setX(i, scalesAttribute.getX(i) - 0.003);
      opacityAttribute.setX(i, Math.abs(Math.cos(timestamp * 0.005 * info.flashSpeed[i])));
    }
    scalesAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    opacityAttribute.needsUpdate = true;
    if (azimuth < 0.5) {
      material.uniforms.sun.value = 1;
    } else {
      material.uniforms.sun.value = 0;
    }
    material.uniforms.uTime.value = timestamp / 1000;
    material.uniforms.cameraBillboardQuaternion.value.copy(camera.quaternion);   
      
  }
  return fireFlies;
}
import * as THREE from 'three';

const baseUrl = import.meta.url.replace(/(\/)[^\/\/]*$/, '$1'); 
const textureLoader = new THREE.TextureLoader();

const leaftexture = textureLoader.load(`${baseUrl}environmental-fx/textures/Leaf10.png`);
const noisetexture = textureLoader.load(`${baseUrl}environmental-fx/textures/Noise28.png`);
noisetexture.wrapS = noisetexture.wrapT = THREE.RepeatWrapping;

export const getLeaf = (particleCount, player) => {
  
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
  const rnd = (max, negative) => {
    return negative ? Math.random() * 2 * max - max : Math.random() * max;
  }

  const limit = (number, min, max) => {
    return Math.min(Math.max(number, min), max);
  }

  let info = {
    velocity: [particleCount],
    position: [particleCount],
    destination: [particleCount],
    attraction: [particleCount],
    rotDir: [particleCount],
  }
  const attributeSpecs = [];
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'textureRotation', itemSize: 1});
  attributeSpecs.push({name: 'rotationX', itemSize: 1});
  attributeSpecs.push({name: 'rotationY', itemSize: 1});
  
  const geometry2 = new THREE.PlaneBufferGeometry(0.2, 0.2);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      leaftexture: {
        value: leaftexture
      },
      noisetexture: {
        value: noisetexture
      }
    },
    vertexShader: `
      ${THREE.ShaderChunk.common}
      ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
      uniform float uTime;
      uniform float size;
      uniform sampler2D noisetexture;
      
      attribute float scales;
      attribute float textureRotation;
      attribute float rotationX;
      attribute float rotationY;
      attribute vec3 positions;
      
      varying vec2 vUv;
      varying float vTextureRotation;
      
      void main() { 
        float noise = texture2D(noisetexture, positions.xz + uTime * 0.1).r;   
        noise = noise - 0.5;
        noise *= PI * 2.;
        float noiseScale = 0.0;
        noise *= noiseScale;

        mat3 rotX = mat3(
          1.0, 0.0, 0.0, 
          0.0, cos(rotationX), sin(rotationX), 
          0.0, -sin(rotationX), cos(rotationX)
        );
        mat3 rotY = mat3(
          cos(mod(rotationY, PI * 2.) + noise), 0.0, -sin(mod(rotationY, PI * 2.) + noise), 
          0.0, 1.0, 0.0, 
          sin(mod(rotationY, PI * 2.) + noise), 0.0, cos(mod(rotationY, PI * 2.) + noise)
        );
        
        vUv = uv;
        vTextureRotation = textureRotation;
        
        vec3 pos = position;
        pos *= scales;
        pos *= rotX;
        pos *= rotY;
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
      uniform sampler2D leaftexture;

      varying vec2 vUv;
      varying float vOpacity;
      varying float vTextureRotation;

      #define PI 3.1415926

      void main() {
        float mid = 0.5;
        vec2 rotated = vec2(
          cos(mod(vTextureRotation, PI * 2.)) * (vUv.x - mid) - sin(mod(vTextureRotation, PI * 2.)) * (vUv.y - mid) + mid,
          cos(mod(vTextureRotation, PI * 2.)) * (vUv.y - mid) + sin(mod(vTextureRotation, PI * 2.)) * (vUv.x - mid) + mid
        );
        
        vec4 leaf = texture2D(leaftexture, rotated);    
        gl_FragColor = leaf;
        
        ${THREE.ShaderChunk.logdepthbuf_fragment}
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const resetPositionRadius = 5;
  const resetDistanceRadius = 50;
  const resetDistanceHeight = 7;

  const setLeafInfo = (index) => {
    info.position[index].set(
      player.position.x + (Math.random() - 0.5) * resetPositionRadius,
      player.position.y - Math.random(),
      player.position.z + (Math.random() - 0.5) * resetPositionRadius,
    )
    info.destination[index].set(
      info.position[index].x + (Math.random() - 0.5) * resetDistanceRadius,
      info.position[index].y + Math.random() * resetDistanceHeight,
      info.position[index].z + (Math.random() - 0.5) * resetDistanceRadius
    )
    info.attraction[index] = 0.01 + Math.random() * 0.05;
    info.velocity[index].set(rnd(1, true), rnd(1, true), rnd(1, true));
  }


  const leaf = new THREE.InstancedMesh(geometry, material, particleCount);

  // initialize
  const positionsAttribute = leaf.geometry.getAttribute('positions');
  const rotationXAttribute = leaf.geometry.getAttribute('rotationX');
  const rYAttribute = leaf.geometry.getAttribute('rotationY');
  const scalesAttribute = leaf.geometry.getAttribute('scales');
  for (let i = 0; i < particleCount; i ++) {
    const maxRotationX = Math.PI / 2;
    rotationXAttribute.setX(i, Math.random() * maxRotationX);

    info.position[i] = new THREE.Vector3();
    info.destination[i] = new THREE.Vector3();
    info.velocity[i] = new THREE.Vector3();
    setLeafInfo(i);
    
    positionsAttribute.setXYZ(
      i,
      info.position[i].x,
      info.position[i].y,
      info.position[i].z
    );
    scalesAttribute.setX(i, 0.3 + Math.random() * 0.7);

    rYAttribute.setX(i, Math.random() * 2 * Math.PI);
    info.rotDir[i] = Math.random() > 0.5 ? 1 : -1;
  }
  scalesAttribute.needsUpdate = true;
  rotationXAttribute.needsUpdate = true;
  positionsAttribute.needsUpdate = true;
  rYAttribute.needsUpdate = true; 

  const localVector = new THREE.Vector3();
  const localVector2 = new THREE.Vector3();
  leaf.update = (timestamp) => {
    const textureRotationAttribute = leaf.geometry.getAttribute('textureRotation');
    const positionsAttribute = leaf.geometry.getAttribute('positions');
    const rotationYAttribute = leaf.geometry.getAttribute('rotationY');
    
    for(let i = 0; i < particleCount; i ++){
      localVector.set(info.destination[i].x, info.destination[i].y, info.destination[i].z);
      const dv = localVector.sub(info.position[i]).normalize();
      
      info.velocity[i].x += info.attraction[i] * dv.x;
      info.velocity[i].y += info.attraction[i] * dv.y;
      info.velocity[i].z += info.attraction[i] * dv.z;
      
      info.velocity[i].x = limit(info.velocity[i].x, -0.0125, 0.0125);
      info.velocity[i].y = limit(info.velocity[i].y, -0.0125, 0.0125);
      info.velocity[i].z = limit(info.velocity[i].z, -0.0125, 0.0125);

      const v2 = info.velocity[i];
      
      info.position[i].add(v2);

      positionsAttribute.setXYZ(
        i,
        info.position[i].x,
        info.position[i].y,
        info.position[i].z
      )
      
      let currentSpeed = localVector2.set(info.velocity[i].x, 0, info.velocity[i].z).length(); 
      currentSpeed *= 20;
      const rotSpeed = info.rotDir[i] * (1. - currentSpeed) * 0.1;
      rotationYAttribute.setX(i, rotationYAttribute.getX(i) + rotSpeed);
      textureRotationAttribute.setX(i, textureRotationAttribute.getX(i) + currentSpeed * 0.1);
      if (
        player.characterPhysics.grounded
        && (info.position[i].distanceTo(info.destination[i]) < 1 || info.position[i].distanceTo(player.position) > resetDistanceRadius)
      ) {
        setLeafInfo(i);
      }
    }
    
    positionsAttribute.needsUpdate = true;
    textureRotationAttribute.needsUpdate = true;
    rotationYAttribute.needsUpdate = true;
    
    material.uniforms.uTime.value = timestamp / 1000;
      
  }
  return leaf;
}
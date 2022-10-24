import * as THREE from 'three';
import {
  divingRippleVertex, divingRippleFragment,
  divingLowerSplashVertex, divingLowerSplashFragment,
  divingHigherSplashVertex, divingHigherSplashFragment,
  bubbleVertex, bubbleFragment,
  dropletRippleVertex, dropletRippleFragment,
  movingRippleVertex, movingRippleFragment,
  freestyleSplashVertex, freestyleSplashFragment,
  bodyDropVertex, bodyDropFragment,
} from './shader.js';

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

const getDivingRipple = (rippleModel) => {
  const rippleGroup = new THREE.Group();
  rippleGroup.add(rippleModel.scene);
  const rippleMesh = rippleModel.scene.children[0];
  rippleMesh.visible = false;
  rippleMesh.material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {
        value: 0,
      },
      vBroken: {
        value: 0,
      },
      rippleTexture:{
        value: null
      },
      voronoiNoiseTexture:{
        value: null
      },
      noiseMap:{
        value: null
      },
    },
    vertexShader: divingRippleVertex,
    fragmentShader: divingRippleFragment,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  
  return rippleGroup;
}
const getDivingLowerSplash = () => {
  const particleCount = 15;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'broken', itemSize: 1});
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'textureRotation', itemSize: 1});
  const geometry2 = new THREE.PlaneGeometry(0.15, 0.25);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
  const material= new THREE.ShaderMaterial({
    uniforms: {
      cameraBillboardQuaternion: {
        value: new THREE.Quaternion(),
      },
      splashTexture: {
        value: null,
      },
      waterSurfacePos: {
        value: 0,
      },
      noiseMap:{
        value: null
      },
      noiseScale: {
        value: 2.5
      },
    },
    vertexShader: divingLowerSplashVertex,
    fragmentShader: divingLowerSplashFragment,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const divingLowerSplash = new THREE.InstancedMesh(geometry, material, particleCount);
  divingLowerSplash.info = {
    particleCount: particleCount,
    velocity: [particleCount],
    acc: new THREE.Vector3(0, -0.002, 0)
  }
  for (let i = 0; i < particleCount; i++) {
    divingLowerSplash.info.velocity[i] = new THREE.Vector3();
  }
  return divingLowerSplash;
}
const getDivingHigherSplash = () => {
  const particleCount = 15;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'broken', itemSize: 1});
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'rotation', itemSize: 1});
  const geometry2 = new THREE.PlaneGeometry(0.25, 0.7);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
  const material= new THREE.ShaderMaterial({
    uniforms: {
      splashTexture: {
        value: null,
      },
      waterSurfacePos: {
        value: 0,
      },
      noiseMap:{
        value: null
      },
    },
    vertexShader: divingHigherSplashVertex,
    fragmentShader: divingHigherSplashFragment,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const divingHigherSplash = new THREE.InstancedMesh(geometry, material, particleCount);
  divingHigherSplash.info = {
    particleCount: particleCount,
    velocity: [particleCount],
    acc: new THREE.Vector3(0, -0.0035, 0)
  }
  for (let i = 0; i < particleCount; i++) {
    divingHigherSplash.info.velocity[i] = new THREE.Vector3();
  }
  return divingHigherSplash;
}

const getDroplet = () => {
  const dropletgroup = new THREE.Group();
  // droplet particle
  const particleCount = 30;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'offset', itemSize: 2});
  const geometry2 = new THREE.PlaneGeometry(0.1, 0.1);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
  const material= new THREE.ShaderMaterial({
    uniforms: {
      cameraBillboardQuaternion: {
        value: new THREE.Quaternion(),
      },
      bubbleTexture1: {
        value: null,
      },
    },
    vertexShader: bubbleVertex,
    fragmentShader: bubbleFragment,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const droplet = new THREE.InstancedMesh(geometry, material, particleCount);
  
  droplet.info = {
    velocity: [particleCount],
    alreadyHaveRipple: [particleCount],
    offset: [particleCount],
    acc: new THREE.Vector3(0, -0.002, 0),
    startTime: [particleCount],
    particleCount: particleCount
  }
  for(let i = 0; i < particleCount; i++){
    droplet.info.velocity[i] = new THREE.Vector3();
    droplet.info.alreadyHaveRipple[i] = false;
  }
  dropletgroup.add(droplet);
  
  // droplet ripple particle
  const rippleAttributeSpecs = [];
  rippleAttributeSpecs.push({name: 'scales', itemSize: 1});
  rippleAttributeSpecs.push({name: 'broken', itemSize: 1});
  rippleAttributeSpecs.push({name: 'waveFreq', itemSize: 1});
  
  const geometry4 = new THREE.PlaneGeometry(0.45, 0.45);
  const geometry3 = _getGeometry(geometry4, rippleAttributeSpecs, particleCount);

  const quaternions = new Float32Array(particleCount * 4);
  const identityQuaternion = new THREE.Quaternion();
  for (let i = 0; i < particleCount; i++) {
    identityQuaternion.toArray(quaternions, i * 4);
  }
  const quaternionsAttribute = new THREE.InstancedBufferAttribute(quaternions, 4);
  geometry3.setAttribute('quaternions', quaternionsAttribute);

  const material2 = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {
        value: 0,
      },
      noiseMap:{
        value: null
      }
    },
    vertexShader: dropletRippleVertex,
    fragmentShader: dropletRippleFragment,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dropletRipple = new THREE.InstancedMesh(geometry3, material2, particleCount);
  const euler = new THREE.Euler(-Math.PI / 2, 0, 0);
  const quaternion = new THREE.Quaternion();
  const quaternionAttribute = dropletRipple.geometry.getAttribute('quaternions');
  for (let i = 0; i < particleCount; i++) {
    quaternion.setFromEuler(euler);
    quaternionAttribute.setXYZW(i, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  quaternionAttribute.needsUpdate = true;

  dropletgroup.add(dropletRipple);

  return dropletgroup;
}
const getMovingRipple = () => {
  const particleCount = 31;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'id', itemSize: 1});
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'broken', itemSize: 1});
  attributeSpecs.push({name: 'random', itemSize: 1});
  attributeSpecs.push({name: 'playerRotation', itemSize: 1});
  const geometry2 = new THREE.PlaneGeometry(0.32, 0.36);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);

  const quaternions = new Float32Array(particleCount * 4);
  const identityQuaternion = new THREE.Quaternion();
  for (let i = 0; i < particleCount; i ++) {
    identityQuaternion.toArray(quaternions, i * 4);
  }
  const quaternionsAttribute = new THREE.InstancedBufferAttribute(quaternions, 4);
  geometry.setAttribute('quaternions', quaternionsAttribute);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {
        value: 0,
      },
      op: {
        value: 0,
      },
      particleCount: {
        value: particleCount,
      },
      noiseMap2:{
        value: null
      },
      noiseMap:{
        value: null
      },
      noiseCircleTexture:{
        value: null
      },
      splashTexture2:{
        value: null
      },
      voronoiNoiseTexture:{
        value: null
      },
    },
    vertexShader: movingRippleVertex,
    fragmentShader: movingRippleFragment,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const movingRipple = new THREE.InstancedMesh(geometry, material, particleCount);
  
  movingRipple.info = {
    particleCount: particleCount,
    currentCircleRipple: 0,
    currentBrokenRipple: 15,
    lastEmmitTime: 0,
  }
  const euler = new THREE.Euler(-Math.PI / 2, 0, 0);
  const quaternion = new THREE.Quaternion();
  const quaternionAttribute = movingRipple.geometry.getAttribute('quaternions');
  const idAttribute = movingRipple.geometry.getAttribute('id');
  for (let i = 0; i < particleCount; i ++) {
    quaternion.setFromEuler(euler);
    quaternionAttribute.setXYZW(i, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    idAttribute.setX(i, i);
  }
  quaternionAttribute.needsUpdate = true;
  idAttribute.needsUpdate = true;
  return movingRipple;
}
const getMovingSplash = () => {
  const particleCount = 60;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'broken', itemSize: 1});
  attributeSpecs.push({name: 'textureRotation', itemSize: 1});
  const geometry2 = new THREE.PlaneGeometry(0.18, 0.18);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
  const group = new THREE.Group();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      cameraBillboardQuaternion: {
        value: new THREE.Quaternion(),
      },
      splashTexture: {
        value: null,
      },
      waterSurfacePos: {
        value: 0,
      },
      noiseMap: {
        value: null
      },
      noiseScale: {
        value: 0.9
      },
    },
    vertexShader: divingLowerSplashVertex,
    fragmentShader: divingLowerSplashFragment,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const movingSplash = new THREE.InstancedMesh(geometry, material, particleCount);
  group.add(movingSplash);
  movingSplash.info = {
    particleCount: particleCount,
    velocity: [particleCount],
    acc: [particleCount],
    brokenVelocity: [particleCount]
  }
  const brokenAttribute = movingSplash.geometry.getAttribute('broken');
  for (let i = 0; i < particleCount; i++) {
    brokenAttribute.setX(i, 1);
    movingSplash.info.velocity[i] = new THREE.Vector3();
    movingSplash.info.acc[i] = new THREE.Vector3();
  }
  brokenAttribute.needsUpdate = true;
  return group;
}
const getFreestyleSplash = (domeModel) => {
  const group = new THREE.Group();
  const freeStyleGroup = new THREE.Group();
  const particleCount = 6;
  domeModel.scene.traverse(o => {
    if (o.isMesh) {
      const splashGeometry = o.geometry;
      const attributeSpecs = [];
      attributeSpecs.push({name: 'broken', itemSize: 1});
      attributeSpecs.push({name: 'scales', itemSize: 3});
      attributeSpecs.push({name: 'rotation', itemSize: 1});
      const geometry = _getGeometry(splashGeometry, attributeSpecs, particleCount);

      const material= new THREE.ShaderMaterial({
        uniforms: {
          waterSurfacePos: {
            value: 0
          },
          circleTexture: {
            value: null
          },
          noiseMap: {
            value: null
          },
        },
        vertexShader: freestyleSplashVertex,
        fragmentShader: freestyleSplashFragment,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
      });

      const splash = new THREE.InstancedMesh(geometry, material, particleCount);
      splash.info = {
        particleCount: particleCount,
        initialScale: [particleCount],
      }
      for (let i = 0; i < particleCount; i ++) {
        splash.info.initialScale[i] = new THREE.Vector3();
      }
      group.add(splash);
      group.rotation.x = -Math.PI / 1.5;
      freeStyleGroup.add(group);
    }
  });
  
  return freeStyleGroup;
}
const getBubble = () => {
  const particleCount = 40;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'scales', itemSize: 1});
  attributeSpecs.push({name: 'offset', itemSize: 2});
  const geometry2 = new THREE.PlaneGeometry(0.02, 0.02);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      cameraBillboardQuaternion: {
        value: new THREE.Quaternion(),
      },
      bubbleTexture1: {
        value: null,
      },
    },
    vertexShader: bubbleVertex,
    fragmentShader: bubbleFragment,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bubble = new THREE.InstancedMesh(geometry, material, particleCount);
  
  bubble.info = {
    particleCount: particleCount,
    lastEmmitTime: 0,
    velocity: [particleCount],
    offset: [particleCount],
    livingTime:[particleCount],
    maxLife:[particleCount]
  }
  for (let i = 0; i < particleCount; i++) {
    bubble.info.velocity[i] = new THREE.Vector3();
  }
  return bubble;
}
const getBodyDrop = () => {
  const bodyDropGroup = new THREE.Group();
  const particleCount = 6;
  const attributeSpecs = [];
  attributeSpecs.push({name: 'broken', itemSize: 1});
  attributeSpecs.push({name: 'id', itemSize: 1});
  attributeSpecs.push({name: 'scales', itemSize: 3});
  attributeSpecs.push({name: 'opacity', itemSize: 1});
  const geometry2 = new THREE.PlaneGeometry(0.03, 0.03);
  const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      cameraBillboardQuaternion: {
        value: new THREE.Quaternion(),
      },
      splashTexture: {
        value: null,
      },
      noiseMap:{
        value: null
      },
      dropTexture: {
        value: null
      },
      dropCount: {
        value: particleCount / 2
      }
    },
    vertexShader: bodyDropVertex,
    fragmentShader: bodyDropFragment,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const bodyDrop = new THREE.InstancedMesh(geometry, material, particleCount);
  bodyDrop.info = {
    particleCount: particleCount,
    dropCount: particleCount / 2,
    lastContactWater: -Infinity
  }
  const idAttribute = bodyDrop.geometry.getAttribute('id');
  for (let i = 0; i < particleCount; i++) {
    idAttribute.setX(i, i);
  }
  idAttribute.needsUpdate = true;
  bodyDropGroup.add(bodyDrop);
  return bodyDropGroup;
}
export {
  getDivingRipple,
  getDivingLowerSplash,
  getDivingHigherSplash,
  getDroplet,
  getMovingRipple,
  getMovingSplash,
  getFreestyleSplash,
  getBubble,
  getBodyDrop,
};
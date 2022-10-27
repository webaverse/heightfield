import * as THREE from 'three';
import {
  divingRippleVertex, divingRippleFragment,
  divingLowerSplashVertex, divingLowerSplashFragment,
  divingHigherSplashVertex, divingHigherSplashFragment,
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
  const width = 0.15;
  const height = 0.25;
  const geometry2 = new THREE.PlaneGeometry(width, height);
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
  const width = 0.25;
  const height = 0.7;
  const geometry2 = new THREE.PlaneGeometry(width, height);
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

export {
  getDivingRipple,
  getDivingLowerSplash,
  getDivingHigherSplash,
};
import metaversefile from 'metaversefile';
import * as THREE from 'three';
import {
  getDivingRipple,
  getDivingLowerSplash,
  getDivingHigherSplash,
} from './mesh.js';

const {useSound, useInternals} = metaversefile;
const sounds = useSound();
const soundFiles = sounds.getSoundFiles();

// constants
const regex = new RegExp('^water/jump_water[0-9]*.wav$');
const divingCandidateAudios = soundFiles.water.filter((f) => regex.test(f.name));
const MAX_DISTORTION_RANGE = 1;
const DIVING_FALLING_SPEED_THRESHOLD = 1;

class WaterParticleEffect {
  constructor(textures, models) {
    this.textures = textures;
    this.models = models;
    this.scene = useInternals().sceneLowPriority;
    this.camera = useInternals().camera;
    this.contactWater = false;
    this.lastContactWater = false;
    this.player = null;
    this.waterSurfaceHeight = 0;
    this.divingCollisionPos = new THREE.Vector3();

    this.rippleMesh = null;
    this.rippleGroup = null;
    this.initRipple();

    this.divingLowerSplash = null;
    this.initDivingLowerSplash();

    this.divingHigherSplash = null;
    this.initDivingHigherSplash();
  }

  playDivingSfx() {
    const audioSpec = divingCandidateAudios[Math.floor(Math.random() * divingCandidateAudios.length)];
    sounds.playSound(audioSpec);
  }

  emitDivingRipple() {
    this.rippleMesh.visible = true;
    this.rippleGroup.position.copy(this.divingCollisionPos);
    const initDistortion = 0.1;
    const initScale = 0.25;
    const initTime = 120;
    this.rippleMesh.material.uniforms.vBroken.value = initDistortion;
    this.rippleMesh.scale.set(initScale, 1, initScale);
    this.rippleMesh.material.uniforms.uTime.value = initTime;
  }

  emitDivingLowerSplash() {
    const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
    const textureRotationAttribute = this.divingLowerSplash.geometry.getAttribute('textureRotation');
    const particleCount = this.divingLowerSplash.info.particleCount;
    for (let i = 0; i < particleCount; i ++) {
      const radius = 0.055;
      const vx = Math.sin(i) * radius + (Math.random() - 0.5) * 0.001;
      const vy = 0.12 + 0.01 * Math.random();
      const vz = Math.cos(i) * radius + (Math.random() - 0.5) * 0.001;
      this.divingLowerSplash.info.velocity[i].x = vx;
      this.divingLowerSplash.info.velocity[i].y = vy;
      this.divingLowerSplash.info.velocity[i].z = vz;
      positionsAttribute.setXYZ(  
        i, 
        this.divingCollisionPos.x + vx,
        this.divingCollisionPos.y + 0.1 * Math.random(),
        this.divingCollisionPos.z + vz
      );
      this.divingLowerSplash.info.velocity[i].divideScalar(5);
      const initScale = 0.6; 
      const initDistortion = 0.03 * Math.random() + 0.19;
      scalesAttribute.setX(i, initScale);
      textureRotationAttribute.setX(i, Math.random() * 2);
      brokenAttribute.setX(i, initDistortion);
    }
    brokenAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    textureRotationAttribute.needsUpdate = true;
  }

  emitDivingHigherSplash() {
    const brokenAttribute = this.divingHigherSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingHigherSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingHigherSplash.geometry.getAttribute('scales');
    const rotationAttribute = this.divingHigherSplash.geometry.getAttribute('rotation');
    const particleCount = this.divingHigherSplash.info.particleCount;
    for (let i = 0; i < particleCount; i ++) {
      const vy = 0.09 + Math.floor(i * 0.4) * 0.005;
      const initDistortion = 0.18 + Math.random() * 0.13;
      const initScale = 0.45 + Math.random() * 0.45;
      this.divingHigherSplash.info.velocity[i] = vy;
      brokenAttribute.setX(i, initDistortion);
      scalesAttribute.setX(i, initScale);

      const radius = 0.03;
      const initialHeight = -1.5;
      const theta = 2. * Math.PI * i / particleCount;
      positionsAttribute.setXYZ(
        i,
        this.divingCollisionPos.x + Math.sin(theta) * radius,
        this.divingCollisionPos.y + initialHeight,
        this.divingCollisionPos.z + Math.cos(theta) * radius
      ) 
      const n = Math.cos(theta) > 0 ? 1 : -1;
      rotationAttribute.setXYZ(i, -Math.sin(theta) * n * (Math.PI / 2)); 
    }
    brokenAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    rotationAttribute.needsUpdate = true;
  }

  update() {
    if (!this.player && !this.player.avatar) {
      return;
    }
    const timestamp = performance.now();

    //#################################### handle diving water ####################################
    if (this.contactWater) {
      this.lastContactWaterTime = timestamp;
    }
    if (this.contactWater && this.lastContactWater !== this.contactWater) {
      this.fallingSpeed = 0 - this.player.characterPhysics.velocity.y;
      this.divingCollisionPos.set(this.player.position.x, this.waterSurfaceHeight, this.player.position.z);

      // play the diving particle
      if (this.fallingSpeed > DIVING_FALLING_SPEED_THRESHOLD) { // only play the particle when falling speed is big enough
        this.playDivingSfx();
        this.rippleMesh && this.emitDivingRipple();
        this.divingLowerSplash && this.emitDivingLowerSplash();
        this.divingHigherSplash && this.emitDivingHigherSplash();
      }
    }
    else {
      this.fallingSpeed = 0;
    }
   
    // update particle
    this.rippleMesh.update();
    this.divingLowerSplash.update();
    this.divingHigherSplash.update();

    this.lastContactWater = this.contactWater;
    this.scene.updateMatrixWorld();
  }

  //########################################################## initialize particle mesh #####################################################
  initRipple() {
    this.rippleGroup = getDivingRipple(this.models.ripple);
    this.rippleMesh = this.rippleGroup.children[0].children[0];
    this.rippleMesh.material.uniforms.rippleTexture.value = this.textures.rippleTexture;
    this.rippleMesh.material.uniforms.voronoiNoiseTexture.value = this.textures.voronoiNoiseTexture;
    this.rippleMesh.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.rippleMesh.update = () => this.updateDivingRipple();
    this.scene.add(this.rippleGroup);
  }
  initDivingLowerSplash() {
    this.divingLowerSplash = getDivingLowerSplash();
    this.divingLowerSplash.material.uniforms.splashTexture.value = this.textures.splashTexture2;
    this.divingLowerSplash.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.divingLowerSplash.update = () => this.updateDivingLowerSplash();
    this.scene.add(this.divingLowerSplash);
  }
  initDivingHigherSplash() {
    this.divingHigherSplash = getDivingHigherSplash();
    this.divingHigherSplash.material.uniforms.splashTexture.value = this.textures.splashTexture3;
    this.divingHigherSplash.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.divingHigherSplash.update = () => this.updateDivingHigherSplash();
    this.scene.add(this.divingHigherSplash);
  }

  //########################################################## update function of particle mesh #####################################################
  updateDivingRipple() {
    if (this.rippleMesh) {
      const falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed; // clamp fallingSpeed from 0 to 10
      const distortionRate = 1.025;
      const distortionThreshold = 0.15 * (1 + falling * 0.1);
      const scaleRate = 0.007 * (1 + falling * 0.1); //increase scale based on fallind speed
      const animationSpeed = 0.015;
      if (this.rippleMesh.material.uniforms.vBroken.value < MAX_DISTORTION_RANGE) {
        if (this.rippleMesh.scale.x > distortionThreshold) {
          this.rippleMesh.material.uniforms.vBroken.value *= distortionRate;
        }
        this.rippleMesh.scale.x += scaleRate;
        this.rippleMesh.scale.z += scaleRate;
        this.rippleMesh.material.uniforms.uTime.value += animationSpeed;
      }
      else {
        this.rippleMesh.visible = false;
      }
    }
  }

  updateDivingLowerSplash() {
    if (this.divingLowerSplash) { 
      const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
      const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
      const particleCount = this.divingLowerSplash.info.particleCount;
      const initScale = 0.6;
      const scaleThreshold = 2.1;
      const distortionRate = 0.015;
      const scaleRate = 0.2;
      for (let i = 0; i < particleCount; i ++) {
        if (scalesAttribute.getX(i) >= initScale && scalesAttribute.getX(i) < scaleThreshold) {
          scalesAttribute.setX(i, scalesAttribute.getX(i) + scaleRate);
        }
        else if (scalesAttribute.getX(i) >= scaleThreshold) {
          if (brokenAttribute.getX(i) < MAX_DISTORTION_RANGE) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) + distortionRate);
            positionsAttribute.setXYZ(  
              i, 
              positionsAttribute.getX(i) + this.divingLowerSplash.info.velocity[i].x,
              positionsAttribute.getY(i) + this.divingLowerSplash.info.velocity[i].y,
              positionsAttribute.getZ(i) + this.divingLowerSplash.info.velocity[i].z
            );
            this.divingLowerSplash.info.velocity[i].add(this.divingLowerSplash.info.acc);
          }
        }
      }
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      this.divingLowerSplash.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
      this.divingLowerSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
  }

  updateDivingHigherSplash() {
    if (this.divingHigherSplash) { 
      const brokenAttribute = this.divingHigherSplash.geometry.getAttribute('broken');
      const positionsAttribute = this.divingHigherSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.divingHigherSplash.geometry.getAttribute('scales');
      const rotationAttribute = this.divingHigherSplash.geometry.getAttribute('rotation');
      const particleCount = this.divingHigherSplash.info.particleCount;
      const distortionRate = 1.03;
      const scaleRate = 0.02;
      const ascendingSpeed = 0.08;
      const positionThreshold = this.divingCollisionPos.y - 0.7;
      for (let i = 0; i < particleCount; i ++) {
        if (brokenAttribute.getX(i) < MAX_DISTORTION_RANGE) {
          if (positionsAttribute.getY(i) >= positionThreshold) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) * distortionRate);
            scalesAttribute.setX(i, scalesAttribute.getX(i) + scaleRate);
            positionsAttribute.setY(i, positionsAttribute.getY(i) + this.divingHigherSplash.info.velocity[i]);
            this.divingHigherSplash.info.velocity[i] += this.divingHigherSplash.info.acc;
          }
          else {
            positionsAttribute.setY(i, positionsAttribute.getY(i) + ascendingSpeed);
          } 
        }
      }
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      rotationAttribute.needsUpdate = true;
      this.divingHigherSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
  }
}

export default WaterParticleEffect;
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
    this.rippleMesh.material.uniforms.vBroken.value = 0.1;
    this.rippleMesh.scale.set(0.25, 1, 0.25);
    this.rippleMesh.material.uniforms.uTime.value = 120;
  }

  emitDivingLowerSplash() {
    const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
    const textureRotationAttribute = this.divingLowerSplash.geometry.getAttribute('textureRotation');
    const particleCount = this.divingLowerSplash.info.particleCount;
    for (let i = 0; i < particleCount; i ++) {
      this.divingLowerSplash.info.velocity[i].x = Math.sin(i) * .055 + (Math.random() - 0.5) * 0.001;
      this.divingLowerSplash.info.velocity[i].y = 0.12 + 0.01 * Math.random();
      this.divingLowerSplash.info.velocity[i].z = Math.cos(i) * .055 + (Math.random() - 0.5) * 0.001;
      positionsAttribute.setXYZ(  
        i, 
        this.divingCollisionPos.x + this.divingLowerSplash.info.velocity[i].x,
        this.divingCollisionPos.y + 0.1 * Math.random(),
        this.divingCollisionPos.z + this.divingLowerSplash.info.velocity[i].z
      );
      this.divingLowerSplash.info.velocity[i].divideScalar(5);
      const scale = 0.6; 
      scalesAttribute.setX(i, scale);
      textureRotationAttribute.setX(i, Math.random() * 2);
      brokenAttribute.setX(i, 0.2);
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
      this.divingHigherSplash.info.velocity[i].y = 0.08 + 0.035 * Math.random();
      brokenAttribute.setX(i, 0.2 + Math.random() * 0.1);
      scalesAttribute.setX(i, 0.5 + Math.random() * 0.5);
      const theta = 2. * Math.PI * i / particleCount;
      positionsAttribute.setXYZ(
        i,
        this.divingCollisionPos.x + Math.sin(theta) * 0.03,
        this.divingCollisionPos.y - 1.5,
        this.divingCollisionPos.z + Math.cos(theta) * 0.03
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
      if (this.fallingSpeed > 1) {
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
      const falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed;
      const distortionRate = 1.025;
      if (this.rippleMesh.material.uniforms.vBroken.value < 1) {
        if (this.rippleMesh.scale.x > 0.15 * (1 + falling * 0.1)) {
          this.rippleMesh.material.uniforms.vBroken.value *= distortionRate;
        }
        this.rippleMesh.scale.x += 0.007 * (1 + falling * 0.1);
        this.rippleMesh.scale.z += 0.007 * (1 + falling * 0.1);
        this.rippleMesh.material.uniforms.uTime.value += 0.015;
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
      for (let i = 0; i < particleCount; i ++) {
        if (scalesAttribute.getX(i) >= 0.6 && scalesAttribute.getX(i) < 2.1) {
          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.2);
        }
        if (scalesAttribute.getX(i) >= 2.1) {
          if (brokenAttribute.getX(i) < 1) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) + 0.015);
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
      for (let i = 0; i < particleCount; i ++) {
        if (brokenAttribute.getX(i) < 1) {
          if (positionsAttribute.getY(i) >= this.divingCollisionPos.y - 0.7 && scalesAttribute.getX(i) > 0) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) * 1.03);
            scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.02);
            positionsAttribute.setY(i, positionsAttribute.getY(i) + this.divingHigherSplash.info.velocity[i].y);
            this.divingHigherSplash.info.velocity[i].add(this.divingHigherSplash.info.acc);
          }
          else {
            positionsAttribute.setY(i, positionsAttribute.getY(i) + 0.08);
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
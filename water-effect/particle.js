import metaversefile from 'metaversefile';
import * as THREE from 'three';
import {
  getDivingRipple,
  getDivingLowerSplash,
  getDivingHigherSplash,
  getDroplet,
} from './mesh.js';

const {useSound, useInternals} = metaversefile;
const sounds = useSound();
const soundFiles = sounds.getSoundFiles();

// constants
const regex = new RegExp('^water/jump_water[0-9]*.wav$');
const candidateAudios = soundFiles.water.filter((f) => regex.test(f.name));

class WaterParticleEffect {
  constructor() {
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

    this.dropletgroup = null;
    this.droplet = null;
    this.dropletRipple = null;
    this.initDroplet();
  }

  playDivingSfx() {
    const audioSpec = candidateAudios[Math.floor(Math.random() * candidateAudios.length)];
    sounds.playSound(audioSpec);
  }

  playDivingRipple() {
    this.rippleMesh.visible = true;
    this.rippleGroup.position.copy(this.divingCollisionPos);
    this.rippleMesh.material.uniforms.vBroken.value = 0.1;
    this.rippleMesh.scale.set(0.25, 1, 0.25);
    this.rippleMesh.material.uniforms.uTime.value = 120;
  }

  updateDivingRipple() {
    if (this.rippleMesh) {
      const falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed;
      if (this.rippleMesh.material.uniforms.vBroken.value < 1) {
        if (this.rippleMesh.scale.x > 0.15 * (1 + falling * 0.1)) {
          this.rippleMesh.material.uniforms.vBroken.value *= 1.025;
        }
        this.rippleMesh.scale.x += 0.007 * (1 + falling * 0.1);
        this.rippleMesh.scale.z += 0.007 * (1 + falling * 0.1);
        this.rippleMesh.material.uniforms.uTime.value += 0.015;
      }
      else {
        this.rippleMesh.visible = false;
      }
    }
    else {
      if (this.rippleGroup.children.length > 0) {
        if (this.rippleGroup.children[0].children.length > 0) {
          this.rippleMesh = this.rippleGroup.children[0].children[0];
        }
      }
    }
  }

  playDivingLowerSplash() {
    const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
    const textureRotationAttribute = this.divingLowerSplash.geometry.getAttribute('textureRotation');
    const particleCount = this.divingLowerSplash.info.particleCount;
    for (let i = 0; i < particleCount; i++) {
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
      scalesAttribute.setX(i, 0.6);
      textureRotationAttribute.setX(i, Math.random() * 2);
      brokenAttribute.setX(i, 0.2);
    }
    brokenAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    textureRotationAttribute.needsUpdate = true;
  }

  updateDivingLowerSplash() {
    if (this.divingLowerSplash) { 
      const brokenAttribute = this.divingLowerSplash.geometry.getAttribute('broken');
      const positionsAttribute = this.divingLowerSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.divingLowerSplash.geometry.getAttribute('scales');
      const particleCount = this.divingLowerSplash.info.particleCount;
      for (let i = 0; i < particleCount; i++) {
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

  playDivingHigherSplash() {
    const brokenAttribute = this.divingHigherSplash.geometry.getAttribute('broken');
    const positionsAttribute = this.divingHigherSplash.geometry.getAttribute('positions');
    const scalesAttribute = this.divingHigherSplash.geometry.getAttribute('scales');
    const rotationAttribute = this.divingHigherSplash.geometry.getAttribute('rotation');
    const particleCount = this.divingHigherSplash.info.particleCount;
    
    for (let i = 0; i < particleCount; i++) {
      if (this.fallingSpeed > 3) {
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
    }
    brokenAttribute.needsUpdate = true;
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    rotationAttribute.needsUpdate = true;
  }

  updateDivingHigherSplash() {
    if (this.divingHigherSplash) { 
      const brokenAttribute = this.divingHigherSplash.geometry.getAttribute('broken');
      const positionsAttribute = this.divingHigherSplash.geometry.getAttribute('positions');
      const scalesAttribute = this.divingHigherSplash.geometry.getAttribute('scales');
      const rotationAttribute = this.divingHigherSplash.geometry.getAttribute('rotation');
      const particleCount = this.divingHigherSplash.info.particleCount;
      
      for (let i = 0; i < particleCount; i++) {
        if (positionsAttribute.getY(i) >= this.divingCollisionPos.y - 0.7 && scalesAttribute.getX(i) > 0) {
          if (brokenAttribute.getX(i) < 1) {
            brokenAttribute.setX(i, brokenAttribute.getX(i) * 1.03);
          }
          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.02);
          positionsAttribute.setY(i, positionsAttribute.getY(i) + this.divingHigherSplash.info.velocity[i].y);
          this.divingHigherSplash.info.velocity[i].add(this.divingHigherSplash.info.acc);
        }
        else {
          positionsAttribute.setY(i, positionsAttribute.getY(i) + 0.08);
        } 
      }
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;
      rotationAttribute.needsUpdate = true;
      this.divingHigherSplash.material.uniforms.waterSurfacePos.value = this.waterSurfaceHeight;
    }
  }

  playDroplet() {
    const positionsAttribute = this.droplet.geometry.getAttribute('positions');
    const scalesAttribute = this.droplet.geometry.getAttribute('scales');
    const particleCount = this.droplet.info.particleCount;
    let falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed;
    let dropletNum = particleCount * (falling / 10);
    dropletNum /= 3;
    falling = falling < 5 ? 7 : falling;
    for (let i = 0; i < particleCount; i++) {
      let rand = Math.random();
      scalesAttribute.setX(i, rand);
      positionsAttribute.setXYZ(i, 0, 0, 0);
      
      this.droplet.info.velocity[i].x = (Math.random() - 0.5) * 1 * (falling / 10);
      this.droplet.info.velocity[i].y = Math.random() * 1.4 * (falling / 10);
      this.droplet.info.velocity[i].z = (Math.random() - 0.5) * 1 * (falling / 10);
      this.droplet.info.velocity[i].divideScalar(20);
      
      this.droplet.info.alreadyHaveRipple[i] = false;

      if (i > dropletNum) {
        scalesAttribute.setX(i, 0.001);
      }
      this.droplet.info.offset[i] = Math.floor(Math.random() * 29);
      this.droplet.info.startTime[i] = 0;
    }
    this.dropletgroup.position.copy(this.divingCollisionPos);
    positionsAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
  }

  updateDroplet(timestamp) {
    if (this.droplet && this.dropletRipple) { 
      const rippleBrokenAttribute = this.dropletRipple.geometry.getAttribute('broken');
      const rippleWaveFreqAttribute = this.dropletRipple.geometry.getAttribute('waveFreq');
      const ripplePositionsAttribute = this.dropletRipple.geometry.getAttribute('positions');
      const rippleScalesAttribute = this.dropletRipple.geometry.getAttribute('scales');
      
      const offsetAttribute = this.droplet.geometry.getAttribute('offset');
      const positionsAttribute = this.droplet.geometry.getAttribute('positions');
      const scalesAttribute = this.droplet.geometry.getAttribute('scales');
      const particleCount = this.droplet.info.particleCount;
      for (let i = 0; i < particleCount; i++) {
        if (positionsAttribute.getY(i) > -10) {
          this.droplet.info.velocity[i].add(this.droplet.info.acc);
          scalesAttribute.setX(i, scalesAttribute.getX(i) / 1.035);
          positionsAttribute.setXYZ(
            i,
            positionsAttribute.getX(i) + this.droplet.info.velocity[i].x,
            positionsAttribute.getY(i) + this.droplet.info.velocity[i].y,
            positionsAttribute.getZ(i) + this.droplet.info.velocity[i].z
          )
          this.droplet.info.startTime[i] = this.droplet.info.startTime[i] + 1;
          if (this.droplet.info.startTime[i] % 2 === 0)
            this.droplet.info.offset[i] += 1;
          if (this.droplet.info.offset[i] >= 30) {
            this.droplet.info.offset[i] = 0;
          }
          offsetAttribute.setXY(i, (5 / 6) - Math.floor(this.droplet.info.offset[i] / 6) * (1. / 6.), Math.floor(this.droplet.info.offset[i] % 5) * 0.2);
        }
        if (positionsAttribute.getY(i) < 0 && !this.droplet.info.alreadyHaveRipple[i] && scalesAttribute.getX(i) > 0.001) {
          scalesAttribute.setX(i, 0.0001);
          ripplePositionsAttribute.setXYZ(i, positionsAttribute.getX(i), 0.01, positionsAttribute.getZ(i));
          rippleScalesAttribute.setX(i, Math.random() * 0.2);
          rippleWaveFreqAttribute.setX(i, Math.random() * (i % 10));
          rippleBrokenAttribute.setX(i, Math.random() - 0.8);
          this.droplet.info.alreadyHaveRipple[i] = true;
        }
        rippleScalesAttribute.setX(i, rippleScalesAttribute.getX(i) + 0.02);
        if (rippleBrokenAttribute.getX(i) < 1) {
          rippleBrokenAttribute.setX(i, rippleBrokenAttribute.getX(i) + 0.02);
        }
      }
      offsetAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      scalesAttribute.needsUpdate = true;

      ripplePositionsAttribute.needsUpdate = true;
      rippleScalesAttribute.needsUpdate = true;
      rippleBrokenAttribute.needsUpdate = true;
      rippleWaveFreqAttribute.needsUpdate = true;

      this.dropletRipple.material.uniforms.uTime.value = timestamp / 1000;
      
      this.droplet.material.uniforms.cameraBillboardQuaternion.value.copy(this.camera.quaternion);
    }
  }

  update() {
    if (!this.player) {
      return;
    }
    const timestamp = performance.now();
    // diving water
    if (this.contactWater && this.lastContactWater !== this.contactWater) {
      this.fallingSpeed = 0 - this.player.characterPhysics.velocity.y;
      this.divingCollisionPos.set(this.player.position.x, this.waterSurfaceHeight, this.player.position.z);

      // play the diving particle
      if (this.fallingSpeed > 1) {
        this.playDivingSfx();
        this.rippleMesh && this.playDivingRipple();
        this.divingLowerSplash && this.playDivingLowerSplash();
        this.divingHigherSplash && this.playDivingHigherSplash();
        this.droplet && this.dropletRipple && this.playDroplet();
      }
    }
    else {
      this.fallingSpeed = null;
    }
    
    
    // update particle
    this.updateDivingRipple();
    this.updateDivingLowerSplash();
    this.updateDivingHigherSplash();
    this.updateDroplet(timestamp);
    
    this.lastContactWater = this.contactWater;
    this.scene.updateMatrixWorld();
    
  }

  //########################################################## initialize particle mesh #####################################################
  initRipple() {
    this.rippleGroup = getDivingRipple();
    this.scene.add(this.rippleGroup);
  }
  initDivingLowerSplash() {
    this.divingLowerSplash = getDivingLowerSplash();
    this.scene.add(this.divingLowerSplash);
  }
  initDivingHigherSplash() {
    this.divingHigherSplash = getDivingHigherSplash();
    this.scene.add(this.divingHigherSplash);
  }
  initDroplet() {
    this.dropletgroup = getDroplet();
    this.droplet = this.dropletgroup.children[0];
    this.dropletRipple = this.dropletgroup.children[1];
    this.scene.add(this.dropletgroup);
  }
}

export default WaterParticleEffect;
import metaversefile from 'metaversefile';
import * as THREE from 'three';
import {
  getDivingRipple,
  getDivingLowerSplash,
  getDivingHigherSplash,
  getDroplet,
  getMovingRipple,
  getMovingSplash,
  getFreestyleSplash,
  getBubble,
  getBodyDrop,
} from './mesh.js';

const {useSound, useInternals} = metaversefile;
const sounds = useSound();
const soundFiles = sounds.getSoundFiles();

// constants
const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const regex = new RegExp('^water/jump_water[0-9]*.wav$');
const divingCandidateAudios = soundFiles.water.filter((f) => regex.test(f.name));
const MAX_DISTORTION_RANGE = 1;
const DIVING_FALLING_SPEED_THRESHOLD = 1;

class WaterParticleEffect {
  constructor(textures, models, mirrorInvisibleList) {
    this.mirrorInvisibleList = mirrorInvisibleList;
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

    this.dropletgroup = null;
    this.droplet = null;
    this.dropletRipple = null;
    this.initDroplet();

    this.movingRipple = null;
    this.lastStaticTime = 0;
    this.initMovingRipple();
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

  emitDroplet() {
    const positionsAttribute = this.droplet.geometry.getAttribute('positions');
    const scalesAttribute = this.droplet.geometry.getAttribute('scales');
    const particleCount = this.droplet.info.particleCount;
    let falling = this.fallingSpeed > 10 ? 10 : this.fallingSpeed;
    let dropletNum = particleCount * (falling / 10);
    dropletNum /= 3;
    falling = falling < 5 ? 7 : falling;
    for (let i = 0; i < particleCount; i ++) {
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

  emitMovingRipple(timestamp) {
    if (this.currentSpeed < 0.1) {
      return;
    }
    
    const particleCount = this.movingRipple.info.particleCount;
    const brokenAttribute = this.movingRipple.geometry.getAttribute('broken');
    const positionsAttribute = this.movingRipple.geometry.getAttribute('positions');
    const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
    const playerRotationAttribute = this.movingRipple.geometry.getAttribute('playerRotation');
    const randAttribute = this.movingRipple.geometry.getAttribute('random');

    const emitThreshold = 170 * Math.pow((1.1 - this.currentSpeed), 0.3);

    if (timestamp - this.movingRipple.info.lastEmmitTime > emitThreshold) {
      const particleRot = this.player.rotation.x !== 0 ?  Math.PI + this.player.rotation.y : -this.player.rotation.y;
      playerRotationAttribute.setX(this.movingRipple.info.currentCircleRipple, particleRot);
      
      // play circle ripple
      brokenAttribute.setX(this.movingRipple.info.currentCircleRipple, 0.03 * Math.random());
      scalesAttribute.setX(this.movingRipple.info.currentCircleRipple, 1.5 + Math.random() * 0.1);
      positionsAttribute.setXYZ(
        this.movingRipple.info.currentCircleRipple,
        this.player.position.x + 0.25 * this.playerDir.x + (Math.random() - 0.5) * 0.1, 
        this.waterSurfaceHeight + 0.01, 
        this.player.position.z + 0.25 * this.playerDir.z + (Math.random() - 0.5) * 0.1
      );
      
      // if speed > 0.3, play broken ripple
      if (this.currentSpeed > 0.3) {
        brokenAttribute.setX(this.movingRipple.info.currentBrokenRipple, 0.1 + 0.2 * Math.random());
        scalesAttribute.setX(this.movingRipple.info.currentBrokenRipple, 1.1 + Math.random() * 0.5);
        positionsAttribute.setXYZ(
          this.movingRipple.info.currentBrokenRipple,
          this.player.position.x - 0.25 * this.playerDir.x + (Math.random() - 0.5) * 0.25, 
          this.waterSurfaceHeight + 0.01, 
          this.player.position.z - 0.25 * this.playerDir.z + (Math.random() - 0.5) * 0.25
        );
        
      }
      else {
        scalesAttribute.setX(this.movingRipple.info.currentBrokenRipple, 0);
      }

      randAttribute.setX(this.movingRipple.info.currentCircleRipple, Math.random());
      randAttribute.setX(this.movingRipple.info.currentBrokenRipple, Math.random());
      this.movingRipple.info.currentCircleRipple ++;
      this.movingRipple.info.currentBrokenRipple ++;
      this.movingRipple.info.lastEmmitTime = timestamp;

      // reset index
      const lastIndexOfCircleRipple = (particleCount - 1) / 2;
      if(this.movingRipple.info.currentCircleRipple >= lastIndexOfCircleRipple){
        this.movingRipple.info.currentCircleRipple = 0;
      }
      if(this.movingRipple.info.currentBrokenRipple >= particleCount - 1){
        this.movingRipple.info.currentBrokenRipple = lastIndexOfCircleRipple;
      }
    }
    
    positionsAttribute.needsUpdate = true;
    randAttribute.needsUpdate = true;
    scalesAttribute.needsUpdate = true;
    brokenAttribute.needsUpdate = true;
    playerRotationAttribute.needsUpdate = true;  
  }

  enableStaticRipple() {
    const indexOfStaticRipple = this.movingRipple.info.particleCount - 1;
    const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
    if (scalesAttribute.getX(indexOfStaticRipple) < 3.5) {
      scalesAttribute.setX(indexOfStaticRipple, 3.5);
      this.movingRipple.material.uniforms.op.value = 0.1;
    }
    scalesAttribute.needsUpdate = true;
  }

  disableStaticRipple() {
    const indexOfStaticRipple = this.movingRipple.info.particleCount - 1;
    const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
    scalesAttribute.setX(indexOfStaticRipple, 0.0);
    scalesAttribute.needsUpdate = true;
  }

  update(timestamp) {
    if (!this.player && !this.player.avatar) {
      return;
    }
    const swimAction = this.player.getAction('swim');
    const hasSwim = !!swimAction;

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
        this.dropletgroup && this.emitDroplet();
      }
    }
    else {
      this.fallingSpeed = 0;
    }

    //#################################### handle moving in water ####################################
    // get player moving speed
    this.currentSpeed = localVector.set(this.player.avatar.velocity.x, 0, this.player.avatar.velocity.z).length();
    this.currentSpeed *= 0.1;
    
    // get player direction 
    localVector2.set(0, 0, -1);
    this.playerDir = localVector2.applyQuaternion(this.player.quaternion);
    this.playerDir.normalize();

    const swimmingAboveSurface = hasSwim && this.waterSurfaceHeight < this.player.position.y - 0.1;
    if (hasSwim) {
      if (swimmingAboveSurface) {
        this.movingRipple && this.emitMovingRipple(timestamp);
        // this.movingSplash && this.handleSwimmingSplash(timestamp, swimAction.animationType);
      }
      // this.bubble && this.playBubble(timestamp);
    }
    else {
      // const walkingInDeepWater = this.waterSurfaceHeight > this.player.position.y - this.player.avatar.height * 0.5;
      // if (this.contactWater) {
      //   if (walkingInDeepWater) {
      //     this.movingRipple && this.emitMovingRipple(timestamp);
      //   }
      //   else {
      //     this.handleWalkingSplash();
      //   }
      // }
    }

    //#################################### handle stop moving in water ####################################
    this.lastStaticTime = (this.currentSpeed > 0.1 || this.fallingSpeed > 1) ? timestamp : this.lastStaticTime;
    if (timestamp - this.lastStaticTime > 1500 && swimmingAboveSurface) {
      this.movingRipple && this.enableStaticRipple();
    }
    else {
      this.movingRipple && this.disableStaticRipple();
    }
   
    // update particle
    this.rippleMesh.update();
    this.divingLowerSplash.update();
    this.divingHigherSplash.update();
    this.dropletgroup.update(timestamp);
    this.movingRipple.update(timestamp);

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
    this.mirrorInvisibleList.push(this.rippleGroup);
  }
  initDivingLowerSplash() {
    this.divingLowerSplash = getDivingLowerSplash();
    this.divingLowerSplash.material.uniforms.splashTexture.value = this.textures.splashTexture2;
    this.divingLowerSplash.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.divingLowerSplash.update = () => this.updateDivingLowerSplash();
    this.scene.add(this.divingLowerSplash);
    this.mirrorInvisibleList.push(this.divingLowerSplash);
  }
  initDivingHigherSplash() {
    this.divingHigherSplash = getDivingHigherSplash();
    this.divingHigherSplash.material.uniforms.splashTexture.value = this.textures.splashTexture3;
    this.divingHigherSplash.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.divingHigherSplash.update = () => this.updateDivingHigherSplash();
    this.scene.add(this.divingHigherSplash);
    this.mirrorInvisibleList.push(this.divingHigherSplash);
  }

  initDroplet() {
    this.dropletgroup = getDroplet();
    this.droplet = this.dropletgroup.children[0];
    this.droplet.material.uniforms.bubbleTexture1.value = this.textures.bubbleTexture;
    this.dropletRipple = this.dropletgroup.children[1];
    this.dropletRipple.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.dropletgroup.update = (timestamp) => this.updateDroplet(timestamp);
    this.scene.add(this.dropletgroup);
    this.mirrorInvisibleList.push(this.dropletgroup);
  }

  initMovingRipple() {
    this.movingRipple = getMovingRipple();
    this.movingRipple.material.uniforms.noiseMap2.value = this.textures.noiseMap2;
    this.movingRipple.material.uniforms.noiseMap.value = this.textures.noiseMap;
    this.movingRipple.material.uniforms.noiseCircleTexture.value = this.textures.noiseCircleTexture;
    this.movingRipple.material.uniforms.splashTexture2.value = this.textures.splashTexture2;
    this.movingRipple.material.uniforms.voronoiNoiseTexture.value = this.textures.voronoiNoiseTexture;
    this.movingRipple.update = (timestamp) => this.updateMovingRipple(timestamp);
    this.scene.add(this.movingRipple);
    this.mirrorInvisibleList.push(this.movingRipple);
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
  updateDroplet(timestamp) {
    if (this.dropletgroup) { 
      const rippleBrokenAttribute = this.dropletRipple.geometry.getAttribute('broken');
      const rippleWaveFreqAttribute = this.dropletRipple.geometry.getAttribute('waveFreq');
      const ripplePositionsAttribute = this.dropletRipple.geometry.getAttribute('positions');
      const rippleScalesAttribute = this.dropletRipple.geometry.getAttribute('scales');
      
      const offsetAttribute = this.droplet.geometry.getAttribute('offset');
      const positionsAttribute = this.droplet.geometry.getAttribute('positions');
      const scalesAttribute = this.droplet.geometry.getAttribute('scales');
      const particleCount = this.droplet.info.particleCount;
      for (let i = 0; i < particleCount; i ++) {
        if (positionsAttribute.getY(i) >= this.waterSurfaceHeight) {
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
        else {
          if (!this.droplet.info.alreadyHaveRipple[i] && scalesAttribute.getX(i) > 0.001) {
            scalesAttribute.setX(i, 0.0001);
            ripplePositionsAttribute.setXYZ(i, positionsAttribute.getX(i), 0.01, positionsAttribute.getZ(i));
            rippleScalesAttribute.setX(i, Math.random() * 0.2);
            rippleWaveFreqAttribute.setX(i, Math.random() * (i % 10));
            rippleBrokenAttribute.setX(i, Math.random() - 0.8);
            this.droplet.info.alreadyHaveRipple[i] = true;
          }
        }
        
        if (rippleBrokenAttribute.getX(i) < 1) {
          rippleScalesAttribute.setX(i, rippleScalesAttribute.getX(i) + 0.02);
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

  updateMovingRipple(timestamp) {
    if (this.movingRipple) {
      const particleCount = this.movingRipple.info.particleCount;
      const brokenAttribute = this.movingRipple.geometry.getAttribute('broken');
      const scalesAttribute = this.movingRipple.geometry.getAttribute('scales');
      const positionsAttribute = this.movingRipple.geometry.getAttribute('positions');
      
      for (let i = 0; i < particleCount - 1; i++) {
        if (brokenAttribute.getX(i) < 1) {
          scalesAttribute.setX(i, scalesAttribute.getX(i) + 0.1 * (this.currentSpeed + 0.3));
          brokenAttribute.setX(i, brokenAttribute.getX(i) + 0.01);
        }
      }
      // for static ripple
      positionsAttribute.setXYZ(
        particleCount - 1,
        this.player.position.x + 0.1 * this.playerDir.x, 
        this.waterSurfaceHeight + 0.01, 
        this.player.position.z + 0.1 * this.playerDir.z
      );
      if (this.movingRipple.material.uniforms.op.value < 1.) {
        this.movingRipple.material.uniforms.op.value += 0.01;
      }
  
      scalesAttribute.needsUpdate = true;
      brokenAttribute.needsUpdate = true;
      positionsAttribute.needsUpdate = true;
      this.movingRipple.material.uniforms.uTime.value = timestamp / 1000;
    }  
  }
}

export default WaterParticleEffect;
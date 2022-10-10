import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {bufferSize, WORLD_BASE_HEIGHT, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT} from '../constants.js';
import WaterParticleEffect from '../water-particle/particle.js';
import _createWaterMaterial from './water-material.js';

const {useProcGenManager, useGeometryBuffering, useLocalPlayer, useInternals} = metaversefile;
const {BufferedMesh, GeometryAllocator} = useGeometryBuffering();
const procGenManager = useProcGenManager();

const mirrorInvisibleList = [];
const particleEffect = new WaterParticleEffect(mirrorInvisibleList);
const fakeMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});
const {renderer, camera, scene} = useInternals();

//
const localVector3D = new THREE.Vector3();
const localVector3D2 = new THREE.Vector3();
const localBox = new THREE.Box3();
const localQuaternion = new THREE.Quaternion();
const localVector = new THREE.Vector3();
//

export class WaterMesh extends BufferedMesh {
  constructor({
    instance,
    gpuTaskManager,
    physics
  }) {
    const allocator = new GeometryAllocator(
      [
        {
          name: 'position',
          Type: Float32Array,
          itemSize: 3,
        },
        {
          name: 'normal',
          Type: Float32Array,
          itemSize: 3,
        },
        {
          name: 'factor',
          Type: Float32Array,
          itemSize: 1,
        },
      ],
      {
        bufferSize,
        boundingType: 'box',
        // hasOcclusionCulling: true
      }
    );

    const {geometry} = allocator;
    
    const material = _createWaterMaterial();

    super(geometry, material);
    
    this.instance = instance;
    this.gpuTaskManager = gpuTaskManager;

    this.allocator = allocator;
    this.gpuTasks = new Map();
    this.geometryBindings = new Map();

    this.physics = physics;
    this.physicsObjectsMap = new Map();
    this.chunkPhysicObjcetMap = new Map();
    this.waterHeightMap = new Map();
    this.lastUpdateCoord = new THREE.Vector2();

    this.lastSwimmingHand = null;
    this.swimDamping = 1;


    // for depth 
    const pixelRatio = renderer.getPixelRatio();
    this.depthRenderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth * pixelRatio,
      window.innerHeight * pixelRatio
    );
    this.depthRenderTarget.texture.minFilter = THREE.NearestFilter;
    this.depthRenderTarget.texture.magFilter = THREE.NearestFilter;
    this.depthRenderTarget.texture.generateMipmaps = false;
    this.depthRenderTarget.stencilBuffer = false;

    this.depthMaterial = new THREE.MeshDepthMaterial();
    this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
    this.depthMaterial.blending = THREE.NoBlending;


    // for reflection
    this.eye = new THREE.Vector3(0, 0, 0);
    this.reflectorPlane = new THREE.Plane();
    this.normal = new THREE.Vector3();
    this.reflectorWorldPosition = new THREE.Vector3();
    this.cameraWorldPosition = new THREE.Vector3();
    this.rotationMatrix = new THREE.Matrix4();
    this.lookAtPosition = new THREE.Vector3(0, 0, -1);
    this.clipPlane = new THREE.Vector4();

    this.view = new THREE.Vector3();
    this.target = new THREE.Vector3();
		this.q = new THREE.Vector4();

    this.textureMatrix = new THREE.Matrix4();
    this.virtualCamera = new THREE.PerspectiveCamera();

    const parameters = {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			stencilBuffer: false,
		};
    this.mirrorRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio, parameters);
    
    this.setMaterialTexture();
  }
  addChunk(chunk, chunkResult) {
    const key = procGenManager.getNodeHash(chunk);
    const task = this.gpuTaskManager.transact(() => {
      const _mapOffsettedIndices = (
        srcIndices,
        dstIndices,
        dstOffset,
        positionOffset
      ) => {
        const positionIndex = positionOffset / 3;
        for (let i = 0; i < srcIndices.length; i++) {
          dstIndices[dstOffset + i] = srcIndices[i] + positionIndex;
        }
      };
      const _renderWaterMeshDataToGeometry = (
        waterGeometry,
        geometry,
        geometryBinding
      ) => {
        let positionOffset = geometryBinding.getAttributeOffset('position');
        let normalOffset = geometryBinding.getAttributeOffset('normal');
        let factorOffset = geometryBinding.getAttributeOffset('factor');
        let indexOffset = geometryBinding.getIndexOffset();

        _mapOffsettedIndices(
          waterGeometry.indices,
          geometry.index.array,
          indexOffset,
          positionOffset
        );

        geometry.attributes.position.update(
          positionOffset,
          waterGeometry.positions.length,
          waterGeometry.positions,
          0
        );
        geometry.attributes.normal.update(
          normalOffset,
          waterGeometry.normals.length,
          waterGeometry.normals,
          0
        );
        geometry.attributes.factor.update(
          factorOffset,
          waterGeometry.factors.length,
          waterGeometry.factors,
          0
        );
        geometry.index.update(indexOffset, waterGeometry.indices.length);
      };
      const _handleWaterMesh = waterGeometry => {
        const {chunkSize} = this.instance;

        const boundingBox = localBox.set(
          localVector3D.set(
            chunk.min.x * chunkSize,
            -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
            chunk.min.y * chunkSize
          ),
          localVector3D2.set(
            (chunk.min.x + chunk.lod) * chunkSize,
            -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
            (chunk.min.y + chunk.lod) * chunkSize
          )
        );
        /* localSphere.center.set(
            (chunk.min.x + 0.5) * chunkSize,
            (chunk.min.y + 0.5) * chunkSize,
            (chunk.min.z + 0.5) * chunkSize
          )
          .applyMatrix4(this.matrixWorld);
        localSphere.radius = chunkRadius; */

        // const min = localVector3D.set(chunk.min.x, chunk.min.y, chunk.min.z)
        //   .multiplyScalar(chunkSize);
        // const max = localVector3D2.set(chunk.min.x, chunk.min.y, chunk.min.z)
        //   .addScalar(chunk.lod)
        //   .multiplyScalar(chunkSize);

        // console.log(localVector3D.x + ", " + localVector3D2.x);

        const geometryBinding = this.allocator.alloc(
          waterGeometry.positions.length,
          waterGeometry.indices.length,
          boundingBox,
          // min,
          // max,
          // this.appMatrix,
          // waterGeometry.peeks
        );
        // console.log(localVector3D);
        _renderWaterMeshDataToGeometry(
          waterGeometry,
          this.allocator.geometry,
          geometryBinding
        );

        this.geometryBindings.set(key, geometryBinding);
        
      };
      const waterGeometry = chunkResult.waterGeometry
      _handleWaterMesh(waterGeometry);

      const _handlePhysics = async () => {
        const physicsGeo = new THREE.BufferGeometry();
        physicsGeo.setAttribute(
          'position',
          new THREE.BufferAttribute(waterGeometry.positions, 3)
        );
        physicsGeo.setIndex(
          new THREE.BufferAttribute(waterGeometry.indices, 1)
        );
        const physicsMesh = new THREE.Mesh(physicsGeo, fakeMaterial);
        
        const geometryBuffer = await this.physics.cookGeometryAsync(physicsMesh);

        if (geometryBuffer && geometryBuffer.length !== 0) {
          this.matrixWorld.decompose(
            localVector3D,
            localQuaternion,
            localVector3D2
          );
          const physicsObject = this.physics.addCookedGeometry(
            geometryBuffer,
            localVector3D,
            localQuaternion,
            localVector3D2
          );
          this.physics.disableGeometryQueries(physicsObject); // disable each physicsObject
          this.physicsObjectsMap.set(key, physicsObject);
          const chunkKey = chunk.min.x + ',' + chunk.min.y;
          this.chunkPhysicObjcetMap.set(chunkKey, physicsObject); // use string of chunk.min as a key to map each physicsObject
          this.waterHeightMap.set(chunkKey, waterGeometry.positions[1]); // use string of chunk.min as a key to map the posY of each chunk
        }
      };
      if (waterGeometry.indices.length !== 0) {
        _handlePhysics();
      } 
    });
    this.gpuTasks.set(key, task);
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);

    {
      // console.log('chunk remove', key, chunk.min.toArray().join(','));
      const geometryBinding = this.geometryBindings.get(key);
      if (geometryBinding) {
        /* if (!geometryBinding) {
          debugger;
        } */
        this.allocator.free(geometryBinding);
        this.geometryBindings.delete(key);
      }
    }
    {
      const physicsObject = this.physicsObjectsMap.get(key);

      if (physicsObject) {
        this.physics.removeGeometry(physicsObject);
        this.physicsObjectsMap.delete(key);
      }
    }
    {
      const chunkKey = chunk.min.x + ',' + chunk.min.y;
      this.chunkPhysicObjcetMap.delete(chunkKey);
      this.waterHeightMap.delete(chunkKey);
    }
    {
      const task = this.gpuTasks.get(key);
      task.cancel();
      this.gpuTasks.delete(key);
    }
  }
  checkWaterContact(chunkPhysicObject, player, waterSurfaceHeight) {
    // use overlapBox to check whether player contact the water
    this.physics.enableGeometryQueries(chunkPhysicObject);
    if (player.avatar) {
      let collisionIds;
      const height = player.avatar.height * 0.9;
      const width = player.avatar.shoulderWidth
      if (player.position.y > waterSurfaceHeight) {
        collisionIds = this.physics.overlapBox(width, height, width, player.position, player.quaternion).objectIds;
      }
      else {
        localVector.set(player.position.x, waterSurfaceHeight, player.position.z);
        collisionIds = this.physics.overlapBox(width, height, width, localVector, player.quaternion).objectIds;
      } 
      for (const collisionId of collisionIds) {
        if (collisionId === chunkPhysicObject.physicsId) {
          this.physics.disableGeometryQueries(chunkPhysicObject);
          return true;
        }
      }
    }
    this.physics.disableGeometryQueries(chunkPhysicObject);
    return false;
  }
  getSwimDamping(player) {
    if (this.lastSwimmingHand !== player.avatarCharacterSfx.currentSwimmingHand) {
      this.lastSwimmingHand = player.avatarCharacterSfx.currentSwimmingHand;
      if (player.avatarCharacterSfx.currentSwimmingHand !== null) {
        return 1;
      }
    }
    if (this.swimDamping < 4.2 && this.lastSwimmingHand) {
      return this.swimDamping *= 1.03;
    }
    else {
      return 4.2;
    }
  }
  handleSwimAction(contactWater, player, waterSurfaceHeight) {
    const swimAction = player.getAction('swim');
    const hasSwim = !!swimAction;
    if (contactWater) {
      // this.material.color.setHex( 0x78c7e3 ); // for testing
      if (waterSurfaceHeight >= player.position.y - player.avatar.height + player.avatar.height * 0.75) { // if water is higher than player's neck
        if (!hasSwim) {
          const swimAction = {
              type: 'swim',
              onSurface: false,
              swimDamping: 1,
              animationType: 'breaststroke'
          };
          player.setControlAction(swimAction);
        }
        // check whether player is swimming on the water surface
        if (waterSurfaceHeight < player.position.y - player.avatar.height + player.avatar.height * 0.8) {
          if (hasSwim && !swimAction.onSurface) {
            swimAction.onSurface = true;
          }
        }
        else {
          if (hasSwim && swimAction.onSurface) {
            swimAction.onSurface = false;
          }
        }
      }
      else{ // shallow water
          if (hasSwim) {
            player.removeAction('swim');
          }
      }  
    } 
    else {
      // this.material.color.setHex( 0xff0000 ); // for testing
      if (hasSwim) {
        player.removeAction('swim');
      }
    }

    // handel swimming damping.
    if (hasSwim) {
      if (swimAction.animationType === 'breaststroke') {
        this.swimDamping = this.getSwimDamping(player);
      }
      else {
        this.swimDamping = 1;
      }
      swimAction.swimDamping = this.swimDamping;
    }   
  }
  updateParticle(contactWater, localPlayer, waterSurfaceHeight) {
    particleEffect.update();
    particleEffect.contactWater = contactWater;
    particleEffect.player = localPlayer;
    particleEffect.waterSurfaceHeight = waterSurfaceHeight;
  };
  renderDepthTexture(){
    renderer.setRenderTarget(this.depthRenderTarget);
    renderer.clear();
    this.visible = false;
    scene.overrideMaterial = this.depthMaterial;

    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    scene.overrideMaterial = null;
    this.visible = true;
  }
  renderMirror(renderer, scene, camera) {
    this.reflectorWorldPosition.setFromMatrixPosition(this.matrixWorld);
    this.cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    this.rotationMatrix.extractRotation(this.matrixWorld);

    this.normal.set(0, 1, 0);
    this.normal.applyMatrix4(this.rotationMatrix);

    this.view.subVectors(this.reflectorWorldPosition, this.cameraWorldPosition);

    // Avoid rendering when mirror is facing away

    if (this.view.dot(this.normal) > 0) return;

    this.view.reflect(this.normal).negate();
    this.view.add(this.reflectorWorldPosition);

    this.rotationMatrix.extractRotation(camera.matrixWorld);

    this.lookAtPosition.set(0, 0, -1);
    this.lookAtPosition.applyMatrix4(this.rotationMatrix);
    this.lookAtPosition.add(this.cameraWorldPosition);

    this.target.subVectors(this.reflectorWorldPosition, this.lookAtPosition);
    this.target.reflect(this.normal).negate();
    this.target.add(this.reflectorWorldPosition);

    this.virtualCamera.position.copy(this.view);
    this.virtualCamera.up.set(0, 1, 0);
    this.virtualCamera.up.applyMatrix4(this.rotationMatrix);
    this.virtualCamera.up.reflect(this.normal);
    this.virtualCamera.lookAt(this.target);

    this.virtualCamera.far = camera.far; // Used in WebGLBackground

    this.virtualCamera.updateMatrixWorld();
    this.virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    // Update the texture matrix
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.textureMatrix.multiply(this.virtualCamera.projectionMatrix);
    this.textureMatrix.multiply(this.virtualCamera.matrixWorldInverse);
    this.textureMatrix.multiply(this.matrixWorld);


    // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
    // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
    this.reflectorPlane.setFromNormalAndCoplanarPoint(this.normal, this.reflectorWorldPosition);
    this.reflectorPlane.applyMatrix4(this.virtualCamera.matrixWorldInverse);

    this.clipPlane.set(
      this.reflectorPlane.normal.x,
      this.reflectorPlane.normal.y,
      this.reflectorPlane.normal.z,
      this.reflectorPlane.constant
    );

    const projectionMatrix = this.virtualCamera.projectionMatrix;

    this.q.x =
      (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) /
      projectionMatrix.elements[0];
    this.q.y =
      (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) /
      projectionMatrix.elements[5];
    this.q.z = -1.0;
    this.q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

    // Calculate the scaled plane vector
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(this.q));

    // Replacing the third row of the projection matrix
    const clipBias = 0.00001;
    projectionMatrix.elements[2] = this.clipPlane.x;
    projectionMatrix.elements[6] = this.clipPlane.y;
    projectionMatrix.elements[10] = this.clipPlane.z + 1.0 - clipBias;
    projectionMatrix.elements[14] = this.clipPlane.w;

    this.eye.setFromMatrixPosition(camera.matrixWorld);
    
    // Render

    // this.mirrorRenderTarget.texture.encoding = renderer.outputEncoding;
    for (const l of mirrorInvisibleList) {
      l.visible = false;
    }
    this.visible = false;

    const currentRenderTarget = renderer.getRenderTarget();

    const currentXrEnabled = renderer.xr.enabled;
    const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

    renderer.xr.enabled = false; // Avoid camera modification and recursion
    renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

    renderer.setRenderTarget(this.mirrorRenderTarget);

    renderer.state.buffers.depth.setMask(true); // make sure the depth buffer is writable so it can be properly cleared, see #18897
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, this.virtualCamera);

    renderer.xr.enabled = currentXrEnabled;
    renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

    renderer.setRenderTarget(currentRenderTarget);

    // Restore viewport

    const viewport = camera.viewport;

    if (viewport !== undefined) {
      renderer.state.viewport(viewport);
    }

    this.visible = true;
    for (const l of mirrorInvisibleList) {
      l.visible = true;
    }
  }
  onBeforeRender(renderer, scene, camera) {
    this.renderDepthTexture();
    this.renderMirror(renderer, scene, camera);
  }
  
  setMaterialTexture() {
    this.material.uniforms.mirror.value = this.mirrorRenderTarget.texture;
    this.material.uniforms.textureMatrix.value = this.textureMatrix;
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    this.material.uniforms.resolution.value.set(
        window.innerWidth * window.devicePixelRatio,
        window.innerHeight * window.devicePixelRatio
    );
    this.material.uniforms.tDepth.value = this.depthRenderTarget.texture;
    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
    const material = new THREE.MeshBasicMaterial( {color: 0xff0000} );
    const cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
  }
  update() {
    const localPlayer = useLocalPlayer();
    const lastUpdateCoordKey = this.lastUpdateCoord.x + ',' + this.lastUpdateCoord.y; 
    const currentChunkPhysicObject = this.chunkPhysicObjcetMap.get(lastUpdateCoordKey); // use lodTracker.lastUpdateCoord as a key to check which chunk player currently at 

    // handel water physic and swimming action if we get the physicObject of the current chunk
    if (currentChunkPhysicObject) { 
      const currentWaterSurfaceHeight = this.waterHeightMap.get(lastUpdateCoordKey); // use lodTracker.lastUpdateCoord as a key to check the water height of the current chunk
      const contactWater = this.checkWaterContact(currentChunkPhysicObject, localPlayer, currentWaterSurfaceHeight); // check whether player contact the water

      // handle swimming action
      this.handleSwimAction(contactWater, localPlayer, currentWaterSurfaceHeight);

      // handle particle
      // this.updateParticle(contactWater, localPlayer, currentWaterSurfaceHeight + 0.01)
    }
    this.material.uniforms.uTime.value = performance.now() / 1000;
  }
  
  
}
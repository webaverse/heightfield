import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {bufferSize, WORLD_BASE_HEIGHT, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT} from '../constants.js';
import WaterParticleEffect from '../water-particle/particle.js';
import _createWaterMaterial from './water-material.js';

const {useProcGenManager, useGeometryBuffering, useLocalPlayer, useRenderSettings, useInternals} = metaversefile;
const {BufferedMesh, GeometryAllocator} = useGeometryBuffering();
const procGenManager = useProcGenManager();

const particleEffect = new WaterParticleEffect();
const fakeMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
});
const renderSettings = useRenderSettings();
const {renderer, camera, scene, rootScene} = useInternals();
//

const localVector3D = new THREE.Vector3();
const localVector3D2 = new THREE.Vector3();
const localBox = new THREE.Box3();
const localQuaternion = new THREE.Quaternion();
const localVector = new THREE.Vector3();

//

const pixelRatio = renderer.getPixelRatio();
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * pixelRatio,
  window.innerHeight * pixelRatio
);
renderTarget.texture.minFilter = THREE.NearestFilter;
renderTarget.texture.magFilter = THREE.NearestFilter;
renderTarget.texture.generateMipmaps = false;
renderTarget.stencilBuffer = false;

const depthMaterial = new THREE.MeshDepthMaterial();
depthMaterial.depthPacking = THREE.RGBADepthPacking;
depthMaterial.blending = THREE.NoBlending;

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
    
    this.setMaterialDepthTexture();

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
      this.updateParticle(contactWater, localPlayer, currentWaterSurfaceHeight + 0.01)
    }
  }
  renderDepthTexture(){
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    this.visible = false;
    scene.overrideMaterial = depthMaterial;

    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    scene.overrideMaterial = null;
    this.visible = true;
  }
  setMaterialDepthTexture() {
    if (renderSettings.findRenderSettings(scene)) {
      for (const pass of renderSettings.findRenderSettings(scene).passes) {
        if (pass.constructor.name === 'WebaverseRenderPass') {
          pass.onBeforeRender = () => {
            this.renderDepthTexture(); 
          };
          this.material.uniforms.cameraNear.value = camera.near;
          this.material.uniforms.cameraFar.value = camera.far;
          this.material.uniforms.resolution.value.set(
              window.innerWidth * window.devicePixelRatio,
              window.innerHeight * window.devicePixelRatio
          );
          this.material.uniforms.tDepth.value = renderTarget.texture;
        }
      }
    }
  }
}
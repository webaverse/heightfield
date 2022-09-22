import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {
  bufferSize,
  WORLD_BASE_HEIGHT,
  MIN_WORLD_HEIGHT,
  MAX_WORLD_HEIGHT,
} from './constants.js';
import loadWaterMaterial from './water-material.js';

const {useProcGenManager, useGeometryBuffering, useLightsManager} = metaversefile;
const {BufferedMesh, GeometryAllocator} = useGeometryBuffering();
const procGenManager = useProcGenManager();
const lightsManager = useLightsManager();

//

const localVector3D = new THREE.Vector3();
const localVector3D2 = new THREE.Vector3();
const localBox = new THREE.Box3();

//

export class WaterMesh extends BufferedMesh {
  constructor({instance, gpuTaskManager}) {
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

    // loading the material
    (async () => {
      const material = await loadWaterMaterial();
      this.material = material;
    })();

    // const material = new THREE.MeshNormalMaterial();
    super(geometry);

    this.instance = instance;
    this.gpuTaskManager = gpuTaskManager;

    this.allocator = allocator;
    this.gpuTasks = new Map();
    this.geometryBindings = new Map();

    //
    this.time = 0.0;
    this.eye = new THREE.Vector3(0, 0, 0);
    this.sunTracker = lightsManager.lightTrackers.filter(
      (tracker) => tracker.children[0].type === 'DirectionalLight'
    )?.[0];

    this.mirrorWorldPosition = new THREE.Vector3();
    this.mirrorPlane = new THREE.Plane();
    this.normal = new THREE.Vector3();
    this.mirrorWorldPosition = new THREE.Vector3();
    this.cameraWorldPosition = new THREE.Vector3();
    this.rotationMatrix = new THREE.Matrix4();
    this.lookAtPosition = new THREE.Vector3(0, 0, -1);
    this.clipPlane = new THREE.Vector4();
    this.view = new THREE.Vector3();
    this.textureMatrix = new THREE.Matrix4();
    this.mirrorCamera = new THREE.PerspectiveCamera();
    this.renderTarget = new THREE.WebGLRenderTarget(512, 512);
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
      const _handleWaterMesh = (waterGeometry) => {
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
          boundingBox
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
      _handleWaterMesh(chunkResult.waterGeometry);

      /* const _handlePhysics = async () => {
        if (geometryBuffer) {
          this.matrixWorld.decompose(localVector, localQuaternion, localVector2);
          const physicsObject = this.physics.addCookedGeometry(
            geometryBuffer,
            localVector,
            localQuaternion,
            localVector2
          );
          this.physicsObjects.push(physicsObject);
          this.physicsObjectToChunkMap.set(physicsObject, chunk);

          const onchunkremove = () => {
            this.physics.removeGeometry(physicsObject);

            const index = this.physicsObjects.indexOf(physicsObject);
            this.physicsObjects.splice(index, 1);
            this.physicsObjectToChunkMap.delete(physicsObject);

            tracker.offChunkRemove(chunk, onchunkremove);
          };
          tracker.onChunkRemove(chunk, onchunkremove);
        }
      };
      _handlePhysics(); */
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
      const task = this.gpuTasks.get(key);
      task.cancel();
      this.gpuTasks.delete(key);
    }
  }

  update() {
    this.time += 0.01;
    if (this.time < 3) return;

    // this.material.uniforms['mirrorSampler'].value = this.renderTarget.texture;
    this.material.uniforms['textureMatrix'].value = this.textureMatrix;
    this.material.uniforms['time'].value = this.time;
    // this.material.uniforms['sunDirection'].value = this.sunTracker.position.normalize();
    this.material.uniforms['eye'].value = this.eye;
  }

  onBeforeRender(renderer, scene, camera) {
    this.mirrorWorldPosition.setFromMatrixPosition(this.matrixWorld);
    this.cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    this.rotationMatrix.extractRotation(this.matrixWorld);

    this.normal.set(0, 0, 1);
    this.normal.applyMatrix4(this.rotationMatrix);

    this.view.subVectors(this.mirrorWorldPosition, this.cameraWorldPosition);

    // Avoid rendering when mirror is facing away

    if (this.view.dot(this.normal) > 0) return;

    this.view.reflect(this.normal).negate();
    this.view.add(this.mirrorWorldPosition);

    this.rotationMatrix.extractRotation(camera.matrixWorld);

    this.lookAtPosition.set(0, 0, -1);
    this.lookAtPosition.applyMatrix4(this.rotationMatrix);
    this.lookAtPosition.add(this.cameraWorldPosition);

    const target = new THREE.Vector3();
    target.subVectors(this.mirrorWorldPosition, this.lookAtPosition);
    target.reflect(this.normal).negate();
    target.add(this.mirrorWorldPosition);

    this.mirrorCamera.position.copy(this.view);
    this.mirrorCamera.up.set(0, 1, 0);
    this.mirrorCamera.up.applyMatrix4(this.rotationMatrix);
    this.mirrorCamera.up.reflect(this.normal);
    this.mirrorCamera.lookAt(target);

    this.mirrorCamera.far = camera.far; // Used in WebGLBackground

    this.mirrorCamera.updateMatrixWorld();
    this.mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

    // Update the texture matrix
    this.textureMatrix.set(
      0.5,
      0.0,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.0,
      0.5,
      0.5,
      0.0,
      0.0,
      0.0,
      1.0
    );
    this.textureMatrix.multiply(this.mirrorCamera.projectionMatrix);
    this.textureMatrix.multiply(this.mirrorCamera.matrixWorldInverse);

    // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
    // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
    this.mirrorPlane.setFromNormalAndCoplanarPoint(this.normal, this.mirrorWorldPosition);
    this.mirrorPlane.applyMatrix4(this.mirrorCamera.matrixWorldInverse);

    this.clipPlane.set(
      this.mirrorPlane.normal.x,
      this.mirrorPlane.normal.y,
      this.mirrorPlane.normal.z,
      this.mirrorPlane.constant
    );

    const projectionMatrix = this.mirrorCamera.projectionMatrix;

    const q = new THREE.Vector4();
    q.x =
      (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) /
      projectionMatrix.elements[0];
    q.y =
      (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) /
      projectionMatrix.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

    // Calculate the scaled plane vector
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(q));

    // Replacing the third row of the projection matrix
    const clipBias = 0.0;
    projectionMatrix.elements[2] = this.clipPlane.x;
    projectionMatrix.elements[6] = this.clipPlane.y;
    projectionMatrix.elements[10] = this.clipPlane.z + 1.0 - clipBias;
    projectionMatrix.elements[14] = this.clipPlane.w;

    this.eye.setFromMatrixPosition(camera.matrixWorld);

    // Render

    const oldRenderTarget = renderer.getRenderTarget();
    const oldXrEnabled = renderer.xr.enabled;
    const oldShadowAutoUpdate = renderer.shadowMap.autoUpdate;

    this.visible = false;

    renderer.xr.enabled = false; // Avoid camera modification and recursion
    renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

    renderer.setRenderTarget(this.renderTarget);
    renderer.state.buffers.depth.setMask(true); // make sure the depth buffer is writable so it can be properly cleared, see #18897
    renderer.clear();

    renderer.render(scene, this.mirrorCamera);

    this.visible = true;

    renderer.xr.enabled = oldXrEnabled;
    renderer.shadowMap.autoUpdate = oldShadowAutoUpdate;
    renderer.setRenderTarget(oldRenderTarget);

    // Restore viewport

    const viewport = camera.viewport;

    if (viewport !== undefined) {
      renderer.state.viewport(viewport);
    }
  }
}

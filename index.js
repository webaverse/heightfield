import metaversefile from 'metaversefile';
import * as THREE from 'three';
const { useApp, useFrame, useCamera, useLocalPlayer, usePhysics, useProcGenManager, useGPUTask, useGenerationTask } = metaversefile;
const { GPUTaskManager } = useGPUTask();
const { GenerationTaskManager } = useGenerationTask();

import { TerrainMesh } from './layers/terrain-mesh.js';
import { WaterMesh } from './layers/water-mesh.js';
// import {BarrierMesh} from './layers/barrier-mesh.js';
import { glbUrlSpecs } from './assets.js';
import { GrassMesh } from './layers/grass-mesh.js';
import { HudMesh } from './layers/hud-mesh.js';
import { InstancedObjectMesh } from './layers/instanced-object-mesh.js';
import { TerrainObjectsMesh, TerrainObjectSpecs } from './meshes/terrain-objects-mesh.js';

// urls
const treeUrls = glbUrlSpecs.trees.slice(0, 1);
const bushUrls = glbUrlSpecs.bushes.slice(0, 1);
const rockUrls = glbUrlSpecs.rocks.slice(0, 1);
const stoneUrls = glbUrlSpecs.stones.slice(0, 1);
const grassUrls = glbUrlSpecs.grasses;
const hudUrls = glbUrlSpecs.huds;

// locals

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();

export default e => {
  const app = useApp();
  const camera = useCamera();
  const procGenManager = useProcGenManager();
  const physics = usePhysics();

  // locals

  let frameCb = null;

  // initialization

  e.waitUntil((async () => {
    const instance = procGenManager.getInstance('lol');

    // lod tracker
    const MIN_LOD = 1;
    const MAX_LOD = 7;
    const LOD_1_RANGE = 2;

    const lodTracker = await instance.createLodChunkTracker({
      minLod: MIN_LOD,
      maxLod: MAX_LOD,
      lod1Range: LOD_1_RANGE,
      // debug: true,
    });
    // app.add(lodTracker.debugMesh);
    // lodTracker.debugMesh.position.y = 0.1;
    // lodTracker.debugMesh.updateMatrixWorld();

    lodTracker.onPostUpdate(position => {
      // barrierMesh.updateChunk(position);
    });

    // managers
    const gpuTaskManager = new GPUTaskManager();
    const generationTaskManager = new GenerationTaskManager();

    // meshes
    const terrainMesh = new TerrainMesh({
      instance,
      gpuTaskManager,
      physics,
    });
    terrainMesh.frustumCulled = false;
    // terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;
    app.add(terrainMesh);
    terrainMesh.updateMatrixWorld();

    const waterMesh = new WaterMesh({
      instance,
      gpuTaskManager,
      physics,
    });
    waterMesh.frustumCulled = false;
    app.add(waterMesh);
    waterMesh.updateMatrixWorld();

    /* const barrierMesh = new BarrierMesh({
      instance,
      gpuTaskManager,
    });
    barrierMesh.frustumCulled = false;
    app.add(barrierMesh);
    barrierMesh.updateMatrixWorld(); */

    const OBJECTS_SPECS_ARRAY = [
      new TerrainObjectSpecs(InstancedObjectMesh, treeUrls),
      new TerrainObjectSpecs(InstancedObjectMesh, bushUrls),
      new TerrainObjectSpecs(InstancedObjectMesh, rockUrls),
      new TerrainObjectSpecs(InstancedObjectMesh, stoneUrls),
      new TerrainObjectSpecs(GrassMesh, grassUrls),
      new TerrainObjectSpecs(HudMesh, hudUrls),
    ];

    const terrainObjects = new TerrainObjectsMesh(instance, physics, OBJECTS_SPECS_ARRAY);
    app.add(terrainObjects);
    terrainObjects.updateMatrixWorld();

    // chunk handling
    // genration events handling
    lodTracker.onChunkAdd(async chunk => {
      const key = procGenManager.getNodeHash(chunk);

      const generation = generationTaskManager.createGeneration(key);
      generation.addEventListener('geometryadd', e => {
        const { result } = e.data;
        const { heightfield } = result;
        const { treeInstances, bushInstances, rockInstances, stoneInstances, grassInstances, poiInstances } = heightfield;

        // remove replaced chunks before adding the new one 
        // lodTracker.cleanupReplacedChunks(chunk);

        // heightfield
        terrainMesh.addChunk(chunk, heightfield, lodTracker);
        waterMesh.addChunk(chunk, heightfield);
        // barrierMesh.addChunk(chunk, heightfield);

        const terrainObjectInstances = [
          treeInstances,
          bushInstances,
          rockInstances,
          stoneInstances,
          grassInstances,
          poiInstances,
        ];

        terrainObjects.addChunks(chunk, terrainObjectInstances);
      });

      generation.addEventListener('geometryremove', e => {
        // heightfield
        terrainMesh.removeChunk(chunk);
        waterMesh.removeChunk(chunk);
        // barrierMesh.removeChunk(chunk);

        terrainObjects.removeChunks(chunk);
      });

      try {
        const signal = generation.getSignal();
        const generateFlags = {
          terrain: true,
          water: true,
          barrier: false,
          vegetation: true,
          rock: true,
          grass: true,
          poi: false,
        };
        const numVegetationInstances = treeUrls.length;
        const numRockInstances = rockUrls.length;
        const numGrassInstances = grassUrls.length;
        const numPoiInstances = hudUrls.length;
        const options = {
          signal,
        };
        const heightfield = await instance.generateChunk(
          chunk.min,
          chunk.lod,
          chunk.lodArray,
          generateFlags,
          numVegetationInstances,
          numRockInstances,
          numGrassInstances,
          numPoiInstances,
          options
        );

        generation.finish({
          heightfield,
        });

      } catch (err) {
        lodTracker.cleanupReplacedChunks(chunk);

        if (err.isAbortError) {
          // canceled
        } else {
          throw err;
        }
      }
    });
    lodTracker.onChunkRemove(chunk => {
      const key = procGenManager.getNodeHash(chunk);
      // console.log('chunk', key, chunk, 'REMOVE');
      generationTaskManager.deleteGeneration(key);
    });

    // load
    const _waitForLoad = async () => {
      await Promise.all([
        terrainMesh.waitForLoad(),
        terrainObjects.waitForLoad()
      ]);
    };
    await _waitForLoad();

    // ? Debugging 
    setInterval(() => {
      console.log('Leaked : ', lodTracker.replacedNodes.size);
    }, 3000);

    // frame handling
    frameCb = () => {
      const _updateLodTracker = () => {
        const localPlayer = useLocalPlayer();

        const appMatrixWorldInverse = localMatrix2.copy(app.matrixWorld)
          .invert();
        localMatrix
          .copy(localPlayer.matrixWorld)
          .premultiply(appMatrixWorldInverse)
          .decompose(localVector, localQuaternion, localVector2);
        const playerPosition = localVector;

        localMatrix
          .copy(camera.matrixWorld)
          .premultiply(appMatrixWorldInverse)
          .decompose(localVector2, localQuaternion, localVector3);
        const cameraPosition = localVector2;
        const cameraQuaternion = localQuaternion;

        instance.setCamera(
          playerPosition,
          cameraPosition,
          cameraQuaternion,
          camera.projectionMatrix
        );
        lodTracker.update(playerPosition);
      };
      _updateLodTracker();

      const _updateTerrainObjects = () => {
        terrainObjects.update();
      }
      _updateTerrainObjects();

      const _updateWaterMesh = () => {
        waterMesh.update();
        waterMesh.lastUpdateCoord.set(lodTracker.lastUpdateCoord.x, lodTracker.lastUpdateCoord.y);
      };
      _updateWaterMesh();

      gpuTaskManager.update();
    };
  })());

  useFrame(() => {
    frameCb && frameCb();
  });

  return app;
};
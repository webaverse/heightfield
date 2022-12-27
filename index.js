import metaversefile from "metaversefile";
import * as THREE from "three";

import {TerrainMesh} from "./layers/terrain-mesh.js";
import {LiquidMesh} from "./layers/liquid-mesh.js";
// import {BarrierMesh} from './layers/barrier-mesh.js';
import {glbUrlSpecs} from "./assets.js";
import {GrassMesh} from "./layers/grass-mesh.js";
import {HudMesh} from "./layers/hud-mesh.js";
import {InstancedObjectGroup, InstancedObjectMesh} from "./layers/instanced-object-mesh.js";

import {
  TerrainObjectsMesh,
  TerrainObjectSpecs
} from "./meshes/terrain-objects-mesh.js";
import {_addNoLightingShaderChunk} from "./utils/utils.js";

import { EnvironmentalVfx } from "./environmental-vfx/index.js";

const {
  useApp,
  useFrame,
  useCamera,
  useLocalPlayer,
  usePhysics,
  useProcGenManager,
  useGPUTask,
  useGenerationTask,
} = metaversefile;

const {GPUTaskManager} = useGPUTask();
const {GenerationTaskManager} = useGenerationTask();

// urls
const treeUrls = glbUrlSpecs.trees;
const flowerUrls = glbUrlSpecs.flowers;
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
  let envVFX = false;
  let environmentalVfx = null;
  for (const component of app.components) {
    switch (component.key) {
      case 'envVFX': {
        envVFX = component.value.enable;
        break;
      }
      default: {
        break;
      }
    }
  }

  // initialization

  e.waitUntil(
    (async () => {
      const instance = procGenManager.getInstance("lol");

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

      // material setup
      _addNoLightingShaderChunk();

      // meshes
      const terrainMesh = new TerrainMesh({
        instance,
        gpuTaskManager,
        physics,
      });
      terrainMesh.frustumCulled = false;
      // ! terrainMesh.castShadow = true;
      terrainMesh.receiveShadow = true;
      app.add(terrainMesh);
      terrainMesh.updateMatrixWorld();

      

      /* const barrierMesh = new BarrierMesh({
        instance,
        gpuTaskManager,
      });
      barrierMesh.frustumCulled = false;
      app.add(barrierMesh);
      barrierMesh.updateMatrixWorld(); */

      const TERRAIN_OBJECTS_MESHES = {
        treeMesh: new TerrainObjectSpecs(InstancedObjectGroup, treeUrls, true, 'tree', true),
        flowerMesh: new TerrainObjectSpecs(InstancedObjectGroup, flowerUrls, true, 'flower'),
        bushMesh: new TerrainObjectSpecs(InstancedObjectMesh, bushUrls, true, 'bush', true),
        rockMesh: new TerrainObjectSpecs(InstancedObjectMesh, rockUrls, true, 'rock'),
        stoneMesh: new TerrainObjectSpecs(
          InstancedObjectMesh,
          stoneUrls,
          false,
          'stone'
        ),
        grassMesh: new TerrainObjectSpecs(GrassMesh, grassUrls, true, 'grass'),
        hudMesh: new TerrainObjectSpecs(HudMesh, hudUrls, false, 'hud'),
      };

      const terrainObjects = new TerrainObjectsMesh(
        instance,
        physics,
        TERRAIN_OBJECTS_MESHES,
      );
      app.add(terrainObjects);
      terrainObjects.updateMatrixWorld();

      
      
      const liquidMesh = new LiquidMesh({
        instance,
        gpuTaskManager,
        physics,
      });
      liquidMesh.frustumCulled = false;
      app.add(liquidMesh);
      liquidMesh.depthInvisibleList.push(terrainObjects);
      liquidMesh.updateMatrixWorld();

      if (envVFX) {
        environmentalVfx = new EnvironmentalVfx(app);
      }
      
      
      // genration events handling
      lodTracker.onChunkAdd(async chunk => {
        const key = procGenManager.getNodeHash(chunk);

        const generation = generationTaskManager.createGeneration(key);
        generation.addEventListener("geometryadd", e => {
          const {result} = e.data;
          const {heightfield} = result;
          const {
            treeInstances,
            flowerInstances,
            bushInstances,
            rockInstances,
            stoneInstances,
            grassInstances,
            poiInstances,
          } = heightfield;

          // console.log('got heightfield', heightfield);

          // heightfield
          terrainMesh.addChunk(chunk, heightfield, lodTracker);
          liquidMesh.addChunk(chunk, heightfield);
          // barrierMesh.addChunk(chunk, heightfield);

          const terrainObjectInstances = {
            treeMesh: treeInstances,
            flowerMesh: flowerInstances,
            bushMesh: bushInstances,
            rockMesh: rockInstances,
            stoneMesh: stoneInstances,
            grassMesh: grassInstances,
            hudMesh: poiInstances,
          };
          terrainObjects.addChunks(chunk, terrainObjectInstances);
        });
        generation.addEventListener("geometryremove", e => {
          // heightfield
          terrainMesh.removeChunk(chunk);
          liquidMesh.removeChunk(chunk);
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
          const numVegetationInstances = 1;
          const numRockInstances = 1;
          const numGrassInstances = 1;
          const numPoiInstances = 1;
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
            options,
          );
          generation.finish({
            heightfield,
          });
        } catch (err) {
          if (err.isAbortError) {
            lodTracker.cleanupReplacedChunks(chunk);
            // console.log('got chunk add abort', chunk);
          } else {
            throw err;
          }
        } /* finally {
        generations.delete(key);
      } */
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
          terrainObjects.waitForLoad(),
          liquidMesh.waitForLoad(),
        ]);
      };
      await _waitForLoad();

      // frame handling
      frameCb = (timestamp) => {
        const _updateLodTracker = () => {
          const localPlayer = useLocalPlayer();

          const appMatrixWorldInverse = localMatrix2
            .copy(app.matrixWorld)
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
            camera.projectionMatrix,
          );
          lodTracker.update(playerPosition);
        };
        _updateLodTracker();

        const _updateTerrainObjects = () => {
          terrainObjects.update(timestamp);
        };
        _updateTerrainObjects();

        const _updateLiquidMesh = () => {
          liquidMesh.update(timestamp);
          liquidMesh.lastUpdateCoord.set(
            lodTracker.lastUpdateCoord.x,
            lodTracker.lastUpdateCoord.y,
          );
        };
        _updateLiquidMesh();
        environmentalVfx && environmentalVfx.update(timestamp);

        gpuTaskManager.update();
      };
    })(),
  );

  useFrame(({timestamp}) => {
    frameCb && frameCb(timestamp);
  });

  return app;
};
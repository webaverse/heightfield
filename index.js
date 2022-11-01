import * as THREE from 'three';
import metaversefile from 'metaversefile';
const { useApp, useFrame, useCamera, useLocalPlayer, usePhysics, useProcGenManager, useGPUTask, useGenerationTask, useCleanup } = metaversefile;
const { GPUTaskManager } = useGPUTask();
const { GenerationTaskManager } = useGenerationTask();

import { TerrainMesh } from './layers/terrain-mesh.js';
import { WaterMesh } from './layers/water-mesh.js';
// import {BarrierMesh} from './layers/barrier-mesh.js';
import { LitterMetaMesh } from './layers/litter-mesh.js';
import { GrassMesh } from './layers/grass-mesh.js';
import { HudMesh, hudUrls } from './layers/hud-mesh.js';

import { glbUrlSpecs } from './assets.js';
import { makeWindow } from './window.js';

// locals

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();

// main

export default e => {
  const app = useApp();
  const camera = useCamera();
  const procGenManager = useProcGenManager();
  
  const physics = usePhysics();

  // keep track of whether the app is enabled
  // the app should not consume any memory when disabled
  let appEnabled = false;

  // get reference to copies of the default specs
  // 
  const grasses = [...glbUrlSpecs.grasses];
  const vegetation = [...glbUrlSpecs.vegetation];
  const ores = [...glbUrlSpecs.ores];
  const litter = [...glbUrlSpecs.vegetation.slice(0, 1)
    .concat(glbUrlSpecs.ores.slice(0, 1))];
  
  const destroyApp = () => {
    if (appEnabled) {
      console.log('destroying app');
      appEnabled = false;
    }
  }
  
  const regenerateApp = () => {
    console.log('regenerating app');
    destroyApp(app);
    createApp(app);
  }
  
  // initialization
  
  async function createApp() {
    if(appEnabled){
      return console.warn('App already enabled');
    }
    appEnabled = true;  
    let frameCb = null;
  
    e.waitUntil((async () => {
      const instance = procGenManager.getInstance('lol');
  
      // lod tracker
      const lodTracker = await instance.createLodChunkTracker({
        minLod: 1,
        maxLod: 7,
        lod1Range: 2,
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
      terrainMesh.castShadow = true;
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
  
      const litterMesh = new LitterMetaMesh({
        instance,
        // gpuTaskManager,
        physics,
        assets: litter
      });
      app.add(litterMesh);
      litterMesh.updateMatrixWorld();
  
      const grassMesh = new GrassMesh({
        instance,
        // gpuTaskManager,
        physics,
        assets: grasses
      });
      app.add(grassMesh);
      grassMesh.updateMatrixWorld();
  
      const hudMesh = new HudMesh({
        instance,
        gpuTaskManager,
        physics,
      });
      app.add(hudMesh);
      hudMesh.updateMatrixWorld();
  
      // genration events handling
      lodTracker.onChunkAdd(async chunk => {
        const key = procGenManager.getNodeHash(chunk);
  
        const generation = generationTaskManager.createGeneration(key);
        generation.addEventListener('geometryadd', e => {
          const { result } = e.data;
          const { heightfield } = result;
          const { vegetationInstances, grassInstances, poiInstances } = heightfield;
  
          // console.log('got heightfield', heightfield);
  
          // heightfield
          terrainMesh.addChunk(chunk, heightfield);
          waterMesh.addChunk(chunk, heightfield);
          // barrierMesh.addChunk(chunk, heightfield);
  
          // vegetation
          litterMesh.addChunk(chunk, vegetationInstances);
  
          // grass
          grassMesh.addChunk(chunk, grassInstances);
  
          // hud
          hudMesh.addChunk(chunk, poiInstances);
        });
        generation.addEventListener('geometryremove', e => {
          // heightfield
          terrainMesh.removeChunk(chunk);
          waterMesh.removeChunk(chunk);
          // barrierMesh.removeChunk(chunk);
  
          // vegetation
          litterMesh.removeChunk(chunk);
  
          // grass
          grassMesh.removeChunk(chunk);
  
          // hud
          hudMesh.removeChunk(chunk);
        });
  
        try {
          const signal = generation.getSignal();
          const generateFlags = {
            terrain: true,
            water: true,
            barrier: true,
            vegetation: true,
            grass: true,
            poi: true,
          };
          const numVegetationInstances = litter.length;
          const numGrassInstances = grasses.length;
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
            numGrassInstances,
            numPoiInstances,
            options
          );
          generation.finish({
            heightfield,
          });
        } catch (err) {
          if (err.isAbortError) {
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
          litterMesh.waitForLoad(),
          grassMesh.waitForLoad(),
          hudMesh.waitForLoad(),
        ]);
      };
      await _waitForLoad();
  
      // Add debug UI window for the world
      // This can be opened with shift+\
      makeWindow({
        grasses,
        vegetation,
        ores,
        litter,
        createAppCallback: () => createApp(),
        destroyAppCallback: () => destroyApp(),
        regenerateAppCallback: () => regenerateApp()
      });
  
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
  
        const _updateLitterMesh = () => {
          litterMesh.update(); // update spritesheet uniforms
        };
        _updateLitterMesh();
  
        const _updateHudMesh = () => {
          hudMesh.update(); // update icon uniforms
        };
        _updateHudMesh();
  
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
  
    useCleanup(() => {
      console.log('cleanup!')
      const procGenManager = useProcGenManager();
      const instance = procGenManager.getInstance('lol');
      console.log('instance is')
      console.log(instance);
    });
  }

  createApp();

  return app;
};
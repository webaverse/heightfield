import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useCamera, useProcGenManager, useGeometries, useAtlasing, useGeometryBatching, useGeometryChunking, useLoaders, usePhysics, useSpriting} = metaversefile;
const procGenManager = useProcGenManager();
const {createAppUrlSpriteSheet} = useSpriting();
const {DoubleSidedPlaneGeometry} = useGeometries();
const {createTextureAtlas} = useAtlasing();
const {InstancedBatchedMesh, InstancedGeometryAllocator} = useGeometryBatching();
const {ChunkedBatchedMesh, ChunkedGeometryAllocator} = useGeometryChunking();
const {gltfLoader} = useLoaders();
import {
  // bufferSize,
  WORLD_BASE_HEIGHT,
  MIN_WORLD_HEIGHT,
  MAX_WORLD_HEIGHT,
} from './constants.js';

//

const spriteLodCutoff = 16;

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
// const localQuaternion = new THREE.Quaternion();
const localEuler = new THREE.Euler();
// const localMatrix = new THREE.Matrix4();
const localBox = new THREE.Box3();

//

const meshLodSpecs = {
  1: {
    targetRatio: 1,
    targetError: 0,
  },
  2: {
    targetRatio: 0.5,
    targetError: 0.01,
  },
  4: {
    targetRatio: 0.3,
    targetError: 0.05,
  },
  8: {
    targetRatio: 0.15,
    targetError: 0.1,
  },
};
const meshLodSpecKeys = Object.keys(meshLodSpecs).map(Number);
class MeshPackage {
  constructor(lodMeshes, textureNames) {
    this.lodMeshes = lodMeshes;
    this.textureNames = textureNames;
  }
  static async loadUrls(urls, physics) {
    const _loadModel = u => new Promise((accept, reject) => {
      gltfLoader.load(u, o => {
        accept(o.scene);
      }, function onProgress() {}, reject);
    });
    const _getMesh = model => {
      let mesh = null;
      const _recurse = o => {
        if (o.isMesh) {
          mesh = o;
          return false;
        } else {
          for (let i = 0; i < o.children.length; i++) {
            if (!_recurse(o.children[i])) {
              return false;
            }
          }
          return true;
        }
      };
      _recurse(model);
      return mesh;
    };
    const _generateLodMeshes = async mesh => {
      const lodMeshes = await Promise.all(meshLodSpecKeys.map(async lod => {
        const meshLodSpec = meshLodSpecs[lod];
        const {targetRatio, targetError} = meshLodSpec;
        if (targetRatio === 1) {
          return mesh;
        } else {
          const lodMesh = await physics.meshoptSimplify(mesh, targetRatio, targetError);
          return lodMesh;
        }
      }));
      return lodMeshes;
    };
    

    const models = await Promise.all(urls.map(_loadModel));
    const meshes = models.map(_getMesh);
    const textureAtlasResult = createTextureAtlas(meshes, {
      textures: ['map', 'normalMap'],
      attributes: ['position', 'normal', 'uv'],
    });
    const {
      meshes: atlasMeshes,
      textureNames,
    } = textureAtlasResult;
    const lodMeshes = await Promise.all(atlasMeshes.map(_generateLodMeshes));
    
    const pkg = new MeshPackage(lodMeshes, textureNames);
    return pkg;
  }
}

//

const maxNumGeometries = 16;
const maxInstancesPerGeometryPerDrawCall = 256;
const maxDrawCallsPerGeometry = 256;
class LitterPolygonMesh extends InstancedBatchedMesh {
  constructor({
    instance,
    // procGenInstance,
    // lodMeshes = [],
    // shapeAddresses = [],
    // physicsGeometries = [],
    // physics = null,
  } = {}) {
    // allocator
    const allocator = new InstancedGeometryAllocator([
      {
        name: 'p',
        Type: Float32Array,
        itemSize: 3,
      },
      {
        name: 'q',
        Type: Float32Array,
        itemSize: 4,
      },
    ], {
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
      boundingType: 'box',
    });
    const {textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }

    // geometry
    // const geometry = new THREE.BufferGeometry();
    let geometry;

    // material
    const material = new THREE.MeshStandardMaterial({
      // map: atlasTextures.map,
      // normalMap: atlasTextures.normalMap,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
      onBeforeCompile: (shader) => {
        shader.uniforms.pTexture = {
          value: attributeTextures.p,
          needsUpdate: true,
        };
        shader.uniforms.qTexture = {
          value: attributeTextures.q,
          needsUpdate: true,
        };
        
        // vertex shader

        shader.vertexShader = shader.vertexShader.replace(`#include <uv_pars_vertex>`, `\
#undef USE_INSTANCING

#include <uv_pars_vertex>

uniform sampler2D pTexture;
uniform sampler2D qTexture;

vec3 rotate_vertex_position(vec3 position, vec4 q) { 
  return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
}
        `);
        shader.vertexShader = shader.vertexShader.replace(`#include <begin_vertex>`, `\
#include <begin_vertex>

int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;
const float width = ${attributeTextures.p.image.width.toFixed(8)};
const float height = ${attributeTextures.p.image.height.toFixed(8)};
float x = mod(float(instanceIndex), width);
float y = floor(float(instanceIndex) / width);
vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
vec3 p = texture2D(pTexture, pUv).xyz;
vec4 q = texture2D(qTexture, pUv).xyzw;

// instance offset
{
  transformed = rotate_vertex_position(transformed, q);
  transformed += p;
}
        `);
        shader.fragmentShader = shader.fragmentShader.replace(`#include <uv_pars_fragment>`, `\
#undef USE_INSTANCING

#if ( defined( USE_UV ) && ! defined( UVS_VERTEX_ONLY ) )
	varying vec2 vUv;
#endif
        `);

        // fragment shader
        
        return shader;
      },
    });

    // mesh
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;
    
    // this.procGenInstance = procGenInstance;
    // this.meshes = lodMeshes;
    // this.shapeAddresses = shapeAddresses;
    // this.physicsGeometries = physicsGeometries;
    // this.physics = physics;
    // this.physicsObjects = [];

    // this.instanceObjects = new Map();

    this.instance = instance;
    
    this.allocatedChunks = new Map();
  }

  addChunk(chunk, chunkResult) {
    const vegetationData = chunkResult;

    if (chunk.lod < spriteLodCutoff && vegetationData.instances.length > 0) {
      const _renderLitterPolygonGeometry = (drawCall, ps, qs) => {
        const pTexture = drawCall.getTexture('p');
        const pOffset = drawCall.getTextureOffset('p');
        const qTexture = drawCall.getTexture('q');
        const qOffset = drawCall.getTextureOffset('q');
        // const sTexture = drawCall.getTexture('s');
        // const sOffset = drawCall.getTextureOffset('s');

        let index = 0;
        for (let j = 0; j < ps.length; j += 3) {
          const indexOffset = index * 4;
          
          // geometry
          const px = ps[index * 3];
          const py = ps[index * 3 + 1];
          const pz = ps[index * 3 + 2];
          pTexture.image.data[pOffset + indexOffset] = px;
          pTexture.image.data[pOffset + indexOffset + 1] = py;
          pTexture.image.data[pOffset + indexOffset + 2] = pz;

          const qx = qs[index * 4];
          const qy = qs[index * 4 + 1];
          const qz = qs[index * 4 + 2];
          const qw = qs[index * 4 + 3];
          qTexture.image.data[qOffset + indexOffset] = qx;
          qTexture.image.data[qOffset + indexOffset + 1] = qy;
          qTexture.image.data[qOffset + indexOffset + 2] = qz;
          qTexture.image.data[qOffset + indexOffset + 3] = qw;

          // XXX get scales from the mapped geometry
          /* const sx = ss[index * 3];
          const sy = ss[index * 3 + 1];
          const sz = ss[index * 3 + 2]; */
          // const sx = 1;
          // const sy = 1;
          // const sz = 1;
          // sTexture.image.data[sOffset + indexOffset] = sx;
          // sTexture.image.data[sOffset + indexOffset + 1] = sy;
          // sTexture.image.data[sOffset + indexOffset + 2] = sz;

          // physics
          // const shapeAddress = this.#getShapeAddress(drawCall.geometryIndex);
          // const physicsObject = this.#addPhysicsShape(shapeAddress, drawCall.geometryIndex, px, py, pz, qx, qy, qz, qw);
          // this.physicsObjects.push(physicsObject);
          // localPhysicsObjects.push(physicsObject);
          // this.instanceObjects.set(physicsObject.physicsId, drawCall);
      
          index++;
        }

        drawCall.updateTexture('p', pOffset, index * 4);
        drawCall.updateTexture('q', qOffset, index * 4);
        // drawCall.updateTexture('s', sOffset, index * 4);
      };

      const {chunkSize} = this.instance;
      const boundingBox = localBox.set(
        localVector.set(
          chunk.min.x * chunkSize,
          -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
          chunk.min.y * chunkSize
        ),
        localVector2.set(
          (chunk.min.x + chunk.lod) * chunkSize,
          -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
          (chunk.min.y + chunk.lod) * chunkSize
        )
      );
      const lodIndex = Math.log2(chunk.lod);
      const {instances} = vegetationData;
      const drawChunks = Array(instances.length);
      for (let i = 0; i < instances.length; i++) {
        const {
          instanceId,
          ps,
          qs,
        } = instances[i];
        const geometryIndex = instanceId;
        const numInstances = ps.length / 3;

        const drawChunk = this.allocator.allocDrawCall(
          geometryIndex,
          lodIndex,
          numInstances,
          boundingBox
        );
        _renderLitterPolygonGeometry(drawChunk, ps, qs);
        drawChunks[i] = drawChunk;
      }
      const key = procGenManager.getNodeHash(chunk);
      this.allocatedChunks.set(key, drawChunks);
    }
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);
    const drawChunks = this.allocatedChunks.get(key);
    if (drawChunks) {
      for (const drawChunk of drawChunks) {
        this.allocator.freeDrawCall(drawChunk);
      }
    }
    this.allocatedChunks.delete(key);
  }

  /* #getShapeAddress(geometryIndex) {
    return this.shapeAddresses[geometryIndex];
  }
  #getShapeGeometry(geometryIndex){
    return this.physicsGeometries[geometryIndex];
  }
  #addPhysicsShape(shapeAddress, geometryIndex, px, py, pz, qx, qy, qz, qw) {    
    localVector.set(px, py, pz);
    localQuaternion.set(qx, qy, qz, qw);
    localVector2.set(1, 1, 1);
    localMatrix.compose(localVector, localQuaternion, localVector2)
      .premultiply(this.matrixWorld)
      .decompose(localVector, localQuaternion, localVector2);

    const position = localVector;
    const quaternion = localQuaternion;
    const scale = localVector2;
    const dynamic = false;
    const external = true;

    const physicsGeometry = this.#getShapeGeometry(geometryIndex);
    const physicsObject = this.physics.addConvexShape(shapeAddress, position, quaternion, scale, dynamic, external,physicsGeometry);
  
    this.physicsObjects.push(physicsObject);

    return physicsObject;
  } */
  
  grabInstance(physicsId){
    const phys = metaversefile.getPhysicsObjectByPhysicsId(physicsId);
    this.physics.removeGeometry(phys);
    const drawcall = this.instanceObjects.get(physicsId);
    drawcall.decrementInstanceCount();
  }
  /* getPhysicsObjects() {
    return this.physicsObjects;
  } */
  setPackage(pkg) {
    // console.log('set package', pkg);
    const {lodMeshes, textureNames} = pkg;
    // console.log('set package', {lodMeshes, textureNames});
    this.allocator.setGeometries(lodMeshes.map(lodMeshesArray => {
      return lodMeshesArray.map(lodMesh => {
        return lodMesh.geometry;
      });
    }));
    this.geometry = this.allocator.geometry;

    for (const textureName of textureNames) {
      this.material[textureName] = lodMeshes[0][0].material[textureName];
    }

    this.visible = true;
  }
}

//

class SpritesheetPackage {
  constructor(canvas, offsets) {
    this.canvas = canvas;
    this.offsets = offsets;
  }
  static async loadUrls(urls) {
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    const offsets = new Float32Array(urls.length * 4);
    await Promise.all(urls.map(async (url, index) => {
      const numFrames = 8;

      /* const spritesheet = await spriting.createAppUrlSpriteSheet(u, {
        // size: 2048,
        // numFrames: 8,
      });
      const {
        result,
        numFrames,
        frameSize,
        numFramesPerRow,
        worldWidth,
        worldHeight,
      } = spritesheet; */

      const spritesheet = await createAppUrlSpriteSheet(url, {
        size: spritesheetSize,
        // size: 2048,
        numFrames,
      });
      const {
        result,
        // numFrames,
        // frameSize,
        // numFramesPerRow,
        worldWidth,
        worldHeight,
        worldOffset,
      } = spritesheet;

      /* {
        const canvas2 = document.createElement('canvas');
        canvas2.width = result.width;
        canvas2.height = result.height;
        canvas2.style.cssText = `\
          position: fixed;
          top: 0;
          left: ${index * 512}px;
          width: 512px;
          height: 512px;
        `;
        const ctx2 = canvas2.getContext('2d');
        ctx2.drawImage(result, 0, 0);
        document.body.appendChild(canvas2);
      } */

      const x = index % spritesheetsPerRow;
      const y = Math.floor(index / spritesheetsPerRow);
      ctx.drawImage(result, x * spritesheetSize, y * spritesheetSize);
      // console.log('draw image', x * spritesheetSize, y * spritesheetSize, result.width, result.height);

      // console.log('got spritesheet', spritesheet);

      // debugging
      /* const canvas = document.createElement('canvas');
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.style.cssText = `\
        position: fixed;
        top: 0;
        left: 0;
        width: 512px;
        height: 512px;
      `;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(result, 0, 0);
      document.body.appendChild(canvas); */

      offsets[index * 4] = worldOffset[0];
      offsets[index * 4 + 1] = worldOffset[1];
      offsets[index * 4 + 2] = worldOffset[2];
      const worldSize = Math.max(worldWidth, worldHeight);
      offsets[index * 4 + 3] = worldSize;

      /* const texture = new THREE.Texture(result);
      texture.needsUpdate = true;
      const numAngles = numFrames;
      const numSlots = numFramesPerRow;
      const spritesheetMesh = new LitterSpritesheetMesh({
        texture,
        worldSize,
        worldOffset,
        numAngles,
        numSlots,
      });
      spritesheetMesh.position.y = 0.5;
      spritesheetMesh.position.x = (-urls.length / 2 + index) * meshSize;
      spritesheetMesh.position.z += meshSize * 2;
      spritesheetMesh.scale.multiplyScalar(2);
      app.add(spritesheetMesh);
      spritesheetMesh.updateMatrixWorld(); */
    }));

    const pkg = new SpritesheetPackage(canvas, offsets);
    return pkg;
  }
}

//

const canvasSize = 2048;
const spritesheetSize = 512;
const spritesheetsPerRow = canvasSize / spritesheetSize;
const numAngles = 8;
const numFramesPow2 = Math.pow(2, Math.ceil(Math.log2(numAngles)));
const numFramesPerRow = Math.ceil(Math.sqrt(numFramesPow2));
const maxDrawCalls = 256;
const maxInstancesPerDrawCall = 1024;
const maxAnisotropy = 16;
class LitterSpritesheetMesh extends ChunkedBatchedMesh {
  constructor({
    instance,
  }) {
    const baseGeometry = new DoubleSidedPlaneGeometry(1, 1);
    const allocator = new ChunkedGeometryAllocator(baseGeometry, [
      {
        name: 'p',
        Type: Float32Array,
        itemSize: 3,
      },
      /* {
        name: 'q',
        Type: Float32Array,
        itemSize: 4,
      }, */
      {
        name: 'offset',
        Type: Float32Array,
        itemSize: 4,
      },
      {
        name: 'itemIndex',
        Type: Float32Array,
        itemSize: 1,
      },
    ], {
      maxDrawCalls,
      maxInstancesPerDrawCall,
      boundingType: 'box',
    });
    const {geometry, textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTex: {
          value: null,
          needsUpdate: null,
        },
        /* uY: {
          value: 0,
          needsUpdate: false,
        }, */
        cameraPos: {
          value: new THREE.Vector3(),
          needsUpdate: false,
        },
        cameraY: {
          value: 0,
          needsUpdate: false,
        },
        numAngles: {
          value: numAngles,
          needsUpdate: true,
        },
        numFramesPerRow: {
          value: numFramesPerRow,
          needsUpdate: true,
        },
        spritesheetsPerRow: {
          value: spritesheetsPerRow,
          needsUpdate: true,
        },

        pTexture: {
          value: attributeTextures.p,
          needsUpdate: true,
        },
        /* qTexture: {
          value: attributeTextures.q,
          needsUpdate: true,
        }, */
        offsetTexture: {
          value: attributeTextures.offset,
          needsUpdate: true,
        },
        itemIndexTexture: {
          value: attributeTextures.itemIndex,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D pTexture;
        uniform sampler2D offsetTexture;
        uniform sampler2D itemIndexTexture;
        uniform vec3 cameraPos;
        uniform float cameraY;
        varying vec2 vUv;
        varying float vItemIndex;
        varying float vY;

        vec3 rotate_vertex_position(vec3 position, vec4 q) { 
          return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
        }
        vec4 euler_to_quaternion(vec3 e) { // assumes YXZ order
          float x = e.x;
          float y = e.y;
          float z = e.z;

          float c1 = cos( x / 2. );
          float c2 = cos( y / 2. );
          float c3 = cos( z / 2. );

          float s1 = sin( x / 2. );
          float s2 = sin( y / 2. );
          float s3 = sin( z / 2. );

          vec4 q;
          q.x = s1 * c2 * c3 + c1 * s2 * s3;
          q.y = c1 * s2 * c3 - s1 * c2 * s3;
          q.z = c1 * c2 * s3 - s1 * s2 * c3;
          q.w = c1 * c2 * c3 + s1 * s2 * s3;
          return q;
        }
        void main() {
          int instanceIndex = gl_DrawID * ${maxInstancesPerDrawCall} + gl_InstanceID;
          const float width = ${attributeTextures.p.image.width.toFixed(8)};
          const float height = ${attributeTextures.p.image.height.toFixed(8)};
          float x = mod(float(instanceIndex), width);
          float y = floor(float(instanceIndex) / width);
          vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
          vec3 p = texture2D(pTexture, pUv).xyz;
          vec4 offsetFull = texture2D(offsetTexture, pUv).xyzw;
          vec3 offset = offsetFull.xyz;
          float s = offsetFull.w;
          float itemIndex = texture2D(itemIndexTexture, pUv).x;

          // transform position
          vec3 transformed = position;
          {
            transformed *= s;
            transformed += offset;

            vec3 e = vec3(0., cameraY, 0.);
            vec4 q = euler_to_quaternion(e);
            transformed = rotate_vertex_position(transformed, q);
            
            transformed += p;
          }

          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          vUv = uv;
          vItemIndex = itemIndex;

          const float PI_2 = PI * 2.;
          vY = mod(atan(cameraPos.z - p.z, cameraPos.x - p.x) - (PI * 0.5), PI_2) / PI_2;
        }
      `,
      fragmentShader: `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D uTex;
        uniform float numAngles;
        uniform float numFramesPerRow;
        uniform float spritesheetsPerRow;
        varying vec2 vUv;
        varying float vItemIndex;
        varying float vY;

        void main() {
          float itemX = mod(vItemIndex, spritesheetsPerRow);
          float itemY = floor(vItemIndex / spritesheetsPerRow);
          vec2 uv =
            vec2(0., 1. - 1./spritesheetsPerRow) + // last spritesheet
            vec2(itemX, -itemY) / spritesheetsPerRow; // select spritesheet

          float angleIndex = floor(vY * numAngles);
          float i = angleIndex;
          float x = mod(i, numFramesPerRow);
          float y = floor(i / numFramesPerRow);
          float totalNumFramesPerRow = numFramesPerRow * spritesheetsPerRow;
          uv +=
            // vec2(0., -1./totalNumFramesPerRow) + // last row
            vec2(x, y)/totalNumFramesPerRow + // select frame
            vUv/totalNumFramesPerRow; // offset within frame

          gl_FragColor = texture(
            uTex,
            uv
          );

          const float alphaTest = 0.5;
          if (gl_FragColor.a < alphaTest) {
            discard;
          }
          gl_FragColor.a = 1.;
          // gl_FragColor.r += 0.1;
          // gl_FragColor.b += vY * 0.1;
        }
      `,
      transparent: true,
      // depthWrite: false,
      // polygonOffset: true,
      // polygonOffsetFactor: -2,
      // polygonOffsetUnits: 1,
      // side: THREE.DoubleSide,
    });
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;

    this.instance = instance;

    this.offsets = new Float32Array(0);
    this.allocatedChunks = new Map();
  }
  addChunk(chunk, chunkResult) {
    const vegetationData = chunkResult;

    if (chunk.lod >= spriteLodCutoff && vegetationData.instances.length > 0) {
      const _renderLitterSpriteGeometry = (drawCall, vegetationData) => {
        const pTexture = drawCall.getTexture('p');
        const pOffset = drawCall.getTextureOffset('p');
        // const qTexture = drawCall.getTexture('q');
        // const qOffset = drawCall.getTextureOffset('q');
        const offsetTexture = drawCall.getTexture('offset');
        const offsetOffset = drawCall.getTextureOffset('offset');
        const itemIndexTexture = drawCall.getTexture('itemIndex');
        const itemIndexOffset = drawCall.getTextureOffset('itemIndex');

        const {instances} = vegetationData;
        let index = 0;
        for (let i = 0; i < instances.length; i++) {
          const instance = instances[i];
          const {instanceId, ps, qs} = instance;

          for (let j = 0; j < ps.length; j += 3) {
            const indexOffset = index * 4;
            
            // geometry
            const px = ps[index * 3];
            const py = ps[index * 3 + 1];
            const pz = ps[index * 3 + 2];
            pTexture.image.data[pOffset + indexOffset] = px;
            pTexture.image.data[pOffset + indexOffset + 1] = py;
            pTexture.image.data[pOffset + indexOffset + 2] = pz;

            /* const qx = qs[index * 4];
            const qy = qs[index * 4 + 1];
            const qz = qs[index * 4 + 2];
            const qw = qs[index * 4 + 3];
            qTexture.image.data[qOffset + indexOffset] = qx;
            qTexture.image.data[qOffset + indexOffset + 1] = qy;
            qTexture.image.data[qOffset + indexOffset + 2] = qz;
            qTexture.image.data[qOffset + indexOffset + 3] = qw; */

            // XXX get scales from the mapped geometry
            /* const sx = ss[index * 3];
            const sy = ss[index * 3 + 1];
            const sz = ss[index * 3 + 2]; */
            /* const sx = 1;
            const sy = 1;
            const sz = 1; */
            offsetTexture.image.data[offsetOffset + indexOffset] = this.offsets[instanceId * 4];
            offsetTexture.image.data[offsetOffset + indexOffset + 1] = this.offsets[instanceId * 4 + 1];
            offsetTexture.image.data[offsetOffset + indexOffset + 2] = this.offsets[instanceId * 4 + 2];
            offsetTexture.image.data[offsetOffset + indexOffset + 3] = this.offsets[instanceId * 4 + 3];

            itemIndexTexture.image.data[itemIndexOffset + indexOffset] = instanceId;

            // physics
            // const shapeAddress = this.#getShapeAddress(drawCall.geometryIndex);
            // const physicsObject = this.#addPhysicsShape(shapeAddress, drawCall.geometryIndex, px, py, pz, qx, qy, qz, qw);
            // this.physicsObjects.push(physicsObject);
            // localPhysicsObjects.push(physicsObject);
            // this.instanceObjects.set(physicsObject.physicsId, drawCall);
        
            index++;
          }
        }

        drawCall.updateTexture('p', pOffset, index * 4);
        // drawCall.updateTexture('q', qOffset, index * 4);
        drawCall.updateTexture('offset', offsetOffset, index * 4);
        drawCall.updateTexture('itemIndex', itemIndexOffset, index * 4);
      };

      const {chunkSize} = this.instance;
      const boundingBox = localBox.set(
        localVector.set(
          chunk.min.x * chunkSize,
          -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
          chunk.min.y * chunkSize
        ),
        localVector2.set(
          (chunk.min.x + chunk.lod) * chunkSize,
          -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
          (chunk.min.y + chunk.lod) * chunkSize
        )
      );
      const totalInstances = (() => {
        let sum = 0;
        const {instances} = vegetationData;
        for (let i = 0; i < instances.length; i++) {
          const instance = instances[i];
          const {ps} = instance;
          sum += ps.length;
        }
        sum /= 3;
        return sum;
      })();
      const drawChunk = this.allocator.allocChunk(
        totalInstances,
        boundingBox
      );
      _renderLitterSpriteGeometry(drawChunk, vegetationData);

      const key = procGenManager.getNodeHash(chunk);
      this.allocatedChunks.set(key, drawChunk);
    }
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);
    const drawChunk = this.allocatedChunks.get(key);
    if (drawChunk) {
      this.allocator.freeChunk(drawChunk);
      this.allocatedChunks.delete(key);
    }
  }
  setPackage(pkg) {
    const {canvas} = pkg;
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    this.material.uniforms.uTex.value = texture;
    this.material.uniforms.uTex.needsUpdate = true;

    /* canvas.style.cssText = `\
      position: fixed;
      top: 0;
      left: 0;
      width: 512px;
      height: 512px;
    `;
    document.body.appendChild(canvas); */

    this.offsets = pkg.offsets;

    this.visible = true;
  }
  update() {
    const camera = useCamera();
    localEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    localEuler.x = 0;
    localEuler.z = 0;

    this.material.uniforms.cameraPos.value.copy(camera.position);
    this.material.uniforms.cameraPos.needsUpdate = true;

    // this.material.uniforms.cameraY.value = mod(-localEuler.y + Math.PI/2 + (Math.PI * 2) / numAngles / 2, Math.PI * 2) / (Math.PI * 2);
    this.material.uniforms.cameraY.value = localEuler.y;
    this.material.uniforms.cameraY.needsUpdate = true;
  }
}

//

export class LitterMetaMesh extends THREE.Object3D {
  constructor({
    instance,
    // gpuTaskManager,
    physics,
  }) {
    super();

    this.polygonMesh = new LitterPolygonMesh({
      instance,
    });
    this.add(this.polygonMesh);

    this.spritesheetMesh = new LitterSpritesheetMesh({
      instance,
    });
    this.add(this.spritesheetMesh);

    this.physics = physics;
  }
  update() {
    this.spritesheetMesh.update();
  }
  addChunk(chunk, chunkResult) {
    this.polygonMesh.addChunk(chunk, chunkResult);
    this.spritesheetMesh.addChunk(chunk, chunkResult);
  }
  removeChunk(chunk) {
    this.polygonMesh.removeChunk(chunk);
    this.spritesheetMesh.removeChunk(chunk);
  }
  async loadUrls(urls) {
    const [
      meshPackage,
      spritesheetPackage,
    ] = await Promise.all([
      MeshPackage.loadUrls(urls, this.physics),
      SpritesheetPackage.loadUrls(urls),
    ]);
    this.polygonMesh.setPackage(meshPackage);
    this.spritesheetMesh.setPackage(spritesheetPackage);

    /* // XXX debugging
    {
      const allLodMeshes = [];
      const {lodMeshes} = meshPackage;
      for (const lodMeshArray of lodMeshes) {
        for (const lodMesh of lodMeshArray) {
          // this.add(lodMesh);
          allLodMeshes.push(lodMesh);
        }
      }
      const meshSize = 3;
      for (let i = 0; i < allLodMeshes.length; i++) {
        const lodMesh = allLodMeshes[i];
        lodMesh.position.x = (-allLodMeshes.length/2 + i) * meshSize;
        lodMesh.position.y = 0.5;
        lodMesh.position.z = 5;
        this.add(lodMesh);
        lodMesh.updateMatrixWorld();
      }
    } */
  }
}
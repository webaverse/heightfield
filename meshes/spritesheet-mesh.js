import * as THREE from 'three';
import metaversefile from 'metaversefile';
import {
  // bufferSize,
  WORLD_BASE_HEIGHT,
  MIN_WORLD_HEIGHT,
  MAX_WORLD_HEIGHT,
  maxAnisotropy,
} from '../constants.js';
import {_createTreeSingleMaterial} from '../customShader/tree-material.js';
import {_createBushSingleMaterial} from '../customShader/bush-material.js';
const {
  useCamera,
  useProcGenManager,
  useGeometries,
  useAtlasing,
  useGeometryBatching,
  useGeometryChunking,
  useLoaders,
  usePhysics,
  useSpriting,
  useLightsManager,
  useLocalPlayer,
  useScene,
} = metaversefile;
const procGenManager = useProcGenManager();
const { createAppUrlSpriteSheet } = useSpriting();
const lightsManager = useLightsManager();
// const {DoubleSidedPlaneGeometry} = useGeometries();
const { ChunkedBatchedMesh, ChunkedGeometryAllocator } = useGeometryChunking();
const { gltfLoader } = useLoaders();

const camera = useCamera();
const scene = useScene();

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localEuler = new THREE.Euler();
const localBox = new THREE.Box3();

let localMesh = null;

//
const textureLoader = new THREE.TextureLoader();

const _textureError = (err) => {
  console.error('PolygonMesh Package : Loading texture failed : ', err);
};
const _loadTexture = (u) =>
  new Promise((accept, reject) => {
    textureLoader.load(
      u.value[0],
      (t) => {
        accept(t);
      },
      function onProgress() {},
      _textureError
    );
  });

export class SpritesheetPackage {
  constructor(canvas, offsets, textures) {
    this.canvas = canvas;
    this.offsets = offsets;
    this.textures = textures;
  }

  static async loadUrls(urls, hasCustomShading, assetType, paths) {
    const textures = {};
    if (paths) {
      const { shaderTexturePath } = paths;
      const mapObjectToArray = (obj) => {
        const res = [];
        for (const key in obj) res.push({ key: key, value: obj[key] });
        return res;
      };

      const shaderTextureArray = mapObjectToArray(shaderTexturePath);
      const shaderTextures = await Promise.all(
        shaderTextureArray.map(_loadTexture)
      ).then(function (arr) {
        const obj = {};
        for (let i = 0; i < shaderTextureArray.length; i++) {
          obj[shaderTextureArray[i].key] = arr[i];
          if (shaderTextureArray[i].value[1]) {
            arr[i].wrapS = arr[i].wrapT = THREE.RepeatWrapping;
          }
        }
        return obj;
      });
      textures['shaderTextures'] = shaderTextures;
    }

    const attributeArray = ['position', 'normal', 'uv'];

    const _setAdditionalAttribute = (assetType, array) => {
      switch (assetType) {
        case 'tree': {
          array.push('color');
          break;
        }
        default: {
          break;
        }
      }
    };
    _setAdditionalAttribute(assetType, attributeArray);

    // 
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');

    const offsets = new Float32Array(urls.length * 4);
    await Promise.all(
      urls.map(async (url, index) => {
        const numFrames = 8;
        let existingApp = null;

        if (hasCustomShading) {
          const model = await gltfLoader.loadAsync(url);
          let modelMesh = null;
          let breakLoop = false;

          model.scene.traverse((o) => {
            if(breakLoop) return;

            if (o.isMesh) {
              modelMesh = o;
              breakLoop = true;
            }
          });

          const geometry = modelMesh.geometry;

          let material = null;
          switch (assetType) {
            case 'tree':
              material = _createTreeSingleMaterial();
              break;
            case 'bush':
              material = _createBushSingleMaterial();
              break;
            default:
              break;
          }

          const mesh = new THREE.Mesh(geometry, material);
          mesh.updateMatrixWorld();

          const sunMoonRotationRadius = 500;
          for (const light of lightsManager.lights) {
            if (light.isDirectionalLight) {
              mesh.material.uniforms.lightPos.value
                .copy(light.position)
                .multiplyScalar(sunMoonRotationRadius);
              mesh.material.uniforms.lightIntensity.value = light.intensity;
              break;
            }
          }

          mesh.material.uniforms.eye.value.copy(camera.position);

          mesh.material.uniforms.map.value = modelMesh.material.map;
          mesh.material.uniforms.noiseTexture.value = textures.shaderTextures.noiseTexture;

          existingApp = mesh;
        }

        const spritesheet = await createAppUrlSpriteSheet(existingApp, url, {
          size: spritesheetSize,
          // size: 2048,
          numFrames,
        });
        const { result, worldWidth, worldHeight, worldOffset } = spritesheet;

        const x = index % spritesheetsPerRow;
        const y = Math.floor(index / spritesheetsPerRow);
        ctx.drawImage(result, x * spritesheetSize, y * spritesheetSize);

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
      })
    );


    const pkg = new SpritesheetPackage(canvas, offsets, textures);
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
export class SpritesheetMesh extends ChunkedBatchedMesh {
  constructor({ instance, lodCutoff }) {
    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    const allocator = new ChunkedGeometryAllocator(
      baseGeometry,
      [
        {
          name: 'p',
          Type: Float32Array,
          itemSize: 3,
        },
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
      ],
      {
        maxDrawCalls,
        maxInstancesPerDrawCall,
        boundingType: 'box',
      }
    );
    const { geometry, textures: attributeTextures } = allocator;
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
        offsetTexture: {
          value: attributeTextures.offset,
          needsUpdate: true,
        },
        itemIndexTexture: {
          value: attributeTextures.itemIndex,
          needsUpdate: true,
        },
      },
      vertexShader: /* glsl */ `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D pTexture;
        uniform sampler2D offsetTexture;
        uniform sampler2D itemIndexTexture;
        uniform vec3 cameraPos;
        uniform float cameraY;
        varying vec2 vUv;
        flat varying float vItemIndex;
        varying float vY;

        vec3 rotate_vertex_position(vec3 position, vec4 q) {
          return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
        }
        vec4 euler_to_quaternion(vec3 e) {// assumes YXZ order
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
      fragmentShader: /* glsl */ `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D uTex;
        uniform float numAngles;
        uniform float numFramesPerRow;
        uniform float spritesheetsPerRow;
        varying vec2 vUv;
        flat varying float vItemIndex;
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
        }
      `,
      transparent: true,
    });
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;

    this.instance = instance;
    this.lodCutoff = lodCutoff;

    this.offsets = new Float32Array(0);
    this.allocatedChunks = new Map();
  }

  addChunk(chunk, chunkResult) {
    if (chunkResult) {
      const instances = chunkResult;

      if (chunk.lod >= this.lodCutoff && instances.length > 0) {
        const _renderLitterSpriteGeometry = (drawCall, instances) => {
          const pTexture = drawCall.getTexture('p');
          const pOffset = drawCall.getTextureOffset('p');
          const offsetTexture = drawCall.getTexture('offset');
          const offsetOffset = drawCall.getTextureOffset('offset');
          const itemIndexTexture = drawCall.getTexture('itemIndex');
          const itemIndexOffset = drawCall.getTextureOffset('itemIndex');

          let index = 0;
          for (let i = 0; i < instances.length; i++) {
            const instance = instances[i];
            const { instanceId, ps, qs } = instance;

            for (let j = 0; j < ps.length; j += 3) {
              const indexOffset = index * 4;

              // geometry
              const px = ps[index * 3];
              const py = ps[index * 3 + 1];
              const pz = ps[index * 3 + 2];
              pTexture.image.data[pOffset + indexOffset] = px;
              pTexture.image.data[pOffset + indexOffset + 1] = py;
              pTexture.image.data[pOffset + indexOffset + 2] = pz;

              offsetTexture.image.data[offsetOffset + indexOffset] =
                this.offsets[instanceId * 4];
              offsetTexture.image.data[offsetOffset + indexOffset + 1] =
                this.offsets[instanceId * 4 + 1];
              offsetTexture.image.data[offsetOffset + indexOffset + 2] =
                this.offsets[instanceId * 4 + 2];
              offsetTexture.image.data[offsetOffset + indexOffset + 3] =
                this.offsets[instanceId * 4 + 3];

              itemIndexTexture.image.data[itemIndexOffset + indexOffset] =
                instanceId;

              index++;
            }
          }

          drawCall.updateTexture('p', pOffset, index * 4);
          drawCall.updateTexture('offset', offsetOffset, index * 4);
          drawCall.updateTexture('itemIndex', itemIndexOffset, index * 4);
        };

        const { chunkSize } = this.instance;
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
          for (let i = 0; i < instances.length; i++) {
            const instance = instances[i];
            const { ps } = instance;
            sum += ps.length;
          }
          sum /= 3;
          return sum;
        })();
        const drawChunk = this.allocator.allocChunk(
          totalInstances,
          boundingBox
        );
        _renderLitterSpriteGeometry(drawChunk, instances);

        const key = procGenManager.getNodeHash(chunk);
        this.allocatedChunks.set(key, drawChunk);
      }
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
    const { canvas, textures } = pkg;
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    this.material.uniforms.uTex.value = texture;
    this.material.uniforms.uTex.needsUpdate = true;

    this.offsets = pkg.offsets;

    this.visible = true;
  }

  update() {
    localEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    localEuler.x = 0;
    localEuler.z = 0;

    this.material.uniforms.cameraPos.value.copy(camera.position);
    this.material.uniforms.cameraPos.needsUpdate = true;

    this.material.uniforms.cameraY.value = localEuler.y;
    this.material.uniforms.cameraY.needsUpdate = true;
  }
}

// export class TreeSpritesheetMesh extends ChunkedBatchedMesh {
//   constructor({instance, lodCutoff}) {
//     const baseGeometry = new THREE.PlaneGeometry(1, 1);
//     const allocator = new ChunkedGeometryAllocator(
//       baseGeometry,
//       [
//         {
//           name: "p",
//           Type: Float32Array,
//           itemSize: 3,
//         },
//         {
//           name: "offset",
//           Type: Float32Array,
//           itemSize: 4,
//         },
//         {
//           name: "itemIndex",
//           Type: Float32Array,
//           itemSize: 1,
//         },
//       ],
//       {
//         maxDrawCalls,
//         maxInstancesPerDrawCall,
//         boundingType: "box",
//       },
//     );
//     const {geometry, textures: attributeTextures} = allocator;
//     for (const k in attributeTextures) {
//       const texture = attributeTextures[k];
//       texture.anisotropy = maxAnisotropy;
//     }

//     const material = new THREE.ShaderMaterial({
//       uniforms: {
//         uTex: {
//           value: null,
//           needsUpdate: null,
//         },
//         cameraPos: {
//           value: new THREE.Vector3(),
//           needsUpdate: false,
//         },
//         cameraY: {
//           value: 0,
//           needsUpdate: false,
//         },
//         numAngles: {
//           value: numAngles,
//           needsUpdate: true,
//         },
//         numFramesPerRow: {
//           value: numFramesPerRow,
//           needsUpdate: true,
//         },
//         spritesheetsPerRow: {
//           value: spritesheetsPerRow,
//           needsUpdate: true,
//         },

//         pTexture: {
//           value: attributeTextures.p,
//           needsUpdate: true,
//         },
//         offsetTexture: {
//           value: attributeTextures.offset,
//           needsUpdate: true,
//         },
//         itemIndexTexture: {
//           value: attributeTextures.itemIndex,
//           needsUpdate: true,
//         },
//         lightPos: {
//           value: new THREE.Vector3()
//         },
//         lightIntensity: {
//           value: 0
//         },
//       },
//       vertexShader: /* glsl */`\
//         ${THREE.ShaderChunk.common}
//         ${THREE.ShaderChunk.logdepthbuf_pars_vertex}

//         precision highp float;
//         precision highp int;

//         attribute vec4 color;

//         flat varying float vItemIndex;
//         varying float vY;

//         varying vec2 vUv;
//         varying vec3 vWorldPosition;
//         varying vec4 vColor;
//         varying vec3 vNormal;

//         uniform sampler2D pTexture;
//         uniform sampler2D offsetTexture;
//         uniform sampler2D itemIndexTexture;
//         uniform vec3 cameraPos;
//         uniform float cameraY;

//         vec3 rotate_vertex_position(vec3 position, vec4 q) {
//           return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
//         }
//         vec4 euler_to_quaternion(vec3 e) {// assumes YXZ order
//           float x = e.x;
//           float y = e.y;
//           float z = e.z;

//           float c1 = cos( x / 2. );
//           float c2 = cos( y / 2. );
//           float c3 = cos( z / 2. );

//           float s1 = sin( x / 2. );
//           float s2 = sin( y / 2. );
//           float s3 = sin( z / 2. );

//           vec4 q;
//           q.x = s1 * c2 * c3 + c1 * s2 * s3;
//           q.y = c1 * s2 * c3 - s1 * c2 * s3;
//           q.z = c1 * c2 * s3 - s1 * s2 * c3;
//           q.w = c1 * c2 * c3 + s1 * s2 * s3;
//           return q;
//         }
//         void main() {
//           int instanceIndex = gl_DrawID * ${maxInstancesPerDrawCall} + gl_InstanceID;
//           const float width = ${attributeTextures.p.image.width.toFixed(8)};
//           const float height = ${attributeTextures.p.image.height.toFixed(8)};
//           float x = mod(float(instanceIndex), width);
//           float y = floor(float(instanceIndex) / width);
//           vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
//           vec3 p = texture2D(pTexture, pUv).xyz;
//           vec4 offsetFull = texture2D(offsetTexture, pUv).xyzw;
//           vec3 offset = offsetFull.xyz;
//           float s = offsetFull.w;
//           float itemIndex = texture2D(itemIndexTexture, pUv).x;

//           // transform position
//           vec3 transformed = position;
//           {
//             transformed *= s;
//             transformed += offset;

//             vec3 e = vec3(0., cameraY, 0.);
//             vec4 q = euler_to_quaternion(e);
//             transformed = rotate_vertex_position(transformed, q);

//             transformed += p;
//           }

//           vec4 modelPosition = modelMatrix * vec4(transformed, 1.0);
//           vec4 viewPosition = viewMatrix * modelPosition;
//           gl_Position = projectionMatrix * viewPosition;

//           vUv = uv;
//           vColor = color;
//           vNormal = normal;
//           vWorldPosition = modelPosition.xyz;
//           vItemIndex = itemIndex;

//           const float TAU = PI * 2.;
//           vY = mod(atan(cameraPos.z - p.z, cameraPos.x - p.x) - (PI * 0.5), TAU) / TAU;

//           ${THREE.ShaderChunk.logdepthbuf_vertex}
//         }
//       `,
//       fragmentShader: /* glsl */`\
//         ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
//         #include <common>

//         precision highp float;
//         precision highp int;

//         flat varying float vItemIndex;
//         varying float vY;

//         varying vec2 vUv;
//         varying vec3 vWorldPosition;
//         varying vec4 vColor;
//         varying vec3 vNormal;

//         uniform vec3 cameraPos;
//         uniform vec3 lightPos;
//         uniform float lightIntensity;
//         uniform sampler2D uTex;
//         uniform float numAngles;
//         uniform float numFramesPerRow;
//         uniform float spritesheetsPerRow;

//         float DGGX(float a2, float NoH){
//           float d = (NoH * a2 - NoH) * NoH + 1.;
//           return a2 / (PI * d * d);
//         }

//         // cosine gradient
//         const float TAU = 2. * 3.14159265;
//         const vec4 phases = vec4(0.34, 0.48, 0.27, 0);
//         const vec4 amplitudes = vec4(4.02, 0.34, 0.65, 0);
//         const vec4 frequencies = vec4(0.00, 0.48, 0.08, 0);
//         const vec4 offsets = vec4(0.21, 0.33, 0.06, -0.38);
//         vec4 cosGradient(float x, vec4 phase, vec4 amp, vec4 freq, vec4 offset){
//           phase *= TAU;
//           x *= TAU;
//           return vec4(
//             offset.r + amp.r * 0.5 * cos(x * freq.r + phase.r) + 0.5,
//             offset.g + amp.g * 0.5 * cos(x * freq.g + phase.g) + 0.5,
//             offset.b + amp.b * 0.5 * cos(x * freq.b + phase.b) + 0.5,
//             offset.a + amp.a * 0.5 * cos(x * freq.a + phase.a) + 0.5
//           );
//         }

//         void main() {
//           float itemX = mod(vItemIndex, spritesheetsPerRow);
//           float itemY = floor(vItemIndex / spritesheetsPerRow);
//           vec2 uv =
//             vec2(0., 1. - 1./spritesheetsPerRow) + // last spritesheet
//             vec2(itemX, -itemY) / spritesheetsPerRow; // select spritesheet

//           float angleIndex = floor(vY * numAngles);
//           float i = angleIndex;
//           float x = mod(i, numFramesPerRow);
//           float y = floor(i / numFramesPerRow);
//           float totalNumFramesPerRow = numFramesPerRow * spritesheetsPerRow;
//           uv +=
//             // vec2(0., -1./totalNumFramesPerRow) + // last row
//             vec2(x, y)/totalNumFramesPerRow + // select frame
//             vUv/totalNumFramesPerRow; // offset within frame

//           vec3 eyeDirection = normalize(cameraPos - vWorldPosition);
//           vec3 surfaceNormal = normalize(vNormal);
//           vec3 lightDir = normalize(lightPos);
//           float NdotL = max(0.0, dot(lightDir, surfaceNormal));
//           float EdotL = max(0.0, dot(eyeDirection, surfaceNormal));

//           bool isLeaf = vColor.r > 0.1;
//           vec4 col;
//           vec4 treeColor;
//           if (isLeaf) {
//             vec4 leaf = texture2D(uTex, uv);
//             treeColor = leaf;
//             gl_FragColor.a = treeColor.a;
//           }
//           else {
//             vec4 bark = texture2D(uTex, uv);
//             treeColor = bark;
//             gl_FragColor.a = treeColor.a;
//           }
//           if (gl_FragColor.a < 0.9) {
//             discard;
//           }

//           float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
//           vec4 cosGradColor = cosGradient(NdotL, phases, amplitudes, frequencies, offsets);
//           vec3 ambient = cosGradColor.rgb * smoothstep(0.1, 0.99, topColor);

//           float albedoLerp = mix(1. - EdotL, NdotL, 0.5) + 0.4;
//           vec3 albedo = mix(vec3(0.0399, 0.570, 0.164), vec3(0.483, 0.950, 0.171), albedoLerp).rgb;
//           vec3 diffuse = mix(ambient.rgb * albedo.rgb, albedo.rgb, NdotL);
//           vec3 lightToEye = normalize(lightPos + cameraPos);
//           float specularRoughness = 0.6;
//           float specularIntensity = 0.9;
//           float specular = DGGX(specularRoughness * specularRoughness, NdotL);
//           // vec3 specularColor = albedo * specular * specularIntensity;
//           vec3 specularColor = isLeaf ? albedo * specular * specularIntensity : vec3(specular * specularIntensity);
//           vec3 backLightDir = normalize(surfaceNormal + lightPos);
//           float backSSS = saturate(dot(eyeDirection, -backLightDir));
//           float backSSSIntensity = (1. - EdotL) * 1.0;
//           backSSS = saturate(dot(pow(backSSS, 10.), backSSSIntensity));

//           float colorIntensity = 0.3;

//           if (isLeaf) {
//             gl_FragColor.rgb = (diffuse + albedo + specularColor) * colorIntensity;
//             gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.6, gl_FragColor.rgb, treeColor.r);

//             // float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
//             // gl_FragColor.rgb *= smoothstep(0.1, 0.99, topColor) * 1.5;

//             gl_FragColor.rgb += backSSS * lightIntensity * 0.1;
//           }
//           else {
//             gl_FragColor.rgb = (treeColor.rgb + specularColor) * colorIntensity * 0.5;
//           }
//           ${THREE.ShaderChunk.logdepthbuf_fragment}
//         }
//       `,
//       transparent: true,
//     });
//     super(geometry, material, allocator);
//     this.frustumCulled = false;
//     this.visible = false;

//     this.instance = instance;
//     this.lodCutoff = lodCutoff;

//     this.offsets = new Float32Array(0);
//     this.allocatedChunks = new Map();
//   }

//   addChunk(chunk, chunkResult) {
//     if (chunkResult) {
//       const instances = chunkResult;

//       if (chunk.lod >= this.lodCutoff && instances.length > 0) {
//         const _renderLitterSpriteGeometry = (drawCall, instances) => {
//           const pTexture = drawCall.getTexture("p");
//           const pOffset = drawCall.getTextureOffset("p");
//           const offsetTexture = drawCall.getTexture("offset");
//           const offsetOffset = drawCall.getTextureOffset("offset");
//           const itemIndexTexture = drawCall.getTexture("itemIndex");
//           const itemIndexOffset = drawCall.getTextureOffset("itemIndex");

//           let index = 0;
//           for (let i = 0; i < instances.length; i++) {
//             const instance = instances[i];
//             const {instanceId, ps, qs} = instance;

//             for (let j = 0; j < ps.length; j += 3) {
//               const indexOffset = index * 4;

//               // geometry
//               const px = ps[index * 3];
//               const py = ps[index * 3 + 1];
//               const pz = ps[index * 3 + 2];
//               pTexture.image.data[pOffset + indexOffset] = px;
//               pTexture.image.data[pOffset + indexOffset + 1] = py;
//               pTexture.image.data[pOffset + indexOffset + 2] = pz;

//               offsetTexture.image.data[offsetOffset + indexOffset] =
//                 this.offsets[instanceId * 4];
//               offsetTexture.image.data[offsetOffset + indexOffset + 1] =
//                 this.offsets[instanceId * 4 + 1];
//               offsetTexture.image.data[offsetOffset + indexOffset + 2] =
//                 this.offsets[instanceId * 4 + 2];
//               offsetTexture.image.data[offsetOffset + indexOffset + 3] =
//                 this.offsets[instanceId * 4 + 3];

//               itemIndexTexture.image.data[itemIndexOffset + indexOffset] =
//                 instanceId;

//               index++;
//             }
//           }

//           drawCall.updateTexture("p", pOffset, index * 4);
//           drawCall.updateTexture("offset", offsetOffset, index * 4);
//           drawCall.updateTexture("itemIndex", itemIndexOffset, index * 4);
//         };

//         const {chunkSize} = this.instance;
//         const boundingBox = localBox.set(
//           localVector.set(
//             chunk.min.x * chunkSize,
//             -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
//             chunk.min.y * chunkSize,
//           ),
//           localVector2.set(
//             (chunk.min.x + chunk.lod) * chunkSize,
//             -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
//             (chunk.min.y + chunk.lod) * chunkSize,
//           ),
//         );
//         const totalInstances = (() => {
//           let sum = 0;
//           for (let i = 0; i < instances.length; i++) {
//             const {ps} = instances[i];
//             console.log(ps);
//             sum += ps.length;
//           }
//           sum /= 3;
//           return sum;
//         })();
//         const drawChunk = this.allocator.allocChunk(
//           totalInstances,
//           boundingBox,
//         );
//         _renderLitterSpriteGeometry(drawChunk, instances);

//         const key = procGenManager.getNodeHash(chunk);
//         this.allocatedChunks.set(key, drawChunk);
//       }
//     }
//   }

//   removeChunk(chunk) {
//     const key = procGenManager.getNodeHash(chunk);
//     const drawChunk = this.allocatedChunks.get(key);
//     if (drawChunk) {
//       this.allocator.freeChunk(drawChunk);
//       this.allocatedChunks.delete(key);
//     }
//   }

//   setPackage(pkg) {
//     const {canvas} = pkg;
//     const texture = new THREE.Texture(canvas);
//     texture.needsUpdate = true;

//     this.material.uniforms.uTex.value = texture;
//     this.material.uniforms.uTex.needsUpdate = true;

//     this.offsets = pkg.offsets;

//     this.visible = true;
//   }

//   update(timestamp) {
//     const sunMoonRotationRadius = 500;
//     for (const light of lightsManager.lights) {
//       if (light.isDirectionalLight) {
//         this.material.uniforms.lightPos.value.copy(light.position).multiplyScalar(sunMoonRotationRadius);
//         this.material.uniforms.lightIntensity.value = light.intensity;
//         break;
//       }
//     }

//     this.material.uniforms.uTime.value = timestamp / 1000;

//     localEuler.setFromQuaternion(camera.quaternion, "YXZ");
//     localEuler.x = 0;
//     localEuler.z = 0;

//     this.material.uniforms.cameraPos.value.copy(camera.position);
//     // this.material.uniforms.cameraPos.needsUpdate = true;

//     this.material.uniforms.cameraY.value = localEuler.y;
//     // this.material.uniforms.cameraY.needsUpdate = true;
//   }
// }

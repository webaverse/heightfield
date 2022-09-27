import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useCamera, useGeometries, useGeometryChunking, useProcGenManager} = metaversefile;
const procGenManager = useProcGenManager();
const {DoubleSidedPlaneGeometry} = useGeometries();
const {ChunkedBatchedMesh, ChunkedGeometryAllocator} = useGeometryChunking();
import {
  // bufferSize,
  WORLD_BASE_HEIGHT,
  MIN_WORLD_HEIGHT,
  MAX_WORLD_HEIGHT,
  maxAnisotropy,
} from '../constants.js';

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localEuler = new THREE.Euler();
const localBox = new THREE.Box3();

//

const _loadImage = src => new Promise((accept, reject) => {
  const img = new Image();
  img.onload = () => {
    accept(img);
  };
  img.onerror = err => {
    reject(err);
  };
  img.src = src;
  img.crossOrigin = 'Anonymous';
});

//

const canvasSize = 2048;
const iconSize = 256;
const iconsPerRow = canvasSize / iconSize;
export class IconPackage {
  constructor(canvas) {
    this.canvas = canvas;
  }
  static async loadUrls(urls) {
    const imgs = await Promise.all(urls.map(async url => {
      const img = await _loadImage(url);
      return img;
    }));

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < imgs.length; i++) {
      const x = (i % iconsPerRow) * iconSize;
      const y = Math.floor(i / iconsPerRow) * iconSize;

      const img = imgs[i];
      ctx.drawImage(img, x, y, iconSize, iconSize);
    }
 
    const pkg = new IconPackage(canvas);
    return pkg;
  }
}

//

const maxDrawCalls = 256;
const maxInstancesPerDrawCall = 256;
export class IconMesh extends ChunkedBatchedMesh {
  constructor({
    instance,
    lodCutoff,
  } = {}) {
    // allocator
    const baseGeometry = new DoubleSidedPlaneGeometry(1, 1);
    const allocator = new ChunkedGeometryAllocator(baseGeometry, [
      {
        name: 'p',
        Type: Float32Array,
        itemSize: 3,
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
    const {textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }

    // geometry
    const {geometry} = allocator;

    // material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTex: {
          value: null,
          needsUpdate: null,
        },
        cameraY: {
          value: 0,
          needsUpdate: false,
        },
        /* numIcons: {
          value: numIcons,
          needsUpdate: true,
        }, */
        iconsPerRow: {
          value: iconsPerRow,
          needsUpdate: true,
        },

        pTexture: {
          value: attributeTextures.p,
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
        uniform sampler2D itemIndexTexture;
        varying vec2 vUv;
        varying float vItemIndex;

        void main() {
          int instanceIndex = gl_DrawID * ${maxInstancesPerDrawCall} + gl_InstanceID;
          const float width = ${attributeTextures.p.image.width.toFixed(8)};
          const float height = ${attributeTextures.p.image.height.toFixed(8)};
          float x = mod(float(instanceIndex), width);
          float y = floor(float(instanceIndex) / width);
          vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
          vec3 p = texture2D(pTexture, pUv).xyz;
          float itemIndex = texture2D(itemIndexTexture, pUv).x;

          // transform position
          vec3 transformed = position;
          {
            transformed += p;
          }

          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          vUv = uv;
          vItemIndex = itemIndex;
        }
      `,
      fragmentShader: `\
        precision highp float;
        precision highp int;

        #define PI 3.1415926535897932384626433832795

        uniform sampler2D uTex;
        uniform float iconsPerRow;
        varying vec2 vUv;
        varying float vItemIndex;

        void main() {
          float itemX = mod(vItemIndex, iconsPerRow);
          float itemY = floor(vItemIndex / iconsPerRow);
          vec2 uv =
            vec2(0., 1. - 1./iconsPerRow) + // last icon
            vec2(itemX, -itemY) / iconsPerRow; // select icon

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

    // mesh
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;

    this.instance = instance;
    this.lodCutoff = lodCutoff;
    
    this.allocatedChunks = new Map();
  }

  addChunk(chunk, chunkResult) {
    const {ps, instances} = chunkResult;
    if (chunk.lod < this.lodCutoff && instances.length > 0) {
      const _renderIconGeometry = (drawCall, ps, instances) => {
        const pTexture = drawCall.getTexture('p');
        const pOffset = drawCall.getTextureOffset('p');
        const itemIndexTexture = drawCall.getTexture('itemIndex');
        const itemIndexOffset = drawCall.getTextureOffset('itemIndex');

        for (let i = 0; i < instances.length; i++) {
          const instanceId = instances[i];
          
          // geometry
          const px = ps[i * 3];
          const py = ps[i * 3 + 1];
          const pz = ps[i * 3 + 2];
          pTexture.image.data[pOffset + i] = px;
          pTexture.image.data[pOffset + i + 1] = py;
          pTexture.image.data[pOffset + i + 2] = pz;

          itemIndexTexture.image.data[itemIndexOffset + i] = instanceId;
        }

        drawCall.updateTexture('p', pOffset, ps.length / 3 * 4);
        drawCall.updateTexture('itemIndex', itemIndexOffset, instances.length * 4);
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
      const drawChunk = this.allocator.allocChunk(
        instances.length,
        boundingBox
      );
      _renderIconGeometry(drawChunk, ps, instances);

      const key = procGenManager.getNodeHash(chunk);
      this.allocatedChunks.set(key, drawChunk);
    }
  }
  removeChunk(chunk) {
    const key = procGenManager.getNodeHash(chunk);
    const drawChunk = this.allocatedChunks.get(key);
    if (drawChunk) {
      this.allocator.freeChunk(drawChunk);
    }
    this.allocatedChunks.delete(key);
  }
  update() {
    const camera = useCamera();
    localEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    localEuler.x = 0;
    localEuler.z = 0;

    this.material.uniforms.cameraY.value = localEuler.y;
    this.material.uniforms.cameraY.needsUpdate = true;
  }
  
  setPackage(pkg) {
    const {canvas} = pkg;

    this.material.uTex.value = canvas;
    this.material.uTex.needsUpdate = true;

    this.visible = true;
  }
}
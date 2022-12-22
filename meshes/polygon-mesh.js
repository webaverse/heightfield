import metaversefile from "metaversefile";
import * as THREE from "three";
import {GRASS_COLORS_SHADER_CODE} from "../assets.js";
import {
  GET_COLOR_PARAMETER_NAME,
  maxAnisotropy,
  MAX_WORLD_HEIGHT,
  MIN_WORLD_HEIGHT,
  WIND_EFFECT_OVER_GRASS,
  WIND_SPEED,
  // bufferSize,
  WORLD_BASE_HEIGHT,
  TREE_ADDITIONAL_ATTRIBUTE
} from "../constants.js";
import {_disableOutgoingLights, _patchOnBeforeCompileFunction} from "../utils/utils.js";
import _createTreeMaterial from '../customShader/tree-material.js';
import _createBushMaterial from "../customShader/bush-material.js";
import _createGrassMaterial from "../customShader/grass-material.js";
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
  useInternals,
} = metaversefile;
const procGenManager = useProcGenManager();
const {createTextureAtlas} = useAtlasing();
const {InstancedBatchedMesh, InstancedGeometryAllocator} =
  useGeometryBatching();
const {gltfLoader} = useLoaders();
const lightsManager = useLightsManager();
const {camera} = useInternals();
const textureLoader = new THREE.TextureLoader();

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
// const localQuaternion = new THREE.Quaternion();
// const localEuler = new THREE.Euler();
// const localMatrix = new THREE.Matrix4();
const localBox = new THREE.Box3();

//
const _writeToTexture = (array, texture, textureOffset, index, number) => {
  const indexOffset = index * 4;
  for (let j = 0; j < number; j++) {
    const value = array[index * number + j];
    texture.image.data[textureOffset + indexOffset + j] = value;
  }
};

class TextureProps {
  constructor(texture, offset) {
    this.texture = texture;
    this.offset = offset;
  }
}
const _collectTextures = (drawCall, instanceAttributes) => {
  const textures = Array(instanceAttributes.length);
  for (let i = 0; i < instanceAttributes.length; i++) {
    const instanceAttribute = instanceAttributes[i];
    const textureProps = new TextureProps(drawCall.getTexture(instanceAttribute.name),drawCall.getTextureOffset(instanceAttribute.name));
    textures[i] = textureProps;
  }
  return textures;
};
const _renderPolygonGeometry = (
  drawCall,
  attributes,
  positionIndex,
  instanceAttributes,
) => {
  const numVerts = attributes[positionIndex].length;
  const step = instanceAttributes[positionIndex].itemSize;
  const textures = _collectTextures(drawCall, instanceAttributes);

  let index = 0;
  for (let j = 0; j < numVerts; j += step) {
    // geometry
    for (let i = 0; i < instanceAttributes.length; i++) {
      const instanceAttribute = instanceAttributes[i];
      _writeToTexture(
        attributes[i],
        textures[i].texture,
        textures[i].offset,
        index,
        instanceAttribute.itemSize,
      );
    }

    index++;
  }

  for (let i = 0; i < instanceAttributes.length; i++) {
    const instanceAttribute = instanceAttributes[i];
    drawCall.updateTexture(instanceAttribute.name, textures[i].offset, index * 4);
  }
};

const _storeShader = (material, shader) => {
  // storing the shader so we can access it later
  material.userData.shader = shader;
}

const _addDepthPackingShaderCode = shader => {
  return /* glsl */ `#define DEPTH_PACKING 3201` + "\n" + shader;
};

const _setupPolygonMeshShaderCode = (
  shader,
  {
    customUvParsVertex,
    customBeginVertex,
    customUvParsFragment,
    customColorFragment,
  }
) => {
  
  shader.vertexShader = shader.vertexShader.replace(
    `#include <uv_pars_vertex>`,
    customUvParsVertex,
  );
  shader.vertexShader = shader.vertexShader.replace(
    `#include <begin_vertex>`,
    customBeginVertex,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    `#include <uv_pars_fragment>`,
    customUvParsFragment,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    `#include <alphamap_fragment>`,
    customColorFragment,
  );
};

const _setupTextureAttributes = (
  shader,
  instanceAttributes,
  attributeTextures,
) => {
  for (let i = 0; i < instanceAttributes.length; i++) {
    const instanceAttribute = instanceAttributes[i];
    shader.uniforms[instanceAttribute.name + "Texture"] = {
      value: attributeTextures[instanceAttribute.name],
      needsUpdate: true,
    };
  }
};
const _textureError = (err) => {
  console.error('Liquid Package : Loading texture failed : ', err);
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

export class PolygonPackage {
  constructor(lodMeshes, textureNames, textures) {
    this.lodMeshes = lodMeshes;
    this.textureNames = textureNames;
    this.textures = textures;
  }

  static async loadUrls(urls, meshLodSpecs, physics, assetType = null, paths = null) {
    const _loadModel = u =>
      new Promise((accept, reject) => {
        gltfLoader.load(
          u,
          o => {
            accept(o.scene);
          },
          function onProgress() {},
          reject,
        );
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
    const _generateLodMesh = (() => {
      const promiseCache = new Map();
      return (mesh, meshLodSpec) => {
        const {targetRatio, targetError} = meshLodSpec;
        let promiseMap = promiseCache.get(mesh);
        if (!promiseMap) {
          promiseMap = new Map();
          promiseCache.set(mesh, promiseMap);
        }
        const key = `${targetRatio}:${targetError}`;
        let promise = promiseMap.get(key);
        if (!promise) {
          promise = (async () => {
            if (targetRatio === 1) {
              return mesh;
            } else {
              const lodMesh = await physics.meshoptSimplify(
                mesh,
                targetRatio,
                targetError,
              );
              return lodMesh;
            }
          })();
          promiseMap.set(key, promise);
        }
        return promise;
      };
    })();
    const _generateLodMeshes = async mesh => {
      const meshLodSpecKeys = Object.keys(meshLodSpecs).map(Number);
      const lodMeshes = await Promise.all(
        meshLodSpecKeys.map(async lod => {
          const meshLodSpec = meshLodSpecs[lod];
          const lodMesh = await _generateLodMesh(mesh, meshLodSpec);
          return lodMesh;
        }),
      );
      return lodMeshes;
    };

    const textures = {};
    if (paths) {
      const {shaderTexturePath} = paths;
      const mapObjectToArray = (obj) => {
        const res = [];
        for (const key in obj)
          res.push({key: key, value: obj[key]});
        return res;
      }
  
      const shaderTextureArray = mapObjectToArray(shaderTexturePath);
      const shaderTextures = await Promise.all(shaderTextureArray.map(_loadTexture))
      .then(function(arr) {
        const obj = {};
        for (let i = 0; i < shaderTextureArray.length; i ++) {
          obj[shaderTextureArray[i].key] = arr[i];
          if (shaderTextureArray[i].value[1]) {
            arr[i].wrapS = arr[i].wrapT = THREE.RepeatWrapping;
          }
        }
        return obj;
      });
      textures['shaderTextures'] = shaderTextures;
    }

    const attributeArray =  ["position", "normal", "uv"];

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
    }
    _setAdditionalAttribute(assetType, attributeArray);
    
    const models = await Promise.all(urls.map(_loadModel));
    const meshes = models.map(_getMesh);
    const textureAtlasResult = createTextureAtlas(meshes, {
      textures: ["map", "normalMap"],
      attributes: attributeArray,
    });
    const {meshes: atlasMeshes, textureNames} = textureAtlasResult;
    const lodMeshes = await Promise.all(atlasMeshes.map(_generateLodMeshes));

    const pkg = new PolygonPackage(lodMeshes, textureNames, textures);
    return pkg;
  }
}

//

const POLYGON_MESH_INSTANCE_ATTRIBUTES = [
  {
    name: "p", // position
    Type: Float32Array,
    itemSize: 3,
  },
  {
    name: "q", // quaternion
    Type: Float32Array,
    itemSize: 4,
  },
  {
    name: "s", // scale
    Type: Float32Array,
    itemSize: 1,
  },
  {
    name: "c", // color
    Type: Float32Array,
    itemSize: 3,
  },
];
export class PolygonMesh extends InstancedBatchedMesh {
  constructor({
    instance,
    lodCutoff,
    maxNumGeometries,
    maxInstancesPerGeometryPerDrawCall,
    maxDrawCallsPerGeometry,
    shadow,
    instanceAttributes = POLYGON_MESH_INSTANCE_ATTRIBUTES,
    assetType
  } = {}) {
    // allocator
    const allocator = new InstancedGeometryAllocator(instanceAttributes, {
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
      boundingType: "box",
    });
    const {textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }

    let geometry;

    // custom shaders
    const _setupUniforms = shader => {
      _setupTextureAttributes(shader, instanceAttributes, attributeTextures);
    };
    const customUvParsVertex = /* glsl */ `
      #undef USE_INSTANCING

      #include <uv_pars_vertex>

      attribute vec4 color;

      varying vec3 vColor;
      varying vec4 vertexColor;
      varying vec3 vSNormal;

      uniform sampler2D pTexture;
      uniform sampler2D qTexture;
      uniform sampler2D sTexture;
      uniform sampler2D cTexture;

      vec3 rotateVertexPosition(vec3 position, vec4 q) { 
        return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
      }
    `;

    const customBeginVertex = /* glsl */ `
      #include <begin_vertex>

      int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;
      const float width = ${attributeTextures.p.image.width.toFixed(8)};
      const float height = ${attributeTextures.p.image.height.toFixed(8)};
      float x = mod(float(instanceIndex), width);
      float y = floor(float(instanceIndex) / width);
      vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);

      vec3 p = texture2D(pTexture, pUv).xyz; // position
      vec4 q = texture2D(qTexture, pUv).xyzw; // quaternion
      float s = texture2D(sTexture, pUv).x; // scale
      vec3 c = texture2D(cTexture, pUv).xyz; // color

      transformed *= s; // scale
      transformed = rotateVertexPosition(transformed, q);
      transformed += p;

      vColor = c;
      vertexColor = color;
      vSNormal = normal;
    `;

    const customUvParsFragment = /* glsl */ `
      #undef USE_INSTANCING

      #include <uv_pars_fragment>

      varying vec3 vColor;
      varying vec4 vertexColor;
      varying vec3 vSNormal;
    `;

    const customColorFragment = /* glsl */ `
      #include <alphamap_fragment>
    `;

    const _craeteDefaultMaterial = () => {
      const m = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.1,
        onBeforeCompile: shader => {
          _setupUniforms(shader);
          _setupPolygonMeshShaderCode(shader, {
            customUvParsVertex,
            customBeginVertex,
            customUvParsFragment,
            customColorFragment,
          });
          return shader;
        },
      });
      _disableOutgoingLights(m);
      return m;
    }
    
    let material;
    switch (assetType) {
      case 'tree': {
        material = _createTreeMaterial(attributeTextures, maxInstancesPerGeometryPerDrawCall);
        break;
      }
      case 'bush': {
        material = _createBushMaterial(attributeTextures, maxInstancesPerGeometryPerDrawCall);
        break;
      }
      default: {
        material = _craeteDefaultMaterial();
        break;
      }
    }
    
    const customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaTest: 0.5,
    });
    customDepthMaterial.onBeforeCompile = shader => {
      _setupUniforms(shader);
      _setupPolygonMeshShaderCode(shader, {
        customUvParsVertex: _addDepthPackingShaderCode(customUvParsVertex),
        customBeginVertex: customBeginVertex,
        customUvParsFragment: _addDepthPackingShaderCode(customUvParsFragment),
        customColorFragment,
      });
    };

    const customDistanceMaterial = new THREE.MeshDistanceMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaTest: 0.5,
    });
    customDistanceMaterial.onBeforeCompile = shader => {
      _setupUniforms(shader);
      _setupPolygonMeshShaderCode(shader, {
        customUvParsVertex: _addDepthPackingShaderCode(customUvParsVertex),
        customBeginVertex: customBeginVertex,
        customUvParsFragment: _addDepthPackingShaderCode(customUvParsFragment),
        customColorFragment,
      });
    };

    // mesh
    super(geometry, material, allocator);
    this.frustumCulled = false;
    this.visible = false;
    this.assetType = assetType;

    this.instanceAttributes = instanceAttributes;
    this.positionIndex = this.instanceAttributes.findIndex(
      instanceAttribute => instanceAttribute.name === "p",
    );

    if (shadow) {
      // ? See more details here : https://discourse.threejs.org/t/shadow-for-instances/7947/10
      this.customDepthMaterial = customDepthMaterial;
      this.customDistanceMaterial = customDistanceMaterial;
      this.castShadow = true;
      this.receiveShadow = true;
    }

    this.instance = instance;
    this.lodCutoff = lodCutoff;

    this.allocatedChunks = new Map();
  }

  addChunk(chunk, chunkResult) {
    if (chunkResult) {
      const instances = chunkResult;
      if (chunk.lod < this.lodCutoff && instances.length > 0) {
        const {chunkSize} = this.instance;
        const boundingBox = localBox.set(
          localVector.set(
            chunk.min.x * chunkSize,
            -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
            chunk.min.y * chunkSize,
          ),
          localVector2.set(
            (chunk.min.x + chunk.lod) * chunkSize,
            -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
            (chunk.min.y + chunk.lod) * chunkSize,
          ),
        );
        const lodIndex = Math.log2(chunk.lod);
        const drawChunks = Array(instances.length);
        for (let i = 0; i < instances.length; i++) {
          const {instanceId, ps, qs, scales, colors} = instances[i];
          const geometryIndex = instanceId;
          const numInstances = ps.length / 3;

          const drawChunk = this.allocator.allocDrawCall(
            geometryIndex,
            lodIndex,
            numInstances,
            boundingBox,
          );
          const attributes = [ps, qs, scales, colors];

          _renderPolygonGeometry(drawChunk, attributes, this.positionIndex, this.instanceAttributes);
          drawChunks[i] = drawChunk;
        }
        const key = procGenManager.getNodeHash(chunk);
        this.allocatedChunks.set(key, drawChunks);
      }
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

  grabInstance(physicsId) {
    const phys = metaversefile.getPhysicsObjectByPhysicsId(physicsId);
    this.physics.removeGeometry(phys);
    const drawcall = this.instanceObjects.get(physicsId);
    drawcall.decrementInstanceCount();
  }

  update(timestamp) {
    if (lightsManager.lights.length > 0) {
      const sunMoonRotationRadius = 500;
      for (const light of lightsManager.lights) {
        if (light.isDirectionalLight) {
          this.material.uniforms.lightPos.value.copy(light.position).multiplyScalar(sunMoonRotationRadius);
          this.material.uniforms.lightIntensity.value = light.intensity;
          break;
        }
      }
    }
    
    this.material.uniforms.uTime.value = timestamp / 1000;
    this.material.uniforms.eye.value.copy(camera.position);
  }
  getAdditionalAttribute(assetType) {
    switch (assetType) {
      case 'tree': {
        return TREE_ADDITIONAL_ATTRIBUTE;
      }
      default: {
        return [];
      }
    }
  }
  setPackage(pkg) {
    // console.log('set package', pkg);
    const {lodMeshes, textureNames, textures} = pkg;
    const additionalAttributeSpecs = this.getAdditionalAttribute(this.assetType);
    this.allocator.setGeometries(
      lodMeshes.map(lodMeshesArray => {
        return lodMeshesArray.map(lodMesh => {
          return lodMesh.geometry;
        });
      }), additionalAttributeSpecs
    );
    this.geometry = this.allocator.geometry;
    
    for (const textureName of textureNames) {
      this.material[textureName] = lodMeshes[0][0].material[textureName];
    }

    if (this.material.uniforms) {
      this.material.uniforms.map.value = this.material.map;
      this.material.uniforms.noiseTexture.value = textures.shaderTextures.noiseTexture;
    }
    this.visible = true;
  }
}

const GRASS_INSTANCE_ATTRIBUTES = [
  {
    name: "p", // position
    Type: Float32Array,
    itemSize: 3,
  },
  {
    name: "q", // quaternion
    Type: Float32Array,
    itemSize: 4,
  },
  {
    name: "s", // scale
    Type: Float32Array,
    itemSize: 1,
  },
  {
    name: "c", // color
    Type: Float32Array,
    itemSize: 3,
  },
  {
    name: "materials",
    Type: Float32Array,
    itemSize: 4,
  },
  {
    name: "materialsWeights",
    Type: Float32Array,
    itemSize: 4,
  },
  {
    name: "grassProps",
    Type: Float32Array,
    itemSize: 4,
  },
];

export class GrassPolygonMesh extends InstancedBatchedMesh {
  constructor({
    instance,
    lodCutoff,
    maxNumGeometries,
    maxInstancesPerGeometryPerDrawCall,
    maxDrawCallsPerGeometry,
    shadow,
    instanceAttributes = GRASS_INSTANCE_ATTRIBUTES,
  } = {}) {
    // allocator
    const allocator = new InstancedGeometryAllocator(instanceAttributes, {
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
      boundingType: "box",
    });
    const {textures: attributeTextures} = allocator;
    for (const k in attributeTextures) {
      const texture = attributeTextures[k];
      texture.anisotropy = maxAnisotropy;
    }

    let geometry;

    // custom shaders
    const _setupUniforms = shader => {
      _setupTextureAttributes(shader, instanceAttributes, attributeTextures);
      shader.uniforms.uGrassBladeHeight = {
        value: null,
      };
      shader.uniforms.uTime = {
        value: 0,
      };
    };

    const customUvParsVertex = /* glsl */ `
      #undef USE_INSTANCING

      #include <uv_pars_vertex>

      uniform sampler2D pTexture;
      uniform sampler2D qTexture;
      uniform sampler2D cTexture;
      uniform sampler2D sTexture;
      uniform sampler2D materialsTexture;
      uniform sampler2D materialsWeightsTexture;
      uniform sampler2D grassPropsTexture;
      uniform float uGrassBladeHeight;
      uniform float uTime;

      varying vec2 vObjectUv;
      varying vec3 vObjectNormal;
      varying vec3 vPosition;
      varying vec3 vColor;

      flat varying ivec4 vMaterials;
      varying vec4 vMaterialsWeights;

      varying float vGrassHeight;

      vec3 rotateVertexPosition(vec3 position, vec4 q) { 
        return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
      }
    `;

    const customBeginVertex = /* glsl */ `
      #include <begin_vertex>

      int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;

      const float width = ${attributeTextures.p.image.width.toFixed(8)};
      const float height = ${attributeTextures.p.image.height.toFixed(8)};

      float x = mod(float(instanceIndex), width);
      float y = floor(float(instanceIndex) / width);
      vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);

      vec3 p = texture2D(pTexture, pUv).xyz; // position
      vec4 q = texture2D(qTexture, pUv).xyzw; // quaternion
      float s = texture2D(sTexture, pUv).x; // scale
      vec3 c = texture2D(cTexture, pUv).xyz; // color

      vec4 materials = texture2D(materialsTexture, pUv).xyzw;
      vec4 materialsWeights = texture2D(materialsWeightsTexture, pUv).xyzw;

      vec4 grassProps = texture2D(grassPropsTexture, pUv).xyzw;

      float randomBladeValue = grassProps.x;
      float grassHeightMultiplier = grassProps.w;

      // * Grass Height Range -> [0.0, 1.0]
      float grassHeight = transformed.y / uGrassBladeHeight * grassHeightMultiplier;
      vec3 scaledPosition = transformed;
      scaledPosition *= s; // scale
      scaledPosition.y *= grassHeight; // height scale

      // height
      float grassWorldHeight = grassHeight * s;

      // wind
      float windSpeed = uTime * randomBladeValue * ${WIND_SPEED};
      float wind = sin(windSpeed) * grassWorldHeight * ${WIND_EFFECT_OVER_GRASS};

      // transform processing
      transformed = rotateVertexPosition(scaledPosition, q);
      transformed += p;
      transformed.x += wind;

      // vObjectUv = uv;
      vObjectNormal = normal;
      vPosition = transformed;
      vColor = c;
      vGrassHeight = grassWorldHeight;
      vMaterials = ivec4(materials);
      vMaterialsWeights = materialsWeights;
      `;

    const customUvParsFragment = /* glsl */ `
      #undef USE_INSTANCING

      #include <uv_pars_fragment>

      varying vec2 vObjectUv;
      varying vec3 vObjectNormal;
      varying vec3 vPosition;
      varying vec3 vColor;

      flat varying ivec4 vMaterials;
      varying vec4 vMaterialsWeights;

      varying float vGrassHeight;

      uniform float uTime;

      vec3 getGrassColor(int ${GET_COLOR_PARAMETER_NAME}) {
        ${GRASS_COLORS_SHADER_CODE};
      }
      vec3 blendSamples(vec3 samples[4], vec4 weights) {
        float weightSum = weights.x + weights.y + weights.z + weights.w;
        return (samples[0] * weights.x + samples[1] * weights.y + samples[2] * weights.z + samples[3] * weights.w) / weightSum;
      }
      vec3 blendGrassColors(ivec4 materials, vec4 weights) {
        vec3 samples[4];

        samples[0] = getGrassColor(materials.x);
        samples[1] = getGrassColor(materials.y);
        samples[2] = getGrassColor(materials.z);
        samples[3] = getGrassColor(materials.w);

        return blendSamples(samples, weights);
      }
    `;

    const customColorFragment = /* glsl */ `
      #include <alphamap_fragment>

      float grassAlpha = diffuseColor.a * vGrassHeight;
      vec3 grassColor = blendGrassColors(vMaterials, vMaterialsWeights);

      grassColor.r += vGrassHeight / 1.5;
      grassColor.g += vGrassHeight / 1.5;
      grassColor.b += vGrassHeight / 4.0;

      grassColor *= vColor;

      grassColor = clamp(grassColor, 0.0, 0.85);
      if (diffuseColor.a < 0.5) {
        discard;
      }
      diffuseColor = vec4(grassColor, 1.0);
      
    `;

    // material
    const material = new THREE.MeshLambertMaterial({
      metalness: 0.8,
      roughness: 0.1,
      side: THREE.DoubleSide,
      // transparent: true,
      // depthWrite: false,
      // alphaTest: 0.01,
      onBeforeCompile: shader => {
        _storeShader(material, shader);
        _setupUniforms(shader);
        _setupPolygonMeshShaderCode(shader, {
          customUvParsVertex,
          customBeginVertex,
          customUvParsFragment,
          customColorFragment,
        });


        return shader;
      },
    });

    _disableOutgoingLights(material);

    // const material = _createGrassMaterial(attributeTextures, maxInstancesPerGeometryPerDrawCall)

    const customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaTest: 0.5,
    });
    customDepthMaterial.onBeforeCompile = shader => {
      _setupUniforms(shader);
      _setupPolygonMeshShaderCode(shader, {
        customUvParsVertex: _addDepthPackingShaderCode(customUvParsVertex),
        customBeginVertex: customBeginVertex,
        customUvParsFragment: _addDepthPackingShaderCode(customUvParsFragment),
        customColorFragment,
      });
    };

    const customDistanceMaterial = new THREE.MeshDistanceMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaTest: 0.5,
    });
    customDistanceMaterial.onBeforeCompile = shader => {
      _setupUniforms(shader);
      _setupPolygonMeshShaderCode(shader, {
        customUvParsVertex: _addDepthPackingShaderCode(customUvParsVertex),
        customBeginVertex: customBeginVertex,
        customUvParsFragment: _addDepthPackingShaderCode(customUvParsFragment),
        customColorFragment,
      });
    };

    // mesh
    super(geometry, material, allocator);

    this.instanceAttributes = instanceAttributes;
    this.positionIndex = this.instanceAttributes.findIndex(
      instanceAttribute => instanceAttribute.name === "p",
    );

    this.shadow = shadow;

    if (shadow) {
      // ? See more details here : https://discourse.threejs.org/t/shadow-for-instances/7947/10
      this.customDepthMaterial = customDepthMaterial;
      this.customDistanceMaterial = customDistanceMaterial;
      // this.castShadow = true;
      this.receiveShadow = true;
    }

    this.frustumCulled = false;
    this.visible = false;

    this.instance = instance;
    this.lodCutoff = lodCutoff;

    this.allocatedChunks = new Map();
  }

  addChunk(chunk, instances) {
    if (instances) {
      if (chunk.lod < this.lodCutoff && instances.length > 0) {
        const {chunkSize} = this.instance;
        const boundingBox = localBox.set(
          localVector.set(
            chunk.min.x * chunkSize,
            -WORLD_BASE_HEIGHT + MIN_WORLD_HEIGHT,
            chunk.min.y * chunkSize,
          ),
          localVector2.set(
            (chunk.min.x + chunk.lod) * chunkSize,
            -WORLD_BASE_HEIGHT + MAX_WORLD_HEIGHT,
            (chunk.min.y + chunk.lod) * chunkSize,
          ),
        );
        const lodIndex = Math.log2(chunk.lod);
        const drawChunks = Array(instances.length);
        for (let i = 0; i < instances.length; i++) {
          const {instanceId, ps, qs, scales, colors, materials, materialsWeights, grassProps} =
            instances[i];
          const geometryIndex = instanceId;
          const numInstances = ps.length / 3;

          const drawChunk = this.allocator.allocDrawCall(
            geometryIndex,
            lodIndex,
            numInstances,
            boundingBox,
          );
          const attributes = [ps, qs, scales, colors, materials, materialsWeights, grassProps];
          _renderPolygonGeometry(
            drawChunk,
            attributes,
            this.positionIndex,
            this.instanceAttributes
          );
          drawChunks[i] = drawChunk;
        }
        const key = procGenManager.getNodeHash(chunk);
        this.allocatedChunks.set(key, drawChunks);
      }
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

  grabInstance(physicsId) {
    const phys = metaversefile.getPhysicsObjectByPhysicsId(physicsId);
    this.physics.removeGeometry(phys);
    const drawcall = this.instanceObjects.get(physicsId);
    drawcall.decrementInstanceCount();
  }

  update(timestamp) {
    const shader = this.material.userData.shader;
    if(shader) {
      shader.uniforms.uTime.value = timestamp / 1000;
    }
  }

  setPackage(pkg) {
    const {lodMeshes, textureNames} = pkg;

    const LOD0Mesh = lodMeshes[0][0];
    localBox.setFromObject(LOD0Mesh);

    const LOD0MeshHeight = localBox.getSize(localVector).y;

    this.allocator.setGeometries(
      lodMeshes.map(lodMeshesArray => {
        return lodMeshesArray.map(lodMesh => {
          return lodMesh.geometry;
        });
      }),
    );
    this.geometry = this.allocator.geometry;

    for (const textureName of textureNames) {
      this.material[textureName] = lodMeshes[0][0].material[textureName];
    }
    // if (!this.material.uniforms.map.value) {
    //   this.material.uniforms.map.value = this.material.map;
    // }
    const setUniforms = shader => {
      shader.uniforms.uGrassBladeHeight = {value: LOD0MeshHeight};
    };
    // this.material.uniforms.uGrassBladeHeight.value = LOD0MeshHeight;
    _patchOnBeforeCompileFunction(this.material, setUniforms);
    if (this.shadow) {
      _patchOnBeforeCompileFunction(this.customDepthMaterial, setUniforms);
      _patchOnBeforeCompileFunction(this.customDistanceMaterial, setUniforms);
    }

    this.visible = true;
  }
}
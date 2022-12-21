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
} from "../constants.js";
import {_disableOutgoingLights, _patchOnBeforeCompileFunction} from "../utils/utils.js";
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

export class PolygonPackage {
  constructor(lodMeshes, textureNames) {
    this.lodMeshes = lodMeshes;
    this.textureNames = textureNames;
  }

  static async loadUrls(urls, meshLodSpecs, physics, assetType) {
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
    const attributeArray =  ["position", "normal", "uv"];
    if (assetType === 'tree') {
      attributeArray.push('color');
    }
    const models = await Promise.all(urls.map(_loadModel));
    const meshes = models.map(_getMesh);
    const textureAtlasResult = createTextureAtlas(meshes, {
      textures: ["map", "normalMap"],
      attributes: attributeArray,
    });
    const {meshes: atlasMeshes, textureNames} = textureAtlasResult;
    const lodMeshes = await Promise.all(atlasMeshes.map(_generateLodMeshes));

    const pkg = new PolygonPackage(lodMeshes, textureNames);
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
    let material;
    if (assetType === 'tree' || assetType === 'bush') {
      material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {
            value: 0
          },
          map: {
            value: null
          },
          pTexture: {
            value: attributeTextures.p,
            needsUpdate: true,
          },
          qTexture: {
            value: attributeTextures.q,
            needsUpdate: true,
          },
          lightPos: {
            value: new THREE.Vector3()
          },
          eye: {
            value: new THREE.Vector3()
          }
        },
        vertexShader: `\
            
          ${THREE.ShaderChunk.common}
          ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
          attribute vec4 color;
          
          varying vec2 vUv;
          varying vec3 vWorldPosition;
          varying vec4 vColor;
          varying vec3 vNormal;
          
          uniform float uTime;
          uniform sampler2D pTexture;
          uniform sampler2D qTexture;

          vec3 rotate_vertex_position(vec3 position, vec4 q) { 
            return position + 2.0 * cross(q.xyz, cross(q.xyz, position) + q.w * position);
          }
          
          void main() {
            vUv = uv;
            vColor = color;
            vNormal = normal;

            int instanceIndex = gl_DrawID * ${maxInstancesPerGeometryPerDrawCall} + gl_InstanceID;
            const float width = ${attributeTextures.p.image.width.toFixed(8)};
            const float height = ${attributeTextures.p.image.height.toFixed(8)};
            float x = mod(float(instanceIndex), width);
            float y = floor(float(instanceIndex) / width);
            vec2 pUv = (vec2(x, y) + 0.5) / vec2(width, height);
            vec3 p = texture2D(pTexture, pUv).xyz;
            vec4 q = texture2D(qTexture, pUv).xyzw;

            vec3 pos = position; 
            vNormal = rotate_vertex_position(vNormal, q);
            pos = rotate_vertex_position(pos, q);
            pos += p;

            vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectionPosition = projectionMatrix * viewPosition;
            vWorldPosition = modelPosition.xyz;
            gl_Position = projectionPosition;
            ${THREE.ShaderChunk.logdepthbuf_vertex}
          }
        `,
        fragmentShader: `\
            ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
            #include <common>

            uniform float uTime;
            uniform vec3 eye;
            uniform vec3 lightPos;
            uniform sampler2D map;

            varying vec2 vUv;
            varying vec4 vColor;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;

            float DGGX(float a2, float NoH){
              float d = (NoH * a2 - NoH) * NoH + 1.; 
              return a2 / (PI * d * d);         
            }
            float WrapRampNL(float nl, float threshold, float smoothness) {
              nl = smoothstep(threshold - smoothness * 0.5, threshold + smoothness * 0.5, nl);
              return nl;
            }
            // cosine gradient 
            const float TAU = 2. * 3.14159265;
            const vec4 phases = vec4(0.34, 0.48, 0.27, 0);
            const vec4 amplitudes = vec4(4.02, 0.34, 0.65, 0);
            const vec4 frequencies = vec4(0.00, 0.48, 0.08, 0);
            const vec4 offsets = vec4(0.21, 0.33, 0.06, -0.38);
            vec4 cosGradient(float x, vec4 phase, vec4 amp, vec4 freq, vec4 offset){
              phase *= TAU;
              x *= TAU;
              return vec4(
                offset.r + amp.r * 0.5 * cos(x * freq.r + phase.r) + 0.5,
                offset.g + amp.g * 0.5 * cos(x * freq.g + phase.g) + 0.5,
                offset.b + amp.b * 0.5 * cos(x * freq.b + phase.b) + 0.5,
                offset.a + amp.a * 0.5 * cos(x * freq.a + phase.a) + 0.5
              );
            }
      
            void main() {
              vec3 eyeDirection = normalize(eye - vWorldPosition);
              vec3 surfaceNormal = normalize(vNormal);
              vec3 lightDir = normalize(lightPos);
              float NdotL = max(0.0, dot(lightDir, surfaceNormal));
              bool isLeaf = vColor.r > 0.1;
              vec4 col;
              vec4 treeColor;
              if (isLeaf) {
                vec4 leaf = texture2D(map, vUv);
                treeColor = leaf;
                gl_FragColor.a = treeColor.a;
              }
              else {
                vec4 bark = texture2D(map, vUv);
                treeColor = bark;
                gl_FragColor.a = treeColor.a;
              }
              if (gl_FragColor.a < 0.9) {
                discard;
              }

              vec4 cosGradColor = cosGradient(NdotL, phases, amplitudes, frequencies, offsets);
              vec3 ambient = cosGradColor.rgb;
              float albedoLerp = 0.7;
              vec3 albedo = mix(vec3(0.0399, 0.570, 0.164), vec3(0.483, 0.950, 0.171), NdotL + albedoLerp).rgb;
              vec3 diffuse = mix(ambient.rgb * albedo.rgb, albedo.rgb, NdotL);
              vec3 lightToEye = normalize(lightPos + eye);
              float specularRoughness = 0.6;
              float specularIntensity = 0.9;
              float specular = DGGX(specularRoughness * specularRoughness, NdotL);
              // vec3 specularColor = albedo * specular * specularIntensity;
              vec3 specularColor = isLeaf ? albedo * specular * specularIntensity : vec3(specular * specularIntensity);
              vec3 backLightDir = normalize(surfaceNormal + lightPos);
              float backSSS = saturate(dot(eyeDirection, -backLightDir));
              float backSSSIntensity = (1. - saturate(dot(eyeDirection, surfaceNormal))) * 1.0;
              backSSS = saturate(dot(pow(backSSS, 10.), backSSSIntensity));

              float colorIntensity = 0.3;
              
              if (isLeaf) {
                gl_FragColor.rgb = (diffuse + albedo + specularColor) * colorIntensity;
                gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.6, gl_FragColor.rgb, treeColor.r);
                
                // float topColor = dot(vec3(0.0, 1.0, 0.0), surfaceNormal) * 0.5 + 0.5;
                // gl_FragColor.rgb *= smoothstep(0.1, 0.99, topColor);
                
                gl_FragColor.rgb += backSSS;
              }
              else {
                gl_FragColor.rgb = (treeColor.rgb + specularColor) * colorIntensity * 0.5;
              }
              ${THREE.ShaderChunk.logdepthbuf_fragment}
            }
        `,
        side: THREE.DoubleSide,
        transparent: true,
      });
    }
    else {
      // material
      material = new THREE.MeshStandardMaterial({
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
      _disableOutgoingLights(material);
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
          break;
        }
      }
    }
    if (!this.material.uniforms.map.value) {
      this.material.uniforms.map.value = this.material.map;
    }
    this.material.uniforms.eye.value.copy(camera.position);
  }

  setPackage(pkg) {
    // console.log('set package', pkg);
    const {lodMeshes, textureNames} = pkg;
    const additionalAttributeSpecs = [];
    if (this.assetType === 'tree') {
      additionalAttributeSpecs.push(
        {
          name: "color",
          itemSize: 4,
        }
      )
    }
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

      diffuseColor = vec4(grassColor, grassAlpha);
    `;

    // material
    const material = new THREE.MeshLambertMaterial({
      metalness: 0.8,
      roughness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
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

    const setUniforms = shader => {
      shader.uniforms.uGrassBladeHeight = {value: LOD0MeshHeight};
    };

    _patchOnBeforeCompileFunction(this.material, setUniforms);
    if (this.shadow) {
      _patchOnBeforeCompileFunction(this.customDepthMaterial, setUniforms);
      _patchOnBeforeCompileFunction(this.customDistanceMaterial, setUniforms);
    }

    this.visible = true;
  }
}
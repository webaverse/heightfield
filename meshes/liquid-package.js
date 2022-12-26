import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useLoaders} = metaversefile;

const {gltfLoader} = useLoaders();

const textureLoader = new THREE.TextureLoader();
const cubeMaploader = new THREE.CubeTextureLoader();

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

const _loadModel = (u) => 
  new Promise((accept, reject) => {
    gltfLoader.load(u.value, o => {
      accept(o);
    }, function onProgress() {}, reject);
  });

class LiquidPackage {
  constructor(textures, models) {
    this.textures = textures;
    this.models = models;
  }

  static async loadUrls(paths) {
    const {particleTexturePath, particleGLBPath, shaderTexturePath, cubeMapPath} = paths;

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

    const particleTextureArray = mapObjectToArray(particleTexturePath);
    const particleTextures = await Promise.all(particleTextureArray.map(_loadTexture))
    .then(function(arr) {
      const obj = {};
      for (let i = 0; i < particleTextureArray.length; i ++) {
        obj[particleTextureArray[i].key] = arr[i];
        if (particleTextureArray[i].value[1]) {
          arr[i].wrapS = arr[i].wrapT = THREE.RepeatWrapping;
        }
      }
      return obj;
    });

    const particleGLBArray = mapObjectToArray(particleGLBPath);
    const particleModels = await Promise.all(particleGLBArray.map(_loadModel))
    .then(function(arr) {
      const obj = {};
      for (let i = 0; i < particleGLBArray.length; i ++) {
        obj[particleGLBArray[i].key] = arr[i];
      }
      return obj;
    });

    
    cubeMaploader.setPath(cubeMapPath);
    const textureCube = cubeMaploader.load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);

    const models = {};
    models['particleModels'] = particleModels;

    const textures = {};
    textures['shaderTextures'] = shaderTextures;
    textures['textureCube'] = textureCube;
    textures['particleTextures'] = particleTextures;
    // * Create new package
    const pkg = new LiquidPackage(textures, models);
    return pkg;
  }
}

export default LiquidPackage;

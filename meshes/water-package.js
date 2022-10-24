import * as THREE from 'three';
import metaversefile from 'metaversefile';
const {useLoaders} = metaversefile;

const textureLoader = new THREE.TextureLoader();
const {gltfLoader} = useLoaders();

const _textureError = (err) => {
  console.error('Water Package : Loading texture failed : ', err);
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

class WaterPackage {
  constructor(textures, models) {
    this.textures = textures;
    this.models = models;
  }

  static async loadUrls(paths) {
    const {particleTexturePath, particleGLBPath} = paths;

    const mapObjectToArray = (obj) => {
      const res = [];
      for (const key in obj)
        res.push({key: key, value: obj[key]});
      return res;
    }

    const particleTextureArray = mapObjectToArray(particleTexturePath);
    const particleTextures = await Promise.all(particleTextureArray.map(_loadTexture))
    .then(function(arr) {
      const obj = {};
      for (let i= 0; i < particleTextureArray.length; i++) {
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
      for (let i= 0; i < particleGLBArray.length; i++) {
        obj[particleGLBArray[i].key] = arr[i];
      }
      return obj;
    });
    
    const textures = {};
    textures['particleTextures'] = particleTextures;

    const models = {};
    models['particleModels'] = particleModels;

    // * Create new package
    const pkg = new WaterPackage(textures, models);
    return pkg;
  }
}

export default WaterPackage;

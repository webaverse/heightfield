import * as THREE from 'three';

// Taken from https://github.com/mrdoob/three.js/issues/758
const _getImageData = (image) => {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  return context.getImageData(0, 0, image.width, image.height);
}

class TextureAtlas {
  constructor() {
    this.onLoadFunctions = [];

    this.onLoadFn = () => {
      this.onLoadFunctions.forEach((fn) => {
        fn();
      });
    };

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    const ctx = canvas.getContext("2d");

    document.body.appendChild(canvas);
    console.log(canvas);

    this.manager = new THREE.LoadingManager();
    this.loader = new THREE.TextureLoader(this.manager);
    this.textures = {};

    this.manager.onLoad = () => {
      this.onLoad();
    };
  }

  load(atlas, names) {
    this.textures[atlas] = {
      textures: names.map(n => this.loader.load(n)),
    };
  }

  get data() {
    return this.textures;
  }

  runOnLoad(onLoadFn) {
    this.onLoadFunctions.push(onLoadFn);
  }

  onLoad() {
    for (const k in this.textures) {
      const atlas = this.textures[k];
      const data = new Uint8Array(atlas.textures.length * 4 * 1024 * 1024);

      for (let t = 0; t < atlas.textures.length; t++) {
        const curTexture = atlas.textures[t];
        const curData = _getImageData(curTexture.image);
        const offset = t * (4 * 1024 * 1024);
        data.set(curData, offset);
      }

      const dataTexture = new THREE.DataArrayTexture(
        data,
        1024,
        1024,
        atlas.textures.length
      );
      dataTexture.format = THREE.RGBAFormat;
      dataTexture.type = THREE.UnsignedByteType;
    //   dataTexture.minFilter = THREE.LinearMipMapLinearFilter;
    //   dataTexture.magFilter = THREE.NearestFilter;
      dataTexture.wrapS = THREE.RepeatWrapping;
      dataTexture.wrapT = THREE.RepeatWrapping;
    //   dataTexture.generateMipmaps = true;
    //   dataTexture.anisotropy = 4;

      atlas.atlas = dataTexture;
    }

    this.onLoadFn();
  }
}

export default TextureAtlas;
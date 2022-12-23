import * as THREE from "three";
import {PolygonMesh, PolygonPackage} from "../meshes/polygon-mesh.js";
import {
  SpritesheetMesh,
  SpritesheetPackage,
} from "../meshes/spritesheet-mesh.js";

import {polygonTextureUrlSpecs} from "../assets.js";
//

//
const SHADER_TEXTURE_PATHS = polygonTextureUrlSpecs.shaderTexturePath;

const spriteLodCutoff = 8;
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
const maxNumGeometries = 1;
const maxInstancesPerGeometryPerDrawCall = 8192;
const maxDrawCallsPerGeometry = 256;

//

export class InstancedObjectMesh extends THREE.Object3D {
  constructor({instance, physics, urls, shadow, assetType, hasCustomShading}) {
    super();

    this.urls = urls;
    this.assetType = assetType;
    this.hasCustomShading = hasCustomShading;

    this.polygonMesh = new PolygonMesh({
      instance,
      lodCutoff: spriteLodCutoff,
      maxNumGeometries,
      maxInstancesPerGeometryPerDrawCall,
      maxDrawCallsPerGeometry,
      shadow,
      assetType
    });
    this.add(this.polygonMesh);

    this.spritesheetMesh = new SpritesheetMesh({
      instance,
      lodCutoff: spriteLodCutoff,
    });
    this.add(this.spritesheetMesh);

    this.physics = physics;
  }

  update(timestamp) {
    this.spritesheetMesh.update(timestamp);
  }

  addChunk(chunk, chunkResult) {
    this.polygonMesh.addChunk(chunk, chunkResult);
    this.spritesheetMesh.addChunk(chunk, chunkResult);
  }

  removeChunk(chunk) {
    this.polygonMesh.removeChunk(chunk);
    this.spritesheetMesh.removeChunk(chunk);
  }

  async waitForLoad() {
    const paths = {
      shaderTexturePath: SHADER_TEXTURE_PATHS,
    };
    const [polygonPackage, spritesheetPackage] = await Promise.all([
      PolygonPackage.loadUrls(this.urls, meshLodSpecs, this.physics, this.assetType, paths),
      SpritesheetPackage.loadUrls(this.urls, this.hasCustomShading, this.assetType, paths),
    ]);
    this.polygonMesh.setPackage(polygonPackage);
    this.spritesheetMesh.setPackage(spritesheetPackage, this.hasCustomShading);
  }
}

export class InstancedObjectGroup extends THREE.Object3D {
  constructor({instance, urls, physics, shadow, assetType, hasCustomShading}) {
    super();

    this.urls = urls;
    this.meshes = [];

    for (let i = 0; i < urls.length; i++) {
      const meshUrl = urls[i];
      const mesh = new InstancedObjectMesh({
        urls: [meshUrl],
        shadow,
        instance,
        physics,
        assetType,
        hasCustomShading,
      });
      this.meshes.push(mesh);
      this.add(mesh);
    }
  }

  update() {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.update();
    }
  }

  addChunk(chunk, chunkResults) {
    if (chunkResults) {
      for (let i = 0; i < this.meshes.length; i++) {
        const mesh = this.meshes[i];
        const chunkResult = chunkResults[i];
        if(chunkResult) {
          const chunkResultInstances = chunkResult.instances;
          mesh.addChunk(chunk, chunkResultInstances);
        }
      }
    }
  }

  removeChunk(chunk) {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.removeChunk(chunk);
    }
  }

  async waitForLoad() {
    await Promise.all(
      this.meshes.map((mesh, i) => {
        mesh.waitForLoad();
      }),
    );
  }
}
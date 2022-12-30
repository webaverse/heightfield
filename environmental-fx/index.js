import * as THREE from 'three';
import metaversefile from 'metaversefile';

import { getFireflies } from './fireflies.js';
import { getButterflies } from './butterflies.js';
import { getLeaf } from './leaf.js';


const {useLocalPlayer, useInternals, useEnvironmentSfxManager} = metaversefile;
const environmentSfxManager = useEnvironmentSfxManager();

export class EnvironmentalFx {
  constructor(app) {
    this.app = app;
    this.environmentalObjects = [];
    
    this.player = useLocalPlayer();
    this.camera = useInternals().camera;

    this.butterflies = getButterflies(10, this.player);
    this.app.add(this.butterflies);

    
    this.fireflies = getFireflies(50, this.player,  this.camera);
    this.app.add(this.fireflies);

    this.leaf = getLeaf(20, this.player);
    this.app.add(this.leaf);

    this.azimuth = 0.4;
    this.day = false;
  }
  
  update(timestamp) {
    this.azimuth = (0.05 + (Date.now() / 5000) * 0.1) % 1;
    if (this.azimuth < 0.5) {
      environmentSfxManager.setSfxEnvironment('forest');
      this.day = true;
    } else {
      environmentSfxManager.setSfxEnvironment('marsh');
      this.day = false;
    }
    this.butterflies.update(timestamp);
    this.fireflies.update(timestamp, this.day);
    this.leaf.update(timestamp);
  }
}
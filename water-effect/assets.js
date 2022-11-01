export const procgenAssetsBaseUrl = `https://webaverse.github.io/procgen-assets/`;

export const glbUrlSpecs = {
  particleGLBPath: {
    ripple: `${procgenAssetsBaseUrl}water/water-particle/ripple.glb`,
    dome: `${procgenAssetsBaseUrl}water/water-particle/dome.glb`,
  },
};

export const textureUrlSpecs = {
  particleTexturePath: {
    voronoiNoiseTexture: [`${procgenAssetsBaseUrl}water/water-particle/textures/voronoiNoise.jpg`, true],
    noiseMap: [`${procgenAssetsBaseUrl}water/water-particle/textures/noise.jpg`, true],
    noiseMap2: [`${procgenAssetsBaseUrl}water/water-particle/textures/noise2.png`, true],
    noiseCircleTexture: [`${procgenAssetsBaseUrl}water/water-particle/textures/noiseCircle6.png`, false],
    rippleTexture: [`${procgenAssetsBaseUrl}water/water-particle/textures/ripple2.png`, true],
    splashTexture2: [`${procgenAssetsBaseUrl}water/water-particle/textures/Splat3.png`, false],
    splashTexture3: [`${procgenAssetsBaseUrl}water/water-particle/textures/splash3.png`, false],
    bubbleTexture: [`${procgenAssetsBaseUrl}water/water-particle/textures/Bubble.png`, false],
    dropTexture: [`${procgenAssetsBaseUrl}water/water-particle/textures/drop.png`, false],
    circleTexture: [`${procgenAssetsBaseUrl}water/water-particle/textures/Circle133.png`, false],
  },
};

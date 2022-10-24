const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');

export const glbUrlSpecs = {
  particleGLBPath: {
    ripple: `${baseUrl}../water-effect/assets/ripple.glb`,
    dome: `${baseUrl}../water-effect/assets/dome.glb`,
  },
};

export const textureUrlSpecs = {
  particleTexturePath: {
    voronoiNoiseTexture: [`${baseUrl}../water-effect/assets/textures/voronoiNoise.jpg`, true],
    noiseMap: [`${baseUrl}../water-effect/assets/textures/noise.jpg`, true],
    noiseMap2: [`${baseUrl}../water-effect/assets/textures/noise2.png`, true],
    noiseCircleTexture: [`${baseUrl}../water-effect/assets/textures/noiseCircle6.png`, false],
    rippleTexture: [`${baseUrl}../water-effect/assets/textures/ripple2.png`, true],
    splashTexture2: [`${baseUrl}../water-effect/assets/textures/Splat3.png`, false],
    splashTexture3: [`${baseUrl}../water-effect/assets/textures/splash3.png`, false],
    bubbleTexture: [`${baseUrl}../water-effect/assets/textures/Bubble2.png`, false],
    dropTexture: [`${baseUrl}../water-effect/assets/textures/drop.png`, false],
    circleTexture: [`${baseUrl}../water-effect/assets/textures/Circle133.png`, false],
  },
};

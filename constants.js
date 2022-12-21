export const bufferSize = 4 * 1024 * 1024;
export const maxAnisotropy = 16;

export const WORLD_BASE_HEIGHT = 128;

export const MIN_WORLD_HEIGHT = 0;
export const MAX_WORLD_HEIGHT = 2048;
export const GRASS_COLOR_NAME = 'grassColor';

// Colors
export const GRASS_COLOR_ABOVE_GRASS = '#00f070';
export const GRASS_COLOR_ABOVE_DIRT = '#99ff00';

// Materials
export const NO_LIGHT_MATERIAL_SHADOW_INTENSITY = 0.5;

// Env Effects

export const WIND_EFFECT_OVER_GRASS = 0.4;
export const WIND_SPEED = 0.5;

export const GET_COLOR_PARAMETER_NAME = 'materialIndex';

export const TREE_ADDITIONAL_ATTRIBUTE = [
  {
    name: "color",
    itemSize: 4,
  }
]
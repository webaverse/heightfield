import * as THREE from 'three';

const baseUrl = import.meta.url.replace(/(\/)[^\/\/]*$/, '$1'); 
const textureLoader = new THREE.TextureLoader();

const bodyTexture = textureLoader.load(`${baseUrl}environmental-vfx/textures/body.png`);
const wingTexture = textureLoader.load(`${baseUrl}environmental-vfx/textures/butterfly-wing3.png`);

export const getButterflies = (particleCount, player) => {

  const discardMaterilAlpha = (material) => {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <map_fragment>`,
        `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vUv );
          #ifdef DECODE_VIDEO_TEXTURE
            // inline sRGB decode (TODO: Remove code when https://crbug.com/1256340 is solved)
            sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
          #endif
          if (sampledDiffuseColor.a < 0.1) {
            discard;
          }
          diffuseColor *= sampledDiffuseColor;
        #endif
        `,
      );
    };
  }

  const getButterflyMesh = () => {
    const geometry = new THREE.PlaneGeometry(1, 1.5);
    const material = new THREE.MeshBasicMaterial({map: wingTexture, side: THREE.DoubleSide});
    discardMaterilAlpha(material);
    const leftWing = new THREE.Mesh(geometry, material);
    leftWing.position.x = -0.55;
    const lwing = new THREE.Group();
    lwing.add(leftWing);

    const rightWing = new THREE.Mesh(geometry, material);
    rightWing.rotation.y = Math.PI;
    rightWing.position.x = 0.55;
    const rwing = new THREE.Group();
    rwing.add(rightWing);

    const geometry2 = new THREE.PlaneGeometry(1, 1.5);
    const material2 = new THREE.MeshBasicMaterial({map: bodyTexture, side: THREE.DoubleSide});
    discardMaterilAlpha(material2);
    const body = new THREE.Mesh(geometry2, material2);

    const group2 = new THREE.Group();
    const group = new THREE.Group();
    const butterflySize = 0.05;
    group.add(body);
    group.add(lwing);
    group.add(rwing);
    group.rotation.y = Math.PI;
    group.rotation.x = Math.PI / 2;
    group2.add(group);
    group2.scale.set(butterflySize, butterflySize, butterflySize);
    return group2;
  }
  const maxButterflyDistance = 20;
  const setButterflyInfo = (butterfly) => {
    butterfly.destination.set(
      player.position.x + (Math.random() - 0.5) * maxButterflyDistance,
      player.position.y + Math.random() * 2,
      player.position.z + (Math.random() - 0.5) * maxButterflyDistance,
    )
    butterfly.attraction = 0.01 + Math.random() * 0.09;
    butterfly.velocity.set(rnd(1, true), rnd(1, true), rnd(1, true));
  }

  const resetPosition = (butterfly) => {
    butterfly.position.set(
      player.position.x + (Math.random() - 0.5) * maxButterflyDistance,
      player.position.y + Math.random() * 2,
      player.position.z + (Math.random() - 0.5) * maxButterflyDistance,
    )
    setButterflyInfo(butterfly);
  }

  const rnd = (max, negative) => {
    return negative ? Math.random() * 2 * max - max : Math.random() * max;
  }

  const limit = (number, min, max) => {
    return Math.min(Math.max(number, min), max);
  }

  const initializeButterFly = () => {
    const butterflyMesh = getButterflyMesh();
    const butterflies = new THREE.Group();
    const butterflyCount = particleCount;
    for (let i = 0; i < butterflyCount; i ++) {
      const butterfly = butterflyMesh.clone();
      butterfly.destination = new THREE.Vector3();
      butterfly.velocity = new THREE.Vector3();
      setButterflyInfo(butterfly);
      butterfly.position.set(butterfly.destination.x, butterfly.destination.y, butterfly.destination.z);
      butterflies.add(butterfly);
    }
    return butterflies;
  }

  const butterflies = initializeButterFly();
  const localVector = new THREE.Vector3();
  butterflies.update = (timestamp) => {
    for (const butterfly of butterflies.children) { 
      localVector.set(butterfly.destination.x, butterfly.destination.y, butterfly.destination.z);
      const dv = localVector.sub(butterfly.position).normalize();
      butterfly.velocity.x += butterfly.attraction * dv.x;
      butterfly.velocity.y += butterfly.attraction * dv.y;
      butterfly.velocity.z += butterfly.attraction * dv.z;

      butterfly.velocity.x = limit(butterfly.velocity.x, -0.025, 0.025);
      butterfly.velocity.y = limit(butterfly.velocity.y, -0.025, 0.025);
      butterfly.velocity.z = limit(butterfly.velocity.z, -0.025, 0.025);

      const v2 = butterfly.velocity;
      const wavingSpeed = 0.03 + butterfly.attraction * 0.1;
      butterfly.children[0].children[1].rotation.y = Math.cos(timestamp * wavingSpeed);
      butterfly.children[0].children[2].rotation.y = -Math.cos(timestamp * wavingSpeed);

      butterfly.lookAt(butterfly.position.clone().add(v2));
      butterfly.position.add(v2);

      if (butterfly.position.distanceTo(player.position) > maxButterflyDistance * 5) {
        resetPosition(butterfly);
      }
      if (butterfly.position.distanceTo(butterfly.destination) < 1) {
        setButterflyInfo(butterfly);
      }
    }
  }

  return butterflies;
}
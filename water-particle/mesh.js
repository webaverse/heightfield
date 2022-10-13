import metaversefile from 'metaversefile';
import * as THREE from 'three';
import loadTexture from './loadTexture.js';
import {
    rippleVertex, rippleFragment,
    divingLowerSplashVertex, divingLowerSplashFragment,
    divingHigherSplashVertex, divingHigherSplashFragment,
    swimmingRippleSplashVertex, swimmingRippleSplashFragment,
    dropletVertex, dropletFragment,
    dropletRippleVertex, dropletRippleFragment,
    freestyleSplashVertex, freestyleSplashFragment,
} from './shader.js';

const baseUrl = import.meta.url.replace(/(\/)[^\/\\]*$/, '$1');
const {useLoaders} = metaversefile;
const voronoiNoiseTexture = loadTexture(`./assets/textures/voronoiNoise.jpg`);
const noiseMap = loadTexture(`./assets/textures/noise.jpg`);
const noiseMap2 = loadTexture(`./assets/textures/noise2.png`);
const noiseCircleTexture = loadTexture(`./assets/textures/noiseCircle6.png`, false);
const rippleTexture2 = loadTexture(`./assets/textures/ripple2.png`);
const splashTexture2 = loadTexture(`./assets/textures/Splat3.png`, false);
const splashTexture3 = loadTexture(`./assets/textures/splash3.png`, false);
const bubbleTexture2 = loadTexture(`./assets/textures/Bubble2.png`, false);




const _getGeometry = (geometry, attributeSpecs, particleCount) => {
    const geometry2 = new THREE.BufferGeometry();
    ['position', 'normal', 'uv'].forEach(k => {
        geometry2.setAttribute(k, geometry.attributes[k]);
    });
    geometry2.setIndex(geometry.index);

    const positions = new Float32Array(particleCount * 3);
    const positionsAttribute = new THREE.InstancedBufferAttribute(positions, 3);
    geometry2.setAttribute('positions', positionsAttribute);

    for(const attributeSpec of attributeSpecs){
        const {
            name,
            itemSize,
        } = attributeSpec;
        const array = new Float32Array(particleCount * itemSize);
        geometry2.setAttribute(name, new THREE.InstancedBufferAttribute(array, itemSize));
    }

    return geometry2;
};

const getRippleGroup = () => {
    const rippleGroup = new THREE.Group();
    (async () => {
        const u = `${baseUrl}./assets/ripple.glb`;
        const splashMeshApp = await new Promise((accept, reject) => {
            const {gltfLoader} = useLoaders();
            gltfLoader.load(u, accept, function onprogress() {}, reject);
            
        });
        rippleGroup.add(splashMeshApp.scene);
        const rippleMesh = splashMeshApp.scene.children[0];
        rippleMesh.visible = false;
        rippleMesh.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: {
                    value: 0,
                },
                vBroken: {
                    value: 0,
                },
                rippleTexture:{
                    value: rippleTexture2
                },
                voronoiNoiseTexture:{
                    value:voronoiNoiseTexture
                },
                noiseMap:{
                    value: noiseMap
                },
            },
            vertexShader: rippleVertex,
            fragmentShader: rippleFragment,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    })();
    return rippleGroup;
}
const getDivingLowerSplash = () => {
    const particleCount = 15;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'broken', itemSize: 1});
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'textureRotation', itemSize: 1});
    const geometry2 = new THREE.PlaneGeometry(0.15, 0.25);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
    const material= new THREE.ShaderMaterial({
        uniforms: {
            cameraBillboardQuaternion: {
                value: new THREE.Quaternion(),
            },
            splashTexture: {
                value: splashTexture2,
            },
            waterSurfacePos: {
                value: 0,
            },
            noiseMap:{
                value: noiseMap
            },
        },
        vertexShader: divingLowerSplashVertex,
        fragmentShader: divingLowerSplashFragment,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
    });
    const divingLowerSplash = new THREE.InstancedMesh(geometry, material, particleCount);
    divingLowerSplash.info = {
        particleCount: particleCount,
        velocity: [particleCount],
        acc: new THREE.Vector3(0, -0.002, 0)
    }
    for (let i = 0; i < particleCount; i++) {
        divingLowerSplash.info.velocity[i] = new THREE.Vector3();
    }
    return divingLowerSplash;
}
const getDivingHigherSplash = () => {
    const particleCount = 15;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'broken', itemSize: 1});
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'rotation', itemSize: 1});
    const geometry2 = new THREE.PlaneGeometry(0.25, 0.7);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
    const material= new THREE.ShaderMaterial({
        uniforms: {
            splashTexture: {
                value: splashTexture3,
            },
            waterSurfacePos: {
                value: 0,
            },
            noiseMap:{
                value: noiseMap
            },
        },
        vertexShader: divingHigherSplashVertex,
        fragmentShader: divingHigherSplashFragment,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
    });
    const divingHigherSplash = new THREE.InstancedMesh(geometry, material, particleCount);
    divingHigherSplash.info = {
        particleCount: particleCount,
        velocity: [particleCount],
        acc: new THREE.Vector3(0, -0.0035, 0)
    }
    for (let i = 0; i < particleCount; i++) {
        divingHigherSplash.info.velocity[i] = new THREE.Vector3();
    }
    return divingHigherSplash;
}
const getSwimmingRippleSplash = () => {
    const particleCount = 31;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'id', itemSize: 1});
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'broken', itemSize: 1});
    attributeSpecs.push({name: 'random', itemSize: 1});
    attributeSpecs.push({name: 'playerRotation', itemSize: 1});
    // attributeSpecs.push({name: 'speed', itemSize: 1});
    const geometry2 = new THREE.PlaneGeometry(0.32, 0.36);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);

    const quaternions = new Float32Array(particleCount * 4);
    const identityQuaternion = new THREE.Quaternion();
    for (let i = 0; i < particleCount; i++) {
        identityQuaternion.toArray(quaternions, i * 4);
    }
    const quaternionsAttribute = new THREE.InstancedBufferAttribute(quaternions, 4);
    geometry.setAttribute('quaternions', quaternionsAttribute);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: {
                value: 0,
            },
            op: {
                value: 0,
            },
            rippleParticleCount: {
                value: 15,
            },
            particleCount: {
                value: particleCount,
            },
            noiseMap2:{
                value: noiseMap2
            },
            noiseMap:{
                value: noiseMap
            },
            noiseCircleTexture:{
                value: noiseCircleTexture
            },
            splashTexture2:{
                value: splashTexture2
            },
            voronoiNoiseTexture:{
                value: voronoiNoiseTexture
            },
        },
        vertexShader: swimmingRippleSplashVertex,
        fragmentShader: swimmingRippleSplashFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        // blending: THREE.AdditiveBlending,
    });
    const swimmingRippleSplash = new THREE.InstancedMesh(geometry, material, particleCount);
    
    swimmingRippleSplash.info = {
        particleCount: particleCount,
        rippleCount: 15,
        splashCount: 15,
        currentRippleIndex: 0,
        currentSplashIndex: 15,
        lastEmmitTime: 0,
    }
    const euler = new THREE.Euler(-Math.PI / 2, 0, 0);
    const quaternion = new THREE.Quaternion();
    const quaternionAttribute = swimmingRippleSplash.geometry.getAttribute('quaternions');
    const idAttribute = swimmingRippleSplash.geometry.getAttribute('id');
    for (let i = 0; i < particleCount; i++) {
        quaternion.setFromEuler(euler);
        quaternionAttribute.setXYZW(i, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        idAttribute.setX(i, i);
    }
    quaternionAttribute.needsUpdate = true;
    idAttribute.needsUpdate = true;
    return swimmingRippleSplash;
}
const getDroplet = () => {
    const dropletgroup = new THREE.Group();
    const particleCount = 30;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'offset', itemSize: 2});
    const geometry2 = new THREE.PlaneGeometry(0.1, 0.1);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
    const material= new THREE.ShaderMaterial({
        uniforms: {
            cameraBillboardQuaternion: {
                value: new THREE.Quaternion(),
            },
            bubbleTexture1: {
                value: bubbleTexture2,
            },
        },
        vertexShader: dropletVertex,
        fragmentShader: dropletFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const droplet = new THREE.InstancedMesh(geometry, material, particleCount);
    
    droplet.info = {
        velocity: [particleCount],
        alreadyHaveRipple: [particleCount],
        offset: [particleCount],
        acc: new THREE.Vector3(0, -0.002, 0),
        startTime: [particleCount],
        particleCount: particleCount
    }
    for(let i = 0; i < particleCount; i++){
        droplet.info.velocity[i] = new THREE.Vector3();
        droplet.info.alreadyHaveRipple[i] = false;
    }
    dropletgroup.add(droplet);
    
    const rippleAttributeSpecs = [];
    rippleAttributeSpecs.push({name: 'scales', itemSize: 1});
    rippleAttributeSpecs.push({name: 'broken', itemSize: 1});
    rippleAttributeSpecs.push({name: 'waveFreq', itemSize: 1});
    
    const geometry4 = new THREE.PlaneGeometry(0.45, 0.45);
    const geometry3 = _getGeometry(geometry4, rippleAttributeSpecs, particleCount);

    const quaternions = new Float32Array(particleCount * 4);
    const identityQuaternion = new THREE.Quaternion();
    for (let i = 0; i < particleCount; i++) {
        identityQuaternion.toArray(quaternions, i * 4);
    }
    const quaternionsAttribute = new THREE.InstancedBufferAttribute(quaternions, 4);
    geometry3.setAttribute('quaternions', quaternionsAttribute);


    const material2 = new THREE.ShaderMaterial({
        uniforms: {
            uTime: {
                value: 0,
            },
            noiseMap:{
                value: noiseMap
            }
        },
        vertexShader: dropletRippleVertex,
        fragmentShader: dropletRippleFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const dropletRipple = new THREE.InstancedMesh(geometry3, material2, particleCount);
    const euler = new THREE.Euler(-Math.PI / 2, 0, 0);
    const quaternion = new THREE.Quaternion();
    const quaternionAttribute = dropletRipple.geometry.getAttribute('quaternions');
    for (let i = 0; i < particleCount; i++) {
        quaternion.setFromEuler(euler);
        quaternionAttribute.setXYZW(i, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }
    quaternionAttribute.needsUpdate = true;
    
    dropletgroup.add(dropletRipple);

    return dropletgroup;
}
const getBubble = () => {
    const particleCount = 20;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'offset', itemSize: 2});
    const geometry2 = new THREE.PlaneGeometry(0.02, 0.02);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            cameraBillboardQuaternion: {
                value: new THREE.Quaternion(),
            },
            bubbleTexture1: {
                value: bubbleTexture2,
            },
        },
        vertexShader: dropletVertex,
        fragmentShader: dropletFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const bubble = new THREE.InstancedMesh(geometry, material, particleCount);
    
    bubble.info = {
        particleCount: particleCount,
        maxEmmit: 5,
        lastEmmitTime: 0,
        velocity: [particleCount],
        offset: [particleCount],
        startTime:[particleCount],
        lastTime:[particleCount]
    }
    
    for (let i = 0; i < particleCount; i++) {
        bubble.info.velocity[i] = new THREE.Vector3();
    }
    return bubble;
}
const getLittleSplash = () => {
    const particleCount = 60;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'scales', itemSize: 1});
    attributeSpecs.push({name: 'broken', itemSize: 1});
    attributeSpecs.push({name: 'textureRotation', itemSize: 1});
    const geometry2 = new THREE.PlaneGeometry(0.18, 0.18);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);

    const material = new THREE.ShaderMaterial({
        uniforms: {
            cameraBillboardQuaternion: {
                value: new THREE.Quaternion(),
            },
            splashTexture: {
                value: splashTexture2,
            },
            waterSurfacePos: {
                value: 0,
            },
            noiseMap: {
                value: noiseMap
            },
        },
        vertexShader: divingLowerSplashVertex,
        fragmentShader: divingLowerSplashFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const littleSplash = new THREE.InstancedMesh(geometry, material, particleCount);
    
    littleSplash.info = {
        particleCount: particleCount,
        maxEmmit: 5,
        velocity: [particleCount],
        acc: [particleCount],
        brokenVelocity: [particleCount]
    }
    const brokenAttribute = littleSplash.geometry.getAttribute('broken');
    for (let i = 0; i < particleCount; i++) {
        brokenAttribute.setX(i, 1);
        littleSplash.info.velocity[i] = new THREE.Vector3();
        littleSplash.info.acc[i] = new THREE.Vector3();
    }
    brokenAttribute.needsUpdate = true;
    return littleSplash;
}
const getFreestyleSplash = () => {
    const group = new THREE.Group();
    const freeStyleGroup = new THREE.Group();
    const particleCount = 50;
    const attributeSpecs = [];
    attributeSpecs.push({name: 'broken', itemSize: 1});
    attributeSpecs.push({name: 'scales', itemSize: 2});
    attributeSpecs.push({name: 'rotation', itemSize: 3});
    const geometry2 = new THREE.PlaneGeometry(0.08, 0.08);
    const geometry = _getGeometry(geometry2, attributeSpecs, particleCount);
    const material= new THREE.ShaderMaterial({
        uniforms: {
            uTime: {
                value:0
            },
            splashTexture: {
                value: splashTexture3,
            },
            waterSurfacePos: {
                value: 0,
            },
            noiseMap:{
                value: noiseMap
            },
        },
        vertexShader: freestyleSplashVertex,
        fragmentShader: freestyleSplashFragment,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        transparent: true,
    });
    const divingHigherSplash = new THREE.InstancedMesh(geometry, material, particleCount);
    divingHigherSplash.info = {
        particleCount: particleCount,
    }
    group.add(divingHigherSplash);
    group.rotation.x = Math.PI / 2.1;
    freeStyleGroup.add(group)
    return freeStyleGroup;
}

export {
    getRippleGroup,
    getDivingLowerSplash,
    getDivingHigherSplash,
    getSwimmingRippleSplash,
    getDroplet,
    getBubble,
    getLittleSplash,
    getFreestyleSplash,
};
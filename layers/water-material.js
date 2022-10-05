import * as THREE from 'three';

const _createWaterMaterial = () => {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            tDepth: {
                value: null
            },
            cameraNear: {
                value: 0
            },
            cameraFar: {
                value: 0
            },
            resolution: {
                value: new THREE.Vector2()
            },
        },
        vertexShader: `\
            
            ${THREE.ShaderChunk.common}
            ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
            varying vec2 vUv;
            
            void main() {
                vUv = uv;
                vec4 modelPosition = modelMatrix * vec4(position, 1.0);
                vec4 viewPosition = viewMatrix * modelPosition;
                vec4 projectionPosition = projectionMatrix * viewPosition;

                gl_Position = projectionPosition;
                ${THREE.ShaderChunk.logdepthbuf_vertex}
            }
        `,
        fragmentShader: `\
            ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
            #include <common>
            #include <packing>
            uniform sampler2D tDepth;
            uniform float cameraNear;
            uniform float cameraFar;
            uniform vec2 resolution;

            float getDepth( const in vec2 screenPosition ) {
                return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
            }
            float getViewZ( const in float depth ) {
                return perspectiveDepthToViewZ( depth, cameraNear, cameraFar );
            }  
            void main() {
                vec2 screenUV = gl_FragCoord.xy / resolution;
    
                float fragmentLinearEyeDepth = getViewZ( gl_FragCoord.z );
                float linearEyeDepth = getViewZ( getDepth( screenUV ) );
        
                float diff = saturate( fragmentLinearEyeDepth - linearEyeDepth );
                gl_FragColor = vec4(0., 0., 1.0, diff * 0.9);
                ${THREE.ShaderChunk.logdepthbuf_fragment}
            }
        `,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        // blending: THREE.AdditiveBlending,
    });
    return material;
};

export default _createWaterMaterial;

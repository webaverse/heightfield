import * as THREE from 'three';

const _createWaterMaterial = () => {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: {
                value: 0
            },
            tDepth: {
                value: null
            },
            tDudv: {
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
            foamTexture: {
                value: null
            },
            causticTexture: {
                value: null
            },
            mirror: {
                value: null
            },
            textureMatrix: {
                value: null
            },

        },
        vertexShader: `\
            
            ${THREE.ShaderChunk.common}
            ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
            uniform mat4 textureMatrix;
		    varying vec4 vUv;
            // varying vec2 vUv;
            varying vec3 vPos;
            
            void main() {
                // vUv = uv;
                vec3 pos = position;
			    vUv = textureMatrix * vec4( pos, 1.0 );
                vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
                vec4 viewPosition = viewMatrix * modelPosition;
                vec4 projectionPosition = projectionMatrix * viewPosition;
                vPos = modelPosition.xyz;
                gl_Position = projectionPosition;
                ${THREE.ShaderChunk.logdepthbuf_vertex}
            }
        `,
        fragmentShader: `\
            ${THREE.ShaderChunk.logdepthbuf_pars_fragment}
            #include <common>
            #include <packing>

            uniform mat4 textureMatrix;
		    varying vec4 vUv;
            uniform sampler2D mirror;

            // varying vec2 vUv;
            varying vec3 vPos;

            uniform float uTime;
            uniform sampler2D tDepth;
            uniform sampler2D tDudv;
            uniform sampler2D foamTexture;
            uniform sampler2D causticTexture;
            uniform float cameraNear;
            uniform float cameraFar;
            uniform vec2 resolution;
            
            float blendOverlay( float base, float blend ) {

                return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
    
            }
    
            vec3 blendOverlay( vec3 base, vec3 blend ) {
    
                return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
    
            }

            float getDepth(const in vec2 screenPosition) {
                return unpackRGBAToDepth( texture2D(tDepth, screenPosition));
            }
            float getViewZ(const in float depth) {
                return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
            }  
            float getDepthFade(float fragmentLinearEyeDepth, float linearEyeDepth, float depthScale, float depthFalloff) {
                return pow(saturate(1. - (fragmentLinearEyeDepth - linearEyeDepth) / depthScale), depthFalloff);
            }
            vec4 cutout(float depth, float alpha) {
                return vec4(ceil(depth - saturate(alpha)));
            }
            void main() {
                vec2 screenUV = gl_FragCoord.xy / resolution;
    
                float fragmentLinearEyeDepth = getViewZ(gl_FragCoord.z);
                float linearEyeDepth = getViewZ(getDepth(screenUV));

                // water and shoreline
                float depthScale = 20.;
                float depthFalloff = 3.;
                float sceneDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, depthScale, depthFalloff);
                vec4 shoreColor = vec4(0.182, 0.731, 0.760, (1. - sceneDepth));
                vec4 waterColor = vec4(0.140, 0.294, 0.560, (1. - sceneDepth));
                vec4 col = sceneDepth * shoreColor + (1. - sceneDepth) * waterColor;

                // vec4 causticColor = vec4(0.8, 0.8, 0.8, 1.0);
                // float causticCutout = 0.4;
                // vec4 causticT = texture2D(causticTexture, vec2(vPos.x * 0.1 + uTime * 0.05, vPos.z * 0.1 + uTime * 0.025));
                // vec4 causticT2 = texture2D(causticTexture, vec2(vPos.z * 0.2 + uTime * 0.1, vPos.x * 0.2 - uTime * 0.05));
                // causticT = cutout(causticT.r * causticT2.r, causticCutout);
                // vec4 caustic = causticT * causticColor;
                
                // float foamCutout = 0.3;
                // float foamTDepthScale = 0.9;
                // float foamTDepthFalloff = 0.5;
                // float foamAmount = 0.8;
                // float foamTDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, foamTDepthScale, foamTDepthFalloff);
                // float foamUvX = foamTDepth * foamAmount - uTime * 0.15;
                // float foamUvY = vPos.z * 0.05;
                // vec4 foamT = texture2D(foamTexture, vec2(foamUvX, foamUvY));
                // foamT = cutout((foamT * foamTDepth).r, foamCutout);


                // foam line
                vec4 foamColor = vec4(col.rgb, 0.1);
                float foamDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, 1.0, 1.0);
                float foamShoreWidth = 0.3;
                //vec4 foamCutOut = saturate(cutout(foamDepth, foamShoreWidth) + foamT);
                vec4 foamCutOut = saturate(cutout(foamDepth, foamShoreWidth));
                vec4 foam = foamCutOut * foamColor;
                // vec4 col2 = col * ((vec4(1.0) - foamCutOut) + (vec4(1.0) - causticT)) * 0.5 + foam + caustic;
                vec4 col2 = col * ((vec4(1.0) - foamCutOut)) + foam;

                // gl_FragColor = vec4(col2);
                vec4 base = texture2DProj( mirror, vUv );
			    gl_FragColor = vec4( blendOverlay( base.rgb, col2.rgb ), col2.a);
                // foam
                // float diff = saturate( fragmentLinearEyeDepth - linearEyeDepth );
                // if(diff > 0.){
                //     vec2 channelA = texture2D( tDudv, vec2(0.25 * vPos.x + uTime * 0.04, 0.5 * vPos.z - uTime * 0.03) ).rg;
                //     vec2 channelB = texture2D( tDudv, vec2(0.5 * vPos.x - uTime * 0.05, 0.35 * vPos.z + uTime * 0.04) ).rg;
                //     vec2 displacement = (channelA + channelB) * 0.5;
                //     displacement = ( ( displacement * 2.0 ) - 1.0 ) * 1.0;
                //     diff += displacement.x;
                //     gl_FragColor = mix( vec4(1.0, 1.0, 1.0, gl_FragColor.a), gl_FragColor, step( 0.1, diff ) );
                // }
                // #include <encodings_fragment>
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

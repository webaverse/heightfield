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
            eye: {
                value: new THREE.Vector3()
            },
            playerPos: {
                value: new THREE.Vector3()
            },

        },
        vertexShader: `\
            
            ${THREE.ShaderChunk.common}
            ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
            uniform float uTime;
            uniform mat4 textureMatrix;
		    varying vec4 vUv;
            // varying vec2 vUv;
            varying vec3 vPos;
            varying vec3 vNormal;

            vec3 gerstnerWave(float dirX, float dirZ, float steepness, float waveLength, inout vec3 tangent, inout vec3 binormal, vec3 pos) {
                vec2 dirXZ = vec2(dirX, dirZ);
                float k = 2. * PI / waveLength;
                float c = sqrt(9.8 / k);
                vec2 d = normalize(dirXZ);
                float f = k * (dot(d, pos.xz) - c * uTime);
                float a = (steepness / k);
                // pos.x += d.x * (a * cos(f));
                // pos.y += a * sin(f); 
                // pos.z += d.y * (a * cos(f));
                tangent += vec3(
                    - d.x * d.x * (steepness * sin(f)),
                    d.x * (steepness * cos(f)),
                    -d.x * d.y * (steepness * sin(f))
                );
                binormal += vec3(
                    -d.x * d.y * (steepness * sin(f)),
                    d.y * (steepness * cos(f)),
                    - d.y * d.y * (steepness * sin(f))
                );
                return vec3(
                    d.x * (a * cos(f)),
                    a * sin(f),
                    d.y * (a * cos(f))
                );
            }
            
            void main() {
                
                // vUv = uv;
                vec3 pos = position;
                vUv = textureMatrix * vec4( pos, 1.0 );

                // 1.dirX  2.dirZ  3.steepness  4.waveLength
                vec4 waveA = vec4(1.0, 0.0, 0.05, 30.);
                vec4 waveB = vec4(0.0, 1.0, 0.05, 15.);
                vec4 waveC = vec4(-0.7, -0.3, 0.075, 7.5);
                vec4 waveD = vec4(-0.3, -0.7, 0.075, 3.5);

                vec3 tangent = vec3(1.0, 0.0, 0.0);
                vec3 binormal = vec3(0.0, 0.0, 1.0);

                vec3 tempPos = position;
			    
                pos += gerstnerWave(waveA.x, waveA.y, waveA.z, waveA.w, tangent, binormal, tempPos);
                pos += gerstnerWave(waveB.x, waveB.y, waveB.z, waveB.w, tangent, binormal, tempPos);
                pos += gerstnerWave(waveC.x, waveC.y, waveC.z, waveC.w, tangent, binormal, tempPos);
                pos += gerstnerWave(waveD.x, waveD.y, waveD.z, waveD.w, tangent, binormal, tempPos);


                // vec3 tangent = vec3(
                //     1. - d.x * d.x * (steepness * sin(f)),
                //     d.x * (steepness * cos(f)),
                //     -d.x * d.y * (steepness * sin(f))
                // );
                // vec3 binormal = vec3(
                //     -d.x * d.y * (steepness * sin(f)),
                //     d.y * (steepness * cos(f)),
                //     1. - d.y * d.y * (steepness * sin(f))
                // );
                vec3 waveNormal = normalize(cross(binormal, tangent));
                vNormal = waveNormal;

                
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
            #include <bsdfs>
            #include <fog_pars_fragment>
            #include <logdepthbuf_pars_fragment>
            #include <lights_pars_begin>
            #include <shadowmap_pars_fragment>
            #include <shadowmask_pars_fragment>

            uniform mat4 textureMatrix;
            uniform vec3 eye;
            uniform vec3 playerPos;
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

            varying vec3 vNormal;
            
            float blendOverlay( float base, float blend ) {

                return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
    
            }
    
            vec3 blendOverlay( vec3 base, vec3 blend ) {
    
                return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
    
            }
            void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor, vec3 sunColor, vec3 sunDir) {
                vec3 reflection = normalize( reflect( -sunDir, surfaceNormal ) );
                float direction = max( 0.0, dot( eyeDirection, reflection ) );
                specularColor += pow( direction, shiny ) * sunColor * spec;
                diffuseColor += max( dot(sunDir, surfaceNormal ), 0.0 ) * sunColor * diffuse;
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
                float depthScale = 15.;
                float depthFalloff = 3.;
                float sceneDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, depthScale, depthFalloff);
                float waterColorDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, 40., 3.);
                vec4 shoreColor = vec4(0.17992, 0.4992, 0.09968, (1. - sceneDepth));
                vec4 waterColor = vec4(0.126, 0.47628, 0.6048, (1. - sceneDepth));
                // vec4 col = sceneDepth * shoreColor + (1. - sceneDepth) * waterColor;
                vec4 col = mix(shoreColor, waterColor, 1. - waterColorDepth);
                col.a = 1. - sceneDepth;


                // vec4 causticColor = vec4(0.8, 0.8, 0.8, 1.0);
                // float causticCutout = 0.4;
                // vec4 causticT = texture2D(causticTexture, vec2(vPos.x * 0.1 + uTime * 0.05, vPos.z * 0.1 + uTime * 0.025));
                // vec4 causticT2 = texture2D(causticTexture, vec2(vPos.z * 0.2 + uTime * 0.1, vPos.x * 0.2 - uTime * 0.05));
                // causticT = cutout(causticT.r * causticT2.r, causticCutout);
                // vec4 caustic = causticT * causticColor;

                float fadeoutDistance = 10.;
                float foamCutout = 0.25;
                float foamTDepthScale = 2.0;
                float foamTDepthFalloff = 2.0;
                float foamAmount = 1.;
                float foamTDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, foamTDepthScale, foamTDepthFalloff);
                float foamUvY = vPos.z * 0.05;
                float foamUvX = foamTDepth * foamAmount + uTime * 0.2;
                vec4 foamT = texture2D(foamTexture, vec2(foamUvX, foamUvY));
                foamT = cutout((foamT * foamTDepth).r, foamCutout);
                foamT *= mix(foamT, vec4(0.), step(distance(playerPos, vPos), fadeoutDistance) * (1. + distance(playerPos, vPos)));

                // foam line
                vec4 foamColor = waterColor + vec4(0.5, 0.5, 0.5, 0.8);
                float foamDepth = getDepthFade(fragmentLinearEyeDepth, linearEyeDepth, 0.3, 2.0);
                float foamShoreWidth = 0.1;
                vec4 foamLineCutOut = saturate(cutout(foamDepth, foamShoreWidth) + foamT);
                // vec4 foamLineCutOut = saturate(cutout(foamDepth, foamShoreWidth));
                vec4 foam = foamLineCutOut * mix(foamColor, col, step(distance(playerPos, vPos), fadeoutDistance) * (1. + distance(playerPos, vPos)));
                // vec4 col2 = col * ((vec4(1.0) - foamLineCutOut) + (vec4(1.0) - causticT)) * 0.5 + foam + caustic;
                vec4 col2 = col * ((vec4(1.0) - foamLineCutOut)) + foam;

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

                vec3 sunColor = vec3(0., 0., 0.);
                vec3 sunDir = vec3(0.70707, 0.70707, 0.);

                vec3 surfaceNormal = normalize( vNormal * vec3( 1.5, 1.0, 1.5 ) );
                vec3 diffuseLight = vec3(0.0);
                vec3 specularLight = vec3(0.0);
                vec3 worldToEye = eye-vPos.xyz;
                vec3 eyeDirection = normalize( worldToEye );
                sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight, sunColor, sunDir);
                float distance = length(worldToEye);
                float distortionScale = 3.;
                vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
                vec3 reflectionSample = vec3( texture2D( mirror, vUv.xy / vUv.w + distortion ) );
                float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
                float rf0 = 0.3;
                float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
                vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * col2.rgb;
                vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.4 + reflectionSample * specularLight ), reflectance);
                gl_FragColor = vec4( albedo, col2.a );
                gl_FragColor.rgb += col2.rgb;
                #include <tonemapping_fragment>
                #include <fog_fragment>
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

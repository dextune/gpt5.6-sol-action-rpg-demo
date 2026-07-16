import * as THREE from 'three';
import { EffectComposer } from '../../vendor/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../../vendor/examples/jsm/postprocessing/ShaderPass.js';
import { SSAOPass } from '../../vendor/examples/jsm/postprocessing/SSAOPass.js';
import { OutlinePass } from '../../vendor/examples/jsm/postprocessing/OutlinePass.js';
import { UnrealBloomPass } from '../../vendor/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from '../../vendor/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from '../../vendor/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from '../../vendor/examples/jsm/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, warmth: { value: .035 }, contrast: { value: .045 }, saturation: { value: .025 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float warmth; uniform float contrast; uniform float saturation; varying vec2 vUv;
  void main(){ vec4 c=texture2D(tDiffuse,vUv); vec3 l=vec3(dot(c.rgb,vec3(.2126,.7152,.0722))); c.rgb=mix(c.rgb,l, -saturation); c.rgb=(c.rgb-.5)*(1.0+contrast)+.5; c.rgb += vec3(warmth*.42,warmth*.17,-warmth*.28); gl_FragColor=c; }`,
};

export class PostProcessSystem {
  constructor(renderer, scene, camera, quality = 'medium') {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // SSAO is one of the heaviest passes — keep kernels tiny and high-only.
    this.ssao = new SSAOPass(scene, camera, 1, 1, quality === 'high' ? 12 : 8);
    this.ssao.kernelRadius = quality === 'high' ? 4.5 : 3.2;
    this.ssao.minDistance = .0018;
    this.ssao.maxDistance = .055;
    this.ssao.output = SSAOPass.OUTPUT.Default;
    this.composer.addPass(this.ssao);

    this.outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    this.outline.edgeStrength = 1.55;
    this.outline.edgeGlow = .05;
    this.outline.edgeThickness = .52;
    this.outline.pulsePeriod = 0;
    this.outline.visibleEdgeColor.set(0x263744);
    this.outline.hiddenEdgeColor.set(0x263744);
    this.composer.addPass(this.outline);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .11, .24, .94);
    this.composer.addPass(this.bloom);

    this.bokeh = new BokehPass(scene, camera, { focus: 14, aperture: .000010, maxblur: .00165, width: 1, height: 1 });
    this.composer.addPass(this.bokeh);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.applyQuality(quality);
  }

  applyQuality(quality) {
    this.quality = quality;
    // medium: grade + light bloom + fxaa only (cheap cinematic polish)
    // high: + light SSAO (no outline/DOF — both re-render the full scene)
    // low: post pipeline not used by RenderPipeline
    this.ssao.enabled = quality === 'high';
    this.ssao.kernelRadius = quality === 'high' ? 4.5 : 3.2;
    this.outline.enabled = false;
    this.bloom.enabled = quality !== 'low';
    // P10 micro-tune: slightly richer high bloom, still weak enough for horde density.
    this.bloom.strength = quality === 'high' ? .11 : .06;
    this.bloom.radius = quality === 'high' ? .18 : .16;
    this.bloom.threshold = quality === 'high' ? .93 : .95;
    this.bokeh.enabled = false;
    this.grade.enabled = quality !== 'low';
    this.fxaa.enabled = quality !== 'low';
    this.grade.uniforms.warmth.value = quality === 'high' ? .04 : quality === 'low' ? .02 : .03;
  }

  setFocusDistance(distance) {
    const uniform = this.bokeh?.uniforms?.focus;
    if (uniform) uniform.value = THREE.MathUtils.clamp(distance, 5, 30);
  }

  resize(width, height, pixelRatio = 1) {
    const nextW = Math.max(1, width);
    const nextH = Math.max(1, height);
    const nextPr = pixelRatio;
    // Avoid reallocating composer/SSAO targets when nothing changed (prevents white/black flashes).
    if (nextW === this.width && nextH === this.height && Math.abs(nextPr - this.pixelRatio) < .001) return;
    this.width = nextW;
    this.height = nextH;
    this.pixelRatio = nextPr;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.width, this.height);
    const renderWidth = Math.max(1, Math.floor(this.width * pixelRatio));
    const renderHeight = Math.max(1, Math.floor(this.height * pixelRatio));
    if (this.ssao.enabled) this.ssao.setSize(renderWidth, renderHeight);
    if (this.outline.enabled) this.outline.setSize(renderWidth, renderHeight);
    this.fxaa.material.uniforms.resolution.value.set(1 / renderWidth, 1 / renderHeight);
  }

  render(delta = 0) { this.composer.render(delta); }

  dispose() {
    for (const pass of [this.ssao, this.outline, this.bloom, this.bokeh, this.grade, this.fxaa, this.output, this.renderPass]) pass?.dispose?.();
    this.composer?.dispose?.();
  }
}

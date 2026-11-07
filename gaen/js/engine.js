/**
 * GARGANTUA — rendering core.
 *
 * One fullscreen geodesic pass into an RGBA16F buffer, a thresholded
 * multi-scale bloom pyramid, then a filmic composite. No scene geometry other
 * than the fullscreen triangle/quad is ever submitted.
 */

import * as THREE from 'three';
import { QUALITY, PARAMETERS } from './config.js';
import {
  fullscreenVertexShader,
  blackHoleFragmentShader,
  brightPassFragmentShader,
  downsampleFragmentShader,
  blurFragmentShader,
  compositeFragmentShader,
} from './shaders.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class GargantuaEngine {
  static isSupported() {
    try {
      if (typeof window === 'undefined' || !window.WebGL2RenderingContext) return false;
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
      return true;
    } catch {
      return false;
    }
  }

  constructor({ canvas, quality = 'high', renderScale = null, onContextLost, onContextRestored, onFatal }) {
    this.canvas = canvas;
    this.qualityName = QUALITY[quality] ? quality : 'high';
    this.quality = QUALITY[this.qualityName];
    this.renderScaleOverride = Number.isFinite(renderScale) ? clamp(renderScale, 0.2, 2) : null;
    this.onContextLost = onContextLost;
    this.onContextRestored = onContextRestored;
    this.onFatal = onFatal;

    this.contextLost = false;
    this.lastShaderError = null;
    this.contextLossCount = 0;
    this.frameCount = 0;
    this.width = 1;
    this.height = 1;
    this.cssWidth = 1;
    this.cssHeight = 1;
    this.dpr = 1;
    this.bloomTargets = [];
    this.fatalReported = false;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      throw new Error(`WebGL2 renderer could not be created: ${err?.message || err}`);
    }

    this.renderer = renderer;
    renderer.setPixelRatio(1);
    renderer.setSize(1, 1, false);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.info.autoReset = true;
    renderer.debug.checkShaderErrors = true;

    const gl = renderer.getContext();
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    // Keep a durable reference. Browsers may refuse to re-query this extension
    // after the context has already been lost, which would make recovery fail.
    this.loseContextExtension = gl.getExtension('WEBGL_lose_context') || null;
    this.restoreAttempts = 0;
    this.lastRestoreAt = 0;
    const colorBufferFloat = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.hdrType = colorBufferFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdrLabel = colorBufferFloat ? 'RGBA16F' : 'RGBA8';
    this.floatBuffers = colorBufferFloat;

    renderer.debug.onShaderError = (glContext, program, vertexShader, fragmentShader) => {
      let log = '';
      try {
        log = [
          glContext.getShaderInfoLog(vertexShader),
          glContext.getShaderInfoLog(fragmentShader),
          glContext.getProgramInfoLog(program),
        ].filter(Boolean).join('\n').trim();
      } catch {
        log = 'Unknown shader link failure.';
      }
      this.lastShaderError = log || 'Shader link failure.';
    };

    this.mobile = this._detectMobile();

    this._buildScene();
    this._bindContextEvents();
    this.resize(true);
  }

  _detectMobile() {
    try {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      const narrow = window.innerWidth <= 820;
      const smallScreen = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) <= 900;
      return !!(narrow || (coarse && smallScreen));
    } catch {
      return false;
    }
  }

  _buildScene() {
    const vertexShader = fullscreenVertexShader;

    this.raytraceMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: blackHoleFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3(0, 4.4, 20.5) },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamForward: { value: new THREE.Vector3(0, 0, -1) },
        uFocal: { value: 1.0 / Math.tan(THREE.MathUtils.degToRad(42) * 0.5) },
        uStepScale: { value: this.quality.stepScale },
        uMaxSteps: { value: this.quality.maxSteps },
        uDebug: { value: 0 },
        uDiskInner: { value: 3.0 },
        uDiskOuter: { value: 11.0 },
        uDiskBrightness: { value: 0.76 },
        uDiskTemp: { value: 4800 },
        uTurbulence: { value: 0.78 },
        uNoiseScale: { value: 2.90 },
        uDiskSpeed: { value: 0.85 },
        uDiskThickness: { value: 0.20 },
        uDiskOpacity: { value: 0.62 },
        uDoppler: { value: 1.0 },
        uRedshift: { value: 1.0 },
        uPhotonGlow: { value: 0.12 },
        uSkyBrightness: { value: 0.72 },
        uStarDensity: { value: 1.0 },
        uMilkyway: { value: 1.0 },
      },
    });

    this.brightMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: brightPassFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uScene: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uThreshold: { value: 1.45 },
      },
    });

    this.downsampleMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: downsampleFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTexture: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      },
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: blurFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uTexture: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uDirection: { value: new THREE.Vector2(1, 0) },
      },
    });

    const blackTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    blackTexture.colorSpace = THREE.LinearSRGBColorSpace;
    blackTexture.needsUpdate = true;
    this.blackTexture = blackTexture;

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: compositeFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uScene: { value: null },
        uBloom0: { value: blackTexture },
        uBloom1: { value: blackTexture },
        uBloom2: { value: blackTexture },
        uBloom3: { value: blackTexture },
        uBloom4: { value: blackTexture },
        uBloom5: { value: blackTexture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uExposure: { value: 0.92 },
        uBloomStrength: { value: 0.34 },
        uGrain: { value: 0.16 },
        uVignette: { value: 0.60 },
        uChromatic: { value: 0.18 },
        uDebug: { value: 0 },
        uBloomLevels: { value: this.quality.bloomLevels },
      },
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeometry, this.raytraceMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.raytraceMaterial.uniforms.uFocal.value = 1.0 / Math.tan(THREE.MathUtils.degToRad(42) * 0.5);
  }

  _bindContextEvents() {
    this._onContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.contextLossCount += 1;
      try {
        this.onContextLost?.(event);
      } catch {
        /* Callback failures must not leave the context unhandled. */
      }
    };
    this._onContextRestored = () => {
      this.contextLost = false;
      this._disposeRenderTargets();
      this.resize(true);
      try {
        this.onContextRestored?.();
      } catch {
        /* noop */
      }
    };
    this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
    this.canvas.addEventListener('webglcontextcreationerror', (event) => {
      const message = event?.statusMessage || 'WebGL2 context creation failed.';
      this.onFatal?.({ kind: 'context-creation', message });
    }, false);
  }

  _disposeRenderTargets() {
    if (this.hdrTarget) {
      this.hdrTarget.dispose();
      this.hdrTarget = null;
    }
    for (const pair of this.bloomTargets) {
      pair.a.dispose();
      pair.b.dispose();
    }
    this.bloomTargets = [];
  }

  _allocateRenderTargets() {
    this._disposeRenderTargets();

    const makeTarget = (w, h) => {
      const target = new THREE.WebGLRenderTarget(
        Math.max(1, Math.min(w, this.maxTextureSize)),
        Math.max(1, Math.min(h, this.maxTextureSize)),
        {
          type: this.hdrType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false,
        },
      );
      target.texture.colorSpace = THREE.LinearSRGBColorSpace;
      target.texture.wrapS = THREE.ClampToEdgeWrapping;
      target.texture.wrapT = THREE.ClampToEdgeWrapping;
      return target;
    };

    this.hdrTarget = makeTarget(this.width, this.height);

    this.bloomTargets = [];
    const levels = this.quality.bloomLevels;
    let levelW = Math.max(1, Math.floor(this.width / 2));
    let levelH = Math.max(1, Math.floor(this.height / 2));
    for (let level = 0; level < levels; level++) {
      this.bloomTargets.push({
        a: makeTarget(levelW, levelH),
        b: makeTarget(levelW, levelH),
        w: levelW,
        h: levelH,
      });
      levelW = Math.max(1, Math.floor(levelW / 2));
      levelH = Math.max(1, Math.floor(levelH / 2));
    }

    this.raytraceMaterial.uniforms.uResolution.value.set(this.width, this.height);
    this.compositeMaterial.uniforms.uResolution.value.set(this.width, this.height);
    this.compositeMaterial.uniforms.uBloomLevels.value = levels;
  }

  _computeSize() {
    const qa = this.quality;
    this.cssWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    this.cssHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    this.dpr = window.devicePixelRatio || 1;

    let scale;
    if (this.renderScaleOverride != null) {
      scale = this.renderScaleOverride;
    } else {
      const deviceScale = Math.min(this.dpr, qa.dprCap);
      scale = deviceScale * qa.baseScale;
      const pixelBudget = qa.maxPixels * (this.mobile ? 0.62 : 1);
      const budgetScale = Math.sqrt(pixelBudget / Math.max(this.cssWidth * this.cssHeight, 1));
      scale = Math.min(scale, budgetScale);
      if (this.mobile) scale = Math.min(scale, 1.25);
      scale = Math.max(scale, 0.45);
    }

    let width = Math.max(1, Math.round(this.cssWidth * scale));
    let height = Math.max(1, Math.round(this.cssHeight * scale));

    const maxByTexture = 8192;
    if (width > maxByTexture || height > maxByTexture) {
      const ratio = Math.min(maxByTexture / width, maxByTexture / height);
      width = Math.max(1, Math.floor(width * ratio));
      height = Math.max(1, Math.floor(height * ratio));
    }

    return { width, height };
  }

  resize(force = false) {
    if (this.contextLost && !force) return false;
    const previousW = this.width;
    const previousH = this.height;
    const previousQuality = this.qualityName;

    const size = this._computeSize();
    this.width = size.width;
    this.height = size.height;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    const needsTargets = force || !this.hdrTarget || previousW !== this.width || previousH !== this.height || previousQuality !== this.qualityName;
    if (needsTargets) this._allocateRenderTargets();
    else {
      this.raytraceMaterial.uniforms.uResolution.value.set(this.width, this.height);
      this.compositeMaterial.uniforms.uResolution.value.set(this.width, this.height);
    }

    return needsTargets;
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.qualityName) {
      if (QUALITY[name] && name === this.qualityName) {
        this.quality = QUALITY[name];
        this.raytraceMaterial.uniforms.uMaxSteps.value = this.quality.maxSteps;
        this.raytraceMaterial.uniforms.uStepScale.value = this.quality.stepScale;
      }
      return false;
    }
    this.qualityName = name;
    this.quality = QUALITY[name];
    this.raytraceMaterial.uniforms.uMaxSteps.value = this.quality.maxSteps;
    this.raytraceMaterial.uniforms.uStepScale.value = this.quality.stepScale;
    this.mobile = this._detectMobile();
    this.resize(true);
    return true;
  }

  setParams(params) {
    for (const param of PARAMETERS) {
      const value = Number(params?.[param.id]);
      if (Number.isFinite(value) && this.raytraceMaterial.uniforms[param.uniform]) {
        this.raytraceMaterial.uniforms[param.uniform].value = value;
      }
    }
    // These two are read by the composite stage.
    if (Number.isFinite(params?.exposure)) this.compositeMaterial.uniforms.uExposure.value = params.exposure;
    if (Number.isFinite(params?.bloomStrength)) this.compositeMaterial.uniforms.uBloomStrength.value = params.bloomStrength;
    if (Number.isFinite(params?.bloomThreshold)) this.brightMaterial.uniforms.uThreshold.value = params.bloomThreshold;
    if (Number.isFinite(params?.grain)) this.compositeMaterial.uniforms.uGrain.value = params.grain;
    if (Number.isFinite(params?.vignette)) this.compositeMaterial.uniforms.uVignette.value = params.vignette;
    if (Number.isFinite(params?.chromatic)) this.compositeMaterial.uniforms.uChromatic.value = params.chromatic;
  }

  setParam(param, value) {
    if (!param) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    if (this.raytraceMaterial.uniforms[param.uniform]) {
      this.raytraceMaterial.uniforms[param.uniform].value = v;
    }
    switch (param.id) {
      case 'exposure':
        this.compositeMaterial.uniforms.uExposure.value = v;
        break;
      case 'bloomStrength':
        this.compositeMaterial.uniforms.uBloomStrength.value = v;
        break;
      case 'bloomThreshold':
        this.brightMaterial.uniforms.uThreshold.value = v;
        break;
      case 'grain':
        this.compositeMaterial.uniforms.uGrain.value = v;
        break;
      case 'vignette':
        this.compositeMaterial.uniforms.uVignette.value = v;
        break;
      case 'chromatic':
        this.compositeMaterial.uniforms.uChromatic.value = v;
        break;
      default:
        break;
    }
  }

  setDebug(value) {
    const debug = clamp(Math.round(Number(value) || 0), 0, 9);
    this.raytraceMaterial.uniforms.uDebug.value = debug;
    this.compositeMaterial.uniforms.uDebug.value = debug;
  }

  _updateCameraUniforms(camera) {
    camera.updateMatrixWorld(true);
    const e = camera.matrixWorld.elements;
    this.raytraceMaterial.uniforms.uCameraPos.value.copy(camera.position);
    this.raytraceMaterial.uniforms.uCamRight.value.set(e[0], e[1], e[2]).normalize();
    this.raytraceMaterial.uniforms.uCamUp.value.set(e[4], e[5], e[6]).normalize();
    this.raytraceMaterial.uniforms.uCamForward.value.set(-e[8], -e[9], -e[10]).normalize();
    const focal = 1.0 / Math.tan(THREE.MathUtils.degToRad(clamp(camera.fov, 12, 100)) * 0.5);
    this.raytraceMaterial.uniforms.uFocal.value = focal;
  }

  _drawQuad(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(camera, timeSeconds) {
    if (this.contextLost) return false;
    if (!this.width || !this.height || !this.hdrTarget) return false;

    this._updateCameraUniforms(camera);
    this.raytraceMaterial.uniforms.uTime.value = timeSeconds;
    this.compositeMaterial.uniforms.uTime.value = timeSeconds;

    // 1. HDR geodesic pass.
    this._drawQuad(this.raytraceMaterial, this.hdrTarget);

    if (this.lastShaderError) {
      const error = new Error(this.lastShaderError);
      this.lastShaderError = null;
      throw error;
    }

    // 2. Bright pass.
    this.brightMaterial.uniforms.uScene.value = this.hdrTarget.texture;
    this.brightMaterial.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this._drawQuad(this.brightMaterial, this.bloomTargets[0].a);

    // 3. Blur and downsample pyramid.
    for (let i = 0; i < this.bloomTargets.length; i++) {
      const level = this.bloomTargets[i];
      if (i > 0) {
        const prev = this.bloomTargets[i - 1];
        this.downsampleMaterial.uniforms.uTexture.value = prev.a.texture;
        this.downsampleMaterial.uniforms.uTexel.value.set(1 / prev.w, 1 / prev.h);
        this._drawQuad(this.downsampleMaterial, level.a);
      }

      const blur = this.blurMaterial.uniforms;
      blur.uTexel.value.set(1 / level.w, 1 / level.h);

      blur.uTexture.value = level.a.texture;
      blur.uDirection.value.set(1, 0);
      this._drawQuad(this.blurMaterial, level.b);

      blur.uTexture.value = level.b.texture;
      blur.uDirection.value.set(0, 1);
      this._drawQuad(this.blurMaterial, level.a);
    }

    // 4. Composite to the drawing buffer.
    const composite = this.compositeMaterial.uniforms;
    composite.uScene.value = this.hdrTarget.texture;
    composite.uBloom0.value = this.bloomTargets[0]?.a.texture || this.blackTexture;
    composite.uBloom1.value = this.bloomTargets[1]?.a.texture || this.blackTexture;
    composite.uBloom2.value = this.bloomTargets[2]?.a.texture || this.blackTexture;
    composite.uBloom3.value = this.bloomTargets[3]?.a.texture || this.blackTexture;
    composite.uBloom4.value = this.bloomTargets[4]?.a.texture || this.blackTexture;
    composite.uBloom5.value = this.bloomTargets[5]?.a.texture || this.blackTexture;
    composite.uBloomLevels.value = this.bloomTargets.length;

    this._drawQuad(this.compositeMaterial, null);

    if (this.lastShaderError) {
      const error = new Error(this.lastShaderError);
      this.lastShaderError = null;
      throw error;
    }

    this.frameCount += 1;
    return true;
  }

  capture() {
    return this.canvas.toDataURL('image/png');
  }

  loseContextForTesting() {
    try {
      if (this.contextLost) return false;
      const extension = this.loseContextExtension || this.gl.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      this.loseContextExtension = extension;
      extension.loseContext();
      return true;
    } catch {
      return false;
    }
  }

  forceContextRestore() {
    try {
      this.restoreAttempts += 1;
      this.lastRestoreAt = performance.now();
      if (!this.contextLost) {
        this.renderer.forceContextRestore?.();
        return true;
      }
      const extension = this.loseContextExtension || this.gl.getExtension('WEBGL_lose_context');
      if (extension) {
        this.loseContextExtension = extension;
        extension.restoreContext();
        return true;
      }
      this.renderer.forceContextRestore?.();
      return true;
    } catch {
      return false;
    }
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this._disposeRenderTargets();
    this.blackTexture?.dispose();
    this.quadGeometry?.dispose();
    this.raytraceMaterial?.dispose();
    this.brightMaterial?.dispose();
    this.blurMaterial?.dispose();
    this.downsampleMaterial?.dispose();
    this.compositeMaterial?.dispose();
    this.renderer?.dispose();
  }

  getRenderInfo() {
    return {
      width: this.width,
      height: this.height,
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      devicePixelRatio: this.dpr,
      scale: this.width / Math.max(this.cssWidth, 1),
      quality: this.qualityName,
      maxSteps: this.quality.maxSteps,
      bloomLevels: this.bloomTargets.length,
      hdr: this.hdrLabel,
      frames: this.frameCount,
      contextLost: this.contextLost,
      mobile: this.mobile,
    };
  }

  getDiagnostics() {
    const info = this.getRenderInfo();
    let glVersion = '';
    let glVendor = '';
    let glRenderer = '';
    let maxTexture = this.maxTextureSize;
    try {
      const gl = this.renderer.getContext();
      glVersion = gl.getParameter(gl.VERSION) || '';
      glVendor = gl.getParameter(gl.VENDOR) || '';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      glRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '';
      maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || maxTexture;
    } catch {
      /* context may be lost */
    }
    return {
      ...info,
      contextLosses: this.contextLossCount,
      restoreAttempts: this.restoreAttempts,
      shaderError: this.lastShaderError,
      glVersion,
      glVendor,
      glRenderer,
      maxTextureSize: maxTexture,
      floatBuffers: this.floatBuffers,
      maxStepsLimit: this.quality.maxSteps,
    };
  }
}

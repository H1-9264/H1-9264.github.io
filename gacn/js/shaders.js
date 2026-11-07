/**
 * GARGANTUA — GLSL sources.
 *
 * The primary shader is a per-pixel, camera-to-infinity integration of the
 * Schwarzschild null geodesic in Cartesian form:
 *
 *     d²r/dλ² = -(3/2) r_s · h² · r / r⁵,   h = |r × dr/dλ|
 *
 * with r_s = 1. Every bright pixel of the disk, every photon-ring sub-image, and
 * all lensing of the procedural sky is produced by this integration. There are
 * no meshes, textures, billboards, videos, or screenshot elements in the render.
 */

export const fullscreenVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const blackHoleFragmentShader = /* glsl */ `
  precision highp float;
  precision highp int;

  varying vec2 vUv;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform vec3  uCameraPos;
  uniform vec3  uCamRight;
  uniform vec3  uCamUp;
  uniform vec3  uCamForward;
  uniform float uFocal;
  uniform float uStepScale;
  uniform int   uMaxSteps;
  uniform int   uDebug;

  // Accretion disk
  uniform float uDiskInner;
  uniform float uDiskOuter;
  uniform float uDiskBrightness;
  uniform float uDiskTemp;
  uniform float uTurbulence;
  uniform float uNoiseScale;
  uniform float uDiskSpeed;
  uniform float uDiskThickness;
  uniform float uDiskOpacity;
  uniform float uDoppler;
  uniform float uRedshift;
  uniform float uPhotonGlow;

  // Sky
  uniform float uSkyBrightness;
  uniform float uStarDensity;
  uniform float uMilkyway;

  #define PI      3.141592653589793
  #define TAU     6.283185307179586
  #define RS      1.0
  #define M_BH    0.5
  #define R_PH    1.5
  #define B_CRIT  2.598076211353316
  #define ESCAPE  56.0
  #define MAX_STEPS 520
  #define MAX_CROSSINGS 12
  #define LUM      vec3(0.2126, 0.7152, 0.0722)

  // ---------------------------------------------------------------------------
  // Hashing / noise
  // ---------------------------------------------------------------------------

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float vnoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }

  float fbm2(vec2 p, int octaves) {
    float sum = 0.0;
    float amp = 0.55;
    float norm = 0.0;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      if (i >= octaves) break;
      sum += amp * vnoise2(p);
      norm += amp;
      p = rot * p * 2.03 + vec2(13.7, 9.2);
      amp *= 0.5;
    }
    return sum / max(norm, 1e-5);
  }

  float fbm3(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.55;
    float norm = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      sum += amp * vnoise3(p);
      norm += amp;
      p = p * 2.07 + vec3(11.3, 7.1, 13.9);
      amp *= 0.5;
    }
    return sum / max(norm, 1e-5);
  }

  // ---------------------------------------------------------------------------
  // Physical colour
  // ---------------------------------------------------------------------------

  // Planckian locus (Kim et al. 2002), converted to linear sRGB and gamut-mapped.
  // Luminance-normalised: this is a chromaticity source, not a radiance scale.
  vec3 blackbodyColor(float kelvin) {
    float T = clamp(kelvin, 1000.0, 30000.0);
    float t = 1000.0 / T;

    float x;
    if (T < 4000.0) {
      x = -0.2661239 * t * t * t - 0.2343589 * t * t + 0.8776956 * t + 0.179910;
    } else {
      x = -3.0258469 * t * t * t + 2.1070379 * t * t + 0.2226347 * t + 0.240390;
    }

    float y;
    if (T < 2222.0) {
      y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
    } else if (T < 4000.0) {
      y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
    } else {
      y =  3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
    }

    float Y = 1.0;
    float X = x / max(y, 1e-4);
    float Z = (1.0 - x - y) / max(y, 1e-4);

    vec3 rgb = vec3(
       3.2406 * X - 1.5372 * Y - 0.4986 * Z,
      -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
       0.0557 * X - 0.2040 * Y + 1.0570 * Z
    );

    float mn = min(min(rgb.r, rgb.g), rgb.b);
    if (mn < 0.0) rgb -= mn;
    rgb = max(rgb, vec3(0.0));
    float lum = dot(rgb, LUM);
    return rgb / max(lum, 1e-4);
  }

  // ---------------------------------------------------------------------------
  // Procedural sky: Milky Way, dust lanes, resolved stars
  // ---------------------------------------------------------------------------

  vec3 starLayer(vec3 dir, float frequency, float presence, float size, float gain) {
    vec3 p = dir * frequency;
    vec3 ip = floor(p);
    vec3 fp = fract(p) - 0.5;
    float h = hash13(ip + vec3(17.31, 9.17, 4.73));
    if (h > presence) return vec3(0.0);

    vec3 jitter = vec3(
      hash13(ip + vec3(2.1, 8.3, 1.7)),
      hash13(ip + vec3(7.7, 3.3, 9.2)),
      hash13(ip + vec3(11.3, 5.1, 2.9))
    ) - 0.5;
    float d = length(fp - jitter * 0.68);

    float core = 1.0 - smoothstep(0.0, size, d);
    float halo = exp(-d * d / max(size * size * 3.2, 1e-5));
    float magnitude = pow(hash13(ip + vec3(31.7, 12.9, 8.1)), 3.0);
    float brightness = gain * (0.38 + 1.85 * magnitude);
    float temp = mix(2850.0, 14800.0, pow(hash13(ip + vec3(5.9, 21.1, 7.7)), 1.7));

    return blackbodyColor(temp) * (core * 2.6 + halo * 0.085) * brightness;
  }

  vec3 sampleSky(vec3 rawDir) {
    vec3 dir = normalize(rawDir);

    // The galactic plane sits above the aperture's center line. This keeps the
    // dusty band readable in the upper sky while its lower edge is lensed by
    // the photon sphere rather than hidden behind the accretion disk.
    vec3 galacticNormal = normalize(vec3(-0.048901, -0.998779, 0.007026));
    float lat = dot(dir, galacticNormal);

    vec3 warpP = dir * 4.3 + vec3(12.7, 3.1, 8.4);
    float warp = fbm3(warpP, 3) - 0.5;
    float latitude = lat + warp * 0.11;

    float broad = exp(-pow(abs(latitude) * 8.4, 1.8));
    broad *= 0.76 + 0.24 * fbm3(dir * 1.65 + vec3(4.1, 8.8, 1.2), 2);
    float ridge = exp(-pow(abs(latitude) * 19.0, 1.8));
    float spine = exp(-pow(abs(latitude) * 46.0, 2.0));

    vec3 cloudP = dir * 6.7 + vec3(3.3, 9.2, 4.7);
    float cloud = fbm3(cloudP, 4);
    float fine = fbm3(dir * 16.0 + vec3(5.5, 1.1, 9.9), 3);
    float cloudShape = smoothstep(0.30, 0.78, cloud);

    float dustWave = fbm3(dir * 11.4 + vec3(20.2, 4.7, 12.1), 3);
    float dustFine = fbm3(dir * 29.0 + vec3(4.3, 17.1, 6.2), 2);
    float dust = smoothstep(0.42, 0.69, dustWave);
    dust = max(dust, smoothstep(0.38, 0.62, dustWave * 0.7 + dustFine * 0.4) * 0.82);
    dust *= 0.32 + 0.68 * broad;

    // The narrow ridge is the actual galactic plane; the broad component is
    // the unresolved halo. Dust extinction cuts dark lanes through both.
    float density = broad * (0.06 + 0.62 * cloudShape * cloudShape + 0.07 * fine);
    density += ridge * cloudShape * 0.60;
    density *= 1.0 - 0.94 * dust;
    float core = exp(-pow(abs(latitude) * 26.0, 1.8));

    vec3 coldTint = vec3(0.016, 0.030, 0.062);
    vec3 warmTint = vec3(0.135, 0.078, 0.032);
    vec3 tint = mix(coldTint, warmTint, clamp(cloud * 1.45 + fine * 0.28, 0.0, 1.0));

    // A structured galactic spine: cool bright core, warm dust shoulders.
    vec3 galaxy = tint * density * 1.55 * uMilkyway;
    galaxy += vec3(0.22, 0.255, 0.35) * ridge * cloudShape * 0.70 * uMilkyway;
    galaxy += vec3(0.52, 0.60, 0.80) * core * pow(cloudShape, 1.5) * 0.46 * uMilkyway;
    galaxy += vec3(0.62, 0.52, 0.36) * spine * (0.30 + 0.70 * cloudShape) * (1.0 - 0.78 * dust) * 0.44 * uMilkyway;
    galaxy += vec3(0.055, 0.042, 0.028) * pow(broad, 3.0) * smoothstep(0.35, 0.82, cloud) * uMilkyway;

    // A restrained cool nebula, well off the galactic plane.
    float nebulaA = fbm3(dir * 3.9 + vec3(7.7, 18.2, 3.4), 3);
    float nebulaB = fbm3(dir * 9.1 + vec3(2.2, 8.8, 14.6), 2);
    float nebulaMask = smoothstep(0.52, 0.76, nebulaA) * smoothstep(0.40, 0.72, nebulaB);
    galaxy += vec3(0.0034, 0.0068, 0.0104) * nebulaMask * uMilkyway;
    galaxy += vec3(0.0068, 0.0029, 0.0025) * smoothstep(0.58, 0.82, nebulaB) * 0.45 * uMilkyway;

    // Resolved population. Different cell scales avoid a single repeating grid.
    vec3 stars = vec3(0.0);
    float sd = clamp(uStarDensity, 0.0, 2.0);
    stars += starLayer(dir, 113.0, 0.030 * sd, 0.030, 1.55);
    stars += starLayer(dir, 61.0, 0.052 * sd, 0.028, 1.35);
    stars += starLayer(dir, 29.0, 0.080 * sd, 0.026, 1.00);
    stars += starLayer(dir, 17.0, 0.095 * sd, 0.025, 0.62);
    stars += starLayer(dir, 9.0, 0.110 * sd, 0.023, 0.30);

    // Faint unresolved glow keeps the sky from becoming a flat black plate.
    vec3 haze = vec3(0.00032, 0.00050, 0.00088) * (0.35 + 0.65 * fine);
    vec3 color = galaxy + stars * (0.80 + 0.55 * broad + 0.95 * ridge + 1.30 * spine) + haze;

    return color * uSkyBrightness;
  }

  // ---------------------------------------------------------------------------
  // Accretion disk
  // ---------------------------------------------------------------------------

  struct DiskSample {
    vec3  emission;
    float alpha;
    float doppler;
    float redshift;
    float temperature;
    float density;
  };

  DiskSample emptyDiskSample() {
    DiskSample s;
    s.emission = vec3(0.0);
    s.alpha = 0.0;
    s.doppler = 1.0;
    s.redshift = 1.0;
    s.temperature = 0.0;
    s.density = 0.0;
    return s;
  }

  DiskSample sampleDisk(vec3 hit, vec3 marchVelocity) {
    DiskSample s = emptyDiskSample();

    float r = length(hit.xz);
    float inner = uDiskInner;
    float outer = max(uDiskOuter, inner + 0.6);
    if (r < inner * 0.91 || r > outer * 1.035) return s;

    float innerMask = smoothstep(inner, inner + max(inner * 0.045, 0.04), r);
    float outerMask = 1.0 - smoothstep(outer * 0.84, outer, r);
    float radialMask = innerMask * outerMask;
    if (radialMask < 0.002) return s;

    float x = max(r / inner, 1.0001);
    float tempProfile = 2.049 * pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0), 0.25);
    tempProfile = clamp(tempProfile, 0.0, 1.18);

    float omega = sqrt(M_BH / (r * r * r));
    float beta = min(sqrt(M_BH / max(r - 2.0 * M_BH, 0.10)), 0.90);
    float gamma = inversesqrt(max(1.0 - beta * beta, 1e-4));

    vec3 radialDir = normalize(vec3(hit.x, 0.0, hit.z));
    vec3 tangent = vec3(radialDir.z, 0.0, -radialDir.x);
    vec3 betaVec = tangent * beta;
    vec3 photonTowardObserver = -normalize(marchVelocity);

    float doppler = 1.0 / max(gamma * (1.0 - dot(betaVec, photonTowardObserver)), 0.035);
    float grav = sqrt(max(1.0 - RS / r, 0.025));

    float dopplerAdj = pow(max(doppler, 0.05), uDoppler);
    float gravAdj = pow(max(grav, 0.05), uRedshift);
    float g = clamp(dopplerAdj * gravAdj, 0.06, 4.2);

    float phi = atan(hit.z, hit.x);
    float spin = -uTime * uDiskSpeed * omega * 3.6;
    float cs = cos(spin);
    float sn = sin(spin);
    vec2 rotated = vec2(
      hit.x * cs - hit.z * sn,
      hit.x * sn + hit.z * cs
    );

    float lr = log(max(r, 0.2));
    float ns = max(uNoiseScale, 0.05);

    // Polar-domain turbulence. The azimuth is sheared by the local Keplerian
    // rate, so the field is continuously wound into spirals instead of
    // producing concentric grooves. cos/sin keep the domain seamless at 2π.
    // Slow differential winding. The phase advance across the disk is kept
    // below roughly one revolution so the shear reads as spiral eddies rather
    // than a stack of concentric grooves.
    float windPhase = uTime * uDiskSpeed * 0.45 * sqrt(6.0 / max(r, 1.0));
    float shearAngle = phi - windPhase;

    // Two-scale domain warp on both coordinates: the angular warp breaks the
    // rotational symmetry, the radial warp breaks ring-like correlation.
    vec2 warpA = vec2(
      sin(shearAngle * 2.0 + 1.3) * 0.55 + sin(shearAngle * 5.0 - 0.7) * 0.25,
      cos(shearAngle * 3.0 + 2.1) * 0.42 + sin(shearAngle * 7.0 + 0.4) * 0.18
    );
    float radial = lr * 0.62 + warpA.y * 0.55 + warpA.x * 0.22;

    vec3 q1 = vec3(cos(shearAngle + warpA.y * 0.35), sin(shearAngle + warpA.y * 0.35), radial * 1.55) * (ns * 0.80);
    vec3 q2 = vec3(cos(shearAngle * 1.7 + 1.7 + warpA.x * 0.3), sin(shearAngle * 1.7 + 1.7 + warpA.x * 0.3), radial * 3.2 + 0.4) * (ns * 1.25);
    vec3 q3 = vec3(cos(shearAngle * 2.6 - 0.6), sin(shearAngle * 2.6 - 0.6), radial * 6.1) * (ns * 2.05);

    float n1 = fbm3(q1 + vec3(0.0, 0.0, -uTime * 0.010), 4);
    float n2 = fbm3(q2 + vec3(0.0, 0.0, uTime * 0.018), 3);
    float n3 = fbm3(q3 + vec3(0.0, 0.0, -uTime * 0.030), 2);

    float filaments = smoothstep(0.34, 0.74, n1 * 0.62 + n2 * 0.30 + n3 * 0.14);
    float larger = smoothstep(0.38, 0.68, n2 * 0.60 + n3 * 0.24 + 0.16);
    float fine = smoothstep(0.48, 0.80, n3);

    // Broad and narrow emission mixed with a squared term: high contrast,
    // without crushing the mid-tones into flat white.
    float texture = 0.08 + 0.92 * filaments * filaments + 0.38 * larger + 0.24 * fine;
    texture *= 0.52 + 0.48 * n1;
    texture += 0.14 * smoothstep(0.56, 0.86, n2 * 0.5 + n3 * 0.5);
    texture = mix(1.0, texture, clamp(uTurbulence, 0.0, 1.5) * 0.90);

    // One coherent hot clump, sheared by the same Keplerian field.
    float clumpPhase = mod(2.25 + uTime * uDiskSpeed * omega * 2.4, TAU);
    float angle = atan(sin(phi - clumpPhase), cos(phi - clumpPhase));
    float hotClump = exp(-angle * angle * 23.0) * exp(-pow((r - (inner + 1.45)) / 0.62, 2.0));
    texture += hotClump * 0.42;

    float density = clamp(radialMask * texture, 0.0, 2.5);
    if (density < 0.004) return s;

    float mu = max(abs(normalize(marchVelocity).y), 0.018);
    float tau = uDiskOpacity * density * (0.62 + 0.94 * uDiskThickness / max(mu, 0.030));
    float alpha = 1.0 - exp(-max(tau, 0.0));
    alpha = clamp(alpha, 0.0, 0.985);

    float tEmit = uDiskTemp * tempProfile;
    tEmit *= 1.0 + 0.24 * hotClump;
    float tObserved = tEmit * g;
    vec3 bb = blackbodyColor(tObserved);

    float intrinsic = pow(clamp(tEmit / max(uDiskTemp, 1.0), 0.0, 1.4), 4.0);
    float beaming = pow(g, 4.0);
    float radiance = uDiskBrightness * intrinsic * beaming;
    radiance *= 0.10 + 1.02 * clamp(texture, 0.0, 2.2);
    radiance *= mix(0.72, 1.28, clamp(uDiskThickness / 0.45, 0.0, 1.0));
    radiance = min(radiance, 64.0);

    s.emission = bb * radiance;
    s.alpha = alpha;
    s.doppler = dopplerAdj;
    s.redshift = gravAdj;
    s.temperature = tObserved;
    s.density = density;
    return s;
  }

  vec3 geodesicAcceleration(vec3 p, float h2) {
    float r2 = max(dot(p, p), 1e-5);
    float r = sqrt(r2);
    float invR5 = 1.0 / max(r2 * r2 * r, 1e-5);
    return (-1.5 * h2 * invR5) * p;
  }

  // ---------------------------------------------------------------------------
  // False-colour palettes (debug views write display values directly)
  // ---------------------------------------------------------------------------

  vec3 heatPalette(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c = vec3(0.012, 0.010, 0.030);
    c = mix(c, vec3(0.25, 0.045, 0.23), smoothstep(0.02, 0.34, t));
    c = mix(c, vec3(0.90, 0.26, 0.045), smoothstep(0.28, 0.70, t));
    c = mix(c, vec3(1.00, 0.93, 0.72), smoothstep(0.70, 1.0, t));
    return c;
  }

  vec3 coolPalette(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c = vec3(0.010, 0.018, 0.030);
    c = mix(c, vec3(0.030, 0.22, 0.36), smoothstep(0.0, 0.42, t));
    c = mix(c, vec3(0.24, 0.76, 0.82), smoothstep(0.38, 0.72, t));
    c = mix(c, vec3(0.94, 0.99, 0.96), smoothstep(0.72, 1.0, t));
    return c;
  }

  vec3 dopplerPalette(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) {
      return mix(vec3(0.035, 0.15, 0.42), vec3(0.91, 0.96, 1.00), t * 2.0);
    }
    return mix(vec3(1.00, 0.93, 0.78), vec3(0.95, 0.18, 0.015), (t - 0.5) * 2.0);
  }

  // ---------------------------------------------------------------------------
  // Main ray integration
  // ---------------------------------------------------------------------------

  void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
    vec3 localDir = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamForward * uFocal);

    vec3 ro = uCameraPos;
    float rCamera = length(ro);
    vec3 rhat = normalize(ro);

    // Static-observer initial condition. E = 1. Omitting this finite-radius
    // correction biases every impact parameter and the shadow diameter.
    float fStatic = inversesqrt(max(1.0 - RS / rCamera, 0.018));
    vec3 v0 = fStatic * localDir - (fStatic - 1.0) * dot(localDir, rhat) * rhat;

    vec3 p = ro;
    vec3 v = v0;
    vec3 hVec = cross(p, v);
    float h2 = dot(hVec, hVec);
    float hMag = sqrt(max(h2, 0.0));
    float impactB = hMag;

    vec3 diskAccum = vec3(0.0);
    vec3 lastDiskColor = vec3(0.0);
    float transmittance = 1.0;
    float winding = 0.0;
    float minRadius = 1e8;
    float gDopplerSum = 0.0;
    float gGravSum = 0.0;
    float debugWeightSum = 1e-6;
    int crossings = 0;
    int stepsUsed = uMaxSteps;
    bool captured = false;
    bool escaped = false;

    bool wantDisk = (uDebug != 9 && uDebug != 2 && uDebug != 8);
    bool wantSky = (uDebug == 0 || uDebug == 1 || uDebug == 6 || uDebug == 7 || uDebug == 9);

    for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
      if (stepIndex >= uMaxSteps) {
        stepsUsed = stepIndex;
        break;
      }

      float r = length(p);
      minRadius = min(minRadius, r);

      if (r <= RS * 1.0015) {
        captured = true;
        stepsUsed = stepIndex;
        break;
      }

      if (r > ESCAPE && dot(p, v) > 0.0) {
        escaped = true;
        stepsUsed = stepIndex;
        break;
      }

      float speed = length(v);
      float dtRadial = 0.115 * max(r - RS, 0.025) / max(speed, 0.10);
      float dtAngular = 0.050 * r * r / max(hMag, 0.08);
      float dt = min(dtRadial, dtAngular);
      dt = clamp(dt, 0.0055, 0.75) * uStepScale;

      vec3 prevP = p;
      vec3 prevV = v;

      // Classical RK4 on (position, affine velocity). h² is conserved exactly.
      vec3 k1p = v;
      vec3 k1v = geodesicAcceleration(p, h2);

      vec3 k2p = v + 0.5 * dt * k1v;
      vec3 k2v = geodesicAcceleration(p + 0.5 * dt * k1p, h2);

      vec3 k3p = v + 0.5 * dt * k2v;
      vec3 k3v = geodesicAcceleration(p + 0.5 * dt * k2p, h2);

      vec3 k4p = v + dt * k3v;
      vec3 k4v = geodesicAcceleration(p + dt * k3p, h2);

      p += (dt / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);
      v += (dt / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

      // Project back onto the null first integral by adjusting only the radial
      // component. This kills drift on near-critical rays without perturbing h.
      float nr2 = max(dot(p, p), 1e-6);
      float nr = sqrt(nr2);
      if (nr > RS * 1.02) {
        vec3 nhat = p / nr;
        float targetV2 = 1.0 + h2 / (nr2 * nr);
        float radialNow = dot(v, nhat);
        float tangential2 = max(dot(v, v) - radialNow * radialNow, 0.0);
        float radial2 = max(targetV2 - tangential2, 0.0);
        float radialNew = (radialNow >= 0.0 ? 1.0 : -1.0) * sqrt(radial2);
        v += (radialNew - radialNow) * nhat;
      }

      // Accumulate orbital angle for diagnostics and the photon corona.
      if (r > 1.05 && nr > 1.05) {
        float cosTurn = clamp(dot(prevP, p) / max(length(prevP) * nr, 1e-6), -1.0, 1.0);
        winding += acos(cosTurn);
      }


      // Equatorial plane crossing, refined with a cubic Hermite solve.
      if (wantDisk && crossings < MAX_CROSSINGS && prevP.y * p.y <= 0.0 && prevP.y != p.y) {
        float y0 = prevP.y;
        float y1 = p.y;
        float m0 = prevV.y * dt;
        float m1 = v.y * dt;
        float tc = clamp(y0 / (y0 - y1), 0.0, 1.0);

        for (int refine = 0; refine < 2; refine++) {
          float t2 = tc * tc;
          float t3 = t2 * tc;
          float yy = (2.0 * t3 - 3.0 * t2 + 1.0) * y0
                   + (t3 - 2.0 * t2 + tc) * m0
                   + (-2.0 * t3 + 3.0 * t2) * y1
                   + (t3 - t2) * m1;
          float dy = (6.0 * t2 - 6.0 * tc) * y0
                   + (3.0 * t2 - 4.0 * tc + 1.0) * m0
                   + (-6.0 * t2 + 6.0 * tc) * y1
                   + (3.0 * t2 - 2.0 * tc) * m1;
          if (abs(dy) > 1e-6) tc = clamp(tc - yy / dy, 0.0, 1.0);
        }

        float t2 = tc * tc;
        float t3 = t2 * tc;
        float h00 =  2.0 * t3 - 3.0 * t2 + 1.0;
        float h10 =  t3 - 2.0 * t2 + tc;
        float h01 = -2.0 * t3 + 3.0 * t2;
        float h11 =  t3 - t2;
        vec3 hit = h00 * prevP + h10 * dt * prevV + h01 * p + h11 * dt * v;
        vec3 hitV = normalize(mix(prevV, v, tc) + vec3(0.0, 1e-8, 0.0));

        DiskSample ds = sampleDisk(hit, hitV);
        if (ds.alpha > 0.002) {
          float weight = ds.alpha * max(dot(ds.emission, LUM), 0.001);
          diskAccum += transmittance * ds.emission * ds.alpha;
          transmittance *= (1.0 - ds.alpha);
          lastDiskColor = ds.emission * ds.alpha;
          gDopplerSum += ds.doppler * weight;
          gGravSum += ds.redshift * weight;
          debugWeightSum += weight;
          crossings += 1;
        }
      }
    }

    // Classify an incomplete integration as captured: near-critical rays that
    // exhaust their budget belong to the shadow boundary, not to the sky.
    if (!escaped && !captured) captured = true;

    // Optically thin photon-sphere corona. The emission above the shadow is a
    // smooth function of the ray's closest approach to the photon sphere, so
    // it produces a clean critical ring instead of dashed step samples.
    if (uDebug != 9 && uPhotonGlow > 0.0 && escaped && minRadius < 2.6) {
      float prox = exp(-pow((minRadius - R_PH) / 0.34, 2.0));
      float outerCut = 1.0 - smoothstep(2.05, 2.6, minRadius);
      float corona = prox * outerCut * uPhotonGlow * 2.6;
      vec3 coronaColor = blackbodyColor(12400.0) * vec3(0.86, 0.93, 1.0);
      diskAccum += transmittance * coronaColor * corona * 0.28;
    }

    vec3 skyColor = vec3(0.0);
    if (escaped && wantSky) {
      skyColor = sampleSky(normalize(v));
      diskAccum += transmittance * skyColor;
    }

    vec3 color = diskAccum;
    float diskLuminance = dot(diskAccum, LUM);
    float avgDoppler = gDopplerSum / max(debugWeightSum, 1e-6);
    float avgGrav = gGravSum / max(debugWeightSum, 1e-6);

    // -- Diagnostic renders ---------------------------------------------------
    if (uDebug == 1) {
      float wt = clamp(winding / (TAU * 2.2), 0.0, 1.0);
      vec3 c = vec3(0.014, 0.020, 0.030);
      c = mix(c, vec3(0.055, 0.24, 0.35), pow(wt, 0.55) * 0.95);
      if (escaped) c += vec3(0.015, 0.055, 0.070) * (0.5 + 0.5 * wt);
      if (captured) c *= 0.24;
      c += vec3(1.0, 0.58, 0.20) * smoothstep(0.015, 1.4, diskLuminance) * 0.85;
      c += vec3(0.95, 0.98, 1.0) * pow(wt, 6.0) * 0.08;
      color = c;

    } else if (uDebug == 2) {
      float ratio = impactB / B_CRIT;
      float delta = abs(ratio - 1.0);
      float contour = 1.0 - smoothstep(0.0, 0.014, delta);
      vec3 c = captured ? vec3(0.025, 0.035, 0.052) : vec3(0.025, 0.12, 0.18);
      c += vec3(0.10, 0.45, 0.58) * (1.0 - smoothstep(0.0, 0.45, delta)) * (captured ? 0.0 : 0.8);
      c += vec3(1.0, 0.70, 0.27) * contour * 1.05;
      c += vec3(0.85, 0.95, 1.0) * (1.0 - smoothstep(0.0, 0.006, delta)) * 0.45;
      float rings = 1.0 - smoothstep(0.0, 0.05, abs(fract(ratio * 6.0) - 0.5) - 0.44);
      c += vec3(0.06, 0.14, 0.18) * rings * 0.22;
      color = c;

    } else if (uDebug == 3) {
      if (crossings == 0) {
        color = vec3(0.008, 0.012, 0.020);
      } else {
        float ct = clamp(float(crossings) / 5.0, 0.0, 1.0);
        vec3 c = heatPalette(ct);
        c = mix(c, coolPalette(clamp(log(1.0 + diskLuminance) * 0.18, 0.0, 1.0)), 0.22);
        color = c;
      }

    } else if (uDebug == 4) {
      if (crossings == 0) {
        color = vec3(0.008, 0.010, 0.016);
      } else {
        float t = clamp((avgDoppler - 0.52) / 1.05, 0.0, 1.0);
        color = dopplerPalette(t);
      }

    } else if (uDebug == 5) {
      if (crossings == 0) {
        color = vec3(0.008, 0.010, 0.016);
      } else {
        float t = clamp((avgGrav - 0.64) / 0.32, 0.0, 1.0);
        color = mix(vec3(0.35, 0.025, 0.012), vec3(1.0, 0.90, 0.70), pow(t, 1.3));
      }

    } else if (uDebug == 6) {
      float lum = dot(color, LUM);
      float t = clamp((log2(max(lum, 1e-5)) + 9.0) / 11.0, 0.0, 1.0);
      color = heatPalette(t);
      color += vec3(0.6, 0.75, 0.85) * smoothstep(0.12, 0.32, lum) * 0.08;

    } else if (uDebug == 8) {
      float t = clamp(float(stepsUsed) / float(uMaxSteps), 0.0, 1.0);
      vec3 c = coolPalette(t);
      c = mix(c, heatPalette(pow(t, 1.7)), smoothstep(0.55, 1.0, t) * 0.75);
      c += vec3(0.95, 0.9, 0.7) * pow(clamp(winding / (TAU * 2.0), 0.0, 1.0), 5.0) * 0.55;
      color = c;
    }

    // Saturated HDR guard; display transform lives in the composite pass.
    color = min(color, vec3(80.0));
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  }
`;

export const brightPassFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform vec2 uTexel;
  uniform float uThreshold;

  void main() {
    // A small 4-tap prefilter suppresses single-pixel bloom sparkle.
    vec2 o = uTexel * 0.75;
    vec3 c = texture2D(uScene, vUv).rgb * 0.40;
    c += texture2D(uScene, vUv + o).rgb * 0.15;
    c += texture2D(uScene, vUv - o).rgb * 0.15;
    c += texture2D(uScene, vUv + vec2(o.x, -o.y)).rgb * 0.15;
    c += texture2D(uScene, vUv + vec2(-o.x, o.y)).rgb * 0.15;

    float brightness = max(max(c.r, c.g), c.b);
    float knee = max(uThreshold * 0.55, 0.05);
    float soft = clamp(brightness - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / max(4.0 * knee + 0.0001, 0.0001);
    float contribution = max(soft, brightness - uThreshold) / max(brightness, 0.0001);
    contribution = clamp(contribution, 0.0, 1.0);
    gl_FragColor = vec4(c * contribution, 1.0);
  }
`;

export const downsampleFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uTexel;

  void main() {
    vec2 o = uTexel * 0.5;
    vec3 c = texture2D(uTexture, vUv + vec2(-o.x, -o.y)).rgb;
    c += texture2D(uTexture, vUv + vec2( o.x, -o.y)).rgb;
    c += texture2D(uTexture, vUv + vec2(-o.x,  o.y)).rgb;
    c += texture2D(uTexture, vUv + vec2( o.x,  o.y)).rgb;
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;

export const blurFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uTexel;
  uniform vec2 uDirection;

  void main() {
    vec2 delta = uTexel * uDirection;
    vec3 c = texture2D(uTexture, vUv).rgb * 0.227027;
    c += texture2D(uTexture, vUv + delta * 1.384615).rgb * 0.316216;
    c += texture2D(uTexture, vUv - delta * 1.384615).rgb * 0.316216;
    c += texture2D(uTexture, vUv + delta * 3.230769).rgb * 0.070270;
    c += texture2D(uTexture, vUv - delta * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export const compositeFragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uScene;
  uniform sampler2D uBloom0;
  uniform sampler2D uBloom1;
  uniform sampler2D uBloom2;
  uniform sampler2D uBloom3;
  uniform sampler2D uBloom4;
  uniform sampler2D uBloom5;

  uniform vec2  uResolution;
  uniform float uTime;
  uniform float uExposure;
  uniform float uBloomStrength;
  uniform float uGrain;
  uniform float uVignette;
  uniform float uChromatic;
  uniform int   uDebug;
  uniform int   uBloomLevels;

  #define LUM vec3(0.2126, 0.7152, 0.0722)

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 acesFilmic(vec3 x) {
    // Narkowicz ACES fit. Slightly raised black and controlled highlights.
    x = max(x, vec3(0.0));
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  vec3 linearToSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  vec3 sampleBloom(vec2 uv) {
    vec3 b = texture2D(uBloom0, uv).rgb * 0.315;
    b += texture2D(uBloom1, uv).rgb * 0.257;
    b += texture2D(uBloom2, uv).rgb * 0.196;
    b += texture2D(uBloom3, uv).rgb * 0.137;
    b += texture2D(uBloom4, uv).rgb * 0.095;
    b += texture2D(uBloom5, uv).rgb * 0.000;
    return b;
  }

  void main() {
    vec2 uv = vUv;
    bool falseColour = (uDebug >= 1 && uDebug <= 6) || uDebug == 8;
    bool bloomOnly = (uDebug == 7);

    vec3 scene = texture2D(uScene, uv).rgb;
    vec2 centered = uv - 0.5;
    centered.x *= uResolution.x / max(uResolution.y, 1.0);

    if (!falseColour && !bloomOnly) {
      // Radial lateral chromatic aberration. It is deliberately tiny.
      vec2 dir = uv - 0.5;
      float radial2 = dot(dir, dir);
      vec2 shift = dir * radial2 * uChromatic * 0.0042;
      vec3 split;
      split.r = texture2D(uScene, uv + shift).r;
      split.g = scene.g;
      split.b = texture2D(uScene, uv - shift).b;
      scene = split;
    }

    vec3 bloom = sampleBloom(uv);
    vec3 color;

    if (falseColour) {
      color = scene;
    } else if (bloomOnly) {
      color = bloom * uBloomStrength * 2.4;
      color = acesFilmic(color * uExposure);
      color = linearToSRGB(color);
    } else {
      color = (scene + bloom * uBloomStrength) * uExposure;
      color = acesFilmic(color);
      color = linearToSRGB(color);
    }

    if (!falseColour) {
      // A tiny chroma boost keeps thermal colour separation legible after ACES.
      float chroma = dot(color, LUM);
      color = mix(vec3(chroma), color, 1.065);
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 vp = uv - 0.5;
      vp.x *= aspect;
      float vig = 1.0 - uVignette * 0.80 * pow(smoothstep(0.08, 1.28, length(vp)), 1.55);
      color *= clamp(vig, 0.0, 1.0);
    }

    // Grain is applied in display space so it behaves like a scanned plate.
    vec2 grainSeed = uv * uResolution + vec2(fract(uTime * 0.713) * 293.1, fract(uTime * 0.371) * 177.7);
    float grain = hash12(grainSeed) - 0.5;
    float grainMask = falseColour ? 0.35 : 1.0;
    color += grain * uGrain * 0.065 * grainMask * (0.35 + 0.65 * (1.0 - clamp(dot(color, LUM), 0.0, 1.0)));

    // Ordered-ish dither prevents banding in the deep shadows.
    float dither = (hash12(uv * uResolution + vec2(7.3, 13.1)) - 0.5) / 255.0;
    color += dither;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

import { MAX_LAYERS } from './types'

/**
 * The fragment shader is the generator.
 *
 * Each layer is a closed-form transmission T(x, y) in [0, 1].
 * A sinusoidal grating is ½ + ½ cos(2πφ).
 * A ruling is the Lanczos-windowed Fourier series of a dark fraction d:
 *   a₀ = 1 − d
 *   aₙ = −2 d sinc(n d) sinc(n / (N+1))
 *   T = clamp(a₀ + Σ aₙ cos(2π n φ), 0, 1)
 * Transmission blend multiplies the filters, which is the physical stack.
 * The visible fringe is the difference frequency of that product.
 * Samples average the product over the pixel, the discrete form of the optical integral.
 */

function fetchers(max: number): string {
  return ['A', 'B', 'C', 'D', 'E', 'F']
    .map((name) => {
      const body = [`vec4 fetch${name}(int i) {`]
      for (let i = 0; i < max; i++) body.push(`  if (i == ${i}) return u${name}[${i}];`)
      body.push(`  return u${name}[0];`, '}')
      return body.join('\n')
    })
    .join('\n')
}

export function fragmentSource(max = MAX_LAYERS): string {
  return `#version 300 es
precision highp float;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

uniform vec2 uResolution;
uniform float uTime;
uniform float uMotion;
uniform int uCount;
uniform int uBlend;
uniform int uSamples;
uniform float uExposure;
uniform float uGamma;
uniform float uContrast;
uniform float uSaturation;
uniform float uInvert;
uniform float uThreshold;
uniform float uVignette;
uniform float uIris;
uniform float uChroma;
uniform float uKaleido;
uniform float uTile;
uniform float uGlobalScale;
uniform float uPulseAmp;
uniform float uPulseCycles;
uniform float uGlobalRot;
uniform float uGlobalRotCycles;

uniform vec4 uA[${max}];
uniform vec4 uB[${max}];
uniform vec4 uC[${max}];
uniform vec4 uD[${max}];
uniform vec4 uE[${max}];
uniform vec4 uF[${max}];

out vec4 oColor;

${fetchers(max)}

float sinc(float x) {
  float ax = abs(x);
  if (ax < 1e-4) return 1.0;
  return sin(PI * x) / (PI * x);
}

float sinusoidT(float phi) {
  return 0.5 + 0.5 * cos(TAU * phi);
}

float rulingT(float phi, float duty, float harmonics) {
  float D = clamp(duty, 0.0, 1.0);
  float N = clamp(floor(harmonics + 0.5), 1.0, 24.0);
  float sum = 1.0 - D;
  for (int n = 1; n <= 24; n++) {
    float nf = float(n);
    if (nf > N) break;
    float sigma = sinc(nf / (N + 1.0));
    float an = -2.0 * D * sinc(nf * D) * sigma;
    sum += an * cos(TAU * nf * phi);
  }
  return clamp(sum, 0.0, 1.0);
}

float grating(float phi, float duty, float harmonics, float profile) {
  if (profile < 0.5) return sinusoidT(phi);
  return rulingT(phi, duty, harmonics);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float disk(float d, float radius, float profile, float w) {
  if (profile < 0.5) {
    if (d >= radius) return 1.0;
    return 0.5 - 0.5 * cos(PI * d / max(radius, 1e-4));
  }
  return smoothstep(radius - w, radius + w, d);
}

float squareDots(vec2 q, float freq, float radius, float profile, float px) {
  vec2 gv = fract(q * freq) - 0.5;
  return disk(length(gv), radius, profile, abs(freq) * px);
}

float hexDots(vec2 q, float freq, float radius, float profile, float px) {
  vec2 p = q * freq;
  vec2 s = vec2(1.0, 1.7320508075688772);
  vec2 h = 0.5 * s;
  vec2 a = mod(p, s) - h;
  vec2 b = mod(p - h, s) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return disk(length(gv), radius, profile, abs(freq) * px);
}

float patternOf(vec4 A, vec4 B, vec4 C, vec4 D, vec4 E, vec2 p, float px) {
  int kind = int(floor(A.x + 0.5));
  float profile = A.z;
  float harmonics = A.w;
  float freq = B.x;
  float freqB = B.y;
  float ang = B.z + TAU * C.y * uMotion * uTime;
  float phase = B.w / TAU + C.x * uMotion * uTime;
  float duty = C.z;
  float orbit = TAU * D.w * uMotion * uTime;
  vec2 center = vec2(D.x, D.y) + D.z * vec2(cos(orbit), sin(orbit));
  vec2 q = rot(p - center, -ang);
  q.y *= max(E.x, 0.05);
  if (E.y != 0.0) q.x += E.y * sin(TAU * (E.z * q.y + phase));

  if (kind == 0) return grating(freq * q.x + phase, duty, harmonics, profile);
  if (kind == 1) {
    float arms = max(floor(freq + 0.5), 1.0);
    return grating(arms * atan(q.y, q.x) / TAU + phase, duty, harmonics, profile);
  }
  if (kind == 2) return grating(freq * length(q) + phase, duty, harmonics, profile);
  if (kind == 3) {
    float r = length(q);
    return grating(freq * 4.0 * r * r + phase, duty, harmonics, profile);
  }
  if (kind == 4) {
    float arms = max(floor(freqB + 0.5), 1.0);
    return grating(arms * atan(q.y, q.x) / TAU + freq * length(q) + phase, duty, harmonics, profile);
  }
  if (kind == 5) {
    float arms = max(floor(freqB + 0.5), 1.0);
    float r = max(length(q), 1e-4);
    return grating(arms * atan(q.y, q.x) / TAU + freq * log(r) + phase, duty, harmonics, profile);
  }
  if (kind == 6 || kind == 7) {
    float radius = clamp(duty, 0.0, 1.0) * 0.5;
    if (kind == 7) return hexDots(q, freq, radius, profile, px);
    return squareDots(q, freq, radius, profile, px);
  }
  if (kind == 8) {
    return grating(freq * q.x + phase, duty, harmonics, profile)
      * grating(freq * freqB * q.y + phase, duty, harmonics, profile);
  }
  float ax = grating(freq * q.x + phase, 0.5, harmonics, profile);
  float ay = grating(freq * q.y + phase, 0.5, harmonics, profile);
  return ax + ay - 2.0 * ax * ay;
}

vec3 combine(vec2 p, float px) {
  vec3 transmission = vec3(1.0);
  float field = 1.0;
  vec3 tintAcc = vec3(1.0);
  vec3 acc = vec3(0.0);
  vec3 inv = vec3(1.0);
  float weight = 0.0;
  float started = 0.0;
  float any = 0.0;

  for (int i = 0; i < ${max}; i++) {
    if (i >= uCount) break;
    vec4 A = fetchA(i);
    if (A.y < 0.5) continue;
    vec4 B = fetchB(i);
    vec4 C = fetchC(i);
    vec4 D = fetchD(i);
    vec4 E = fetchE(i);
    vec4 F = fetchF(i);
    float pat = patternOf(A, B, C, D, E, p, px);
    float opacity = C.w;
    // pat is the transmission of a neutral ruling: 1 clear, 0 absorber.
    // The gel dyes that absorber. Clear film stays clear, so stacked colors
    // stay luminous and a neutral layer is exactly pat.
    vec3 ink = mix(vec3(0.0), F.rgb, E.w);
    vec3 film = mix(ink, vec3(1.0), pat);
    vec3 gel = mix(vec3(1.0), F.rgb, E.w);
    any = 1.0;

    if (uBlend == 0) {
      transmission *= mix(vec3(1.0), film, opacity);
    } else if (uBlend == 1) {
      field *= mix(1.0, pat * 2.0 - 1.0, opacity);
      tintAcc *= mix(vec3(1.0), gel, opacity);
    } else if (uBlend == 2) {
      vec3 shown = mix(vec3(1.0), film, opacity);
      acc = started > 0.5 ? abs(acc - shown) : shown;
      started = 1.0;
    } else if (uBlend == 3) {
      acc += film * opacity;
      weight += opacity;
    } else if (uBlend == 4) {
      inv *= 1.0 - mix(vec3(0.0), film, opacity);
    } else if (uBlend == 5) {
      vec3 shown = mix(vec3(1.0), film, opacity);
      acc = started > 0.5 ? min(acc, shown) : shown;
      started = 1.0;
    } else {
      vec3 shown = mix(vec3(0.0), film, opacity);
      acc = started > 0.5 ? max(acc, shown) : shown;
      started = 1.0;
    }
  }

  if (any < 0.5) return vec3(1.0);
  if (uBlend == 0) return transmission;
  if (uBlend == 1) return (field * 0.5 + 0.5) * tintAcc;
  if (uBlend == 3) return acc / max(weight, 1.0e-4);
  if (uBlend == 4) return 1.0 - inv;
  return acc;
}

vec3 filtered(vec2 p, float px) {
  if (abs(uChroma) < 1.0e-6) return combine(p, px);
  vec3 color;
  color.r = combine(p * (1.0 - uChroma), px * abs(1.0 - uChroma)).r;
  color.g = combine(p, px).g;
  color.b = combine(p * (1.0 + uChroma), px * abs(1.0 + uChroma)).b;
  return color;
}

vec3 mapAndShade(vec2 fragCoord) {
  float shortSide = min(uResolution.x, uResolution.y);
  vec2 raw = (fragCoord - 0.5 * uResolution) / shortSide;
  float ga = uGlobalRot + TAU * uGlobalRotCycles * uMotion * uTime;
  float pulse = 1.0 + uPulseAmp * sin(TAU * uPulseCycles * uMotion * uTime);
  float sc = max(uGlobalScale * pulse, 0.02);
  vec2 p = rot(raw, ga) / sc;
  float px = (1.0 / shortSide) / sc;
  if (uTile >= 1.5) {
    float n = min(floor(uTile + 0.5), 24.0);
    p = fract(p * n + 0.5) - 0.5;
    px *= n;
  }
  if (uKaleido >= 1.5) {
    float n = clamp(floor(uKaleido + 0.5), 2.0, 32.0);
    float a = atan(p.y, p.x);
    float r = length(p);
    float sector = TAU / n;
    a = mod(a, sector);
    a = abs(a - sector * 0.5);
    p = r * vec2(cos(a), sin(a));
  }

  vec3 color = filtered(p, px);
  color *= uExposure;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  vec2 uv = fragCoord / uResolution;
  float radius = length((uv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0));
  if (uVignette > 0.0) {
    float vig = smoothstep(0.85, 0.25, radius);
    color *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));
  }
  if (uIris > 0.0) color *= smoothstep(uIris, uIris - 0.015, radius);
  color = (color - 0.5) * uContrast + 0.5;
  color = clamp(color, 0.0, 1.0);
  color = pow(color, vec3(max(uGamma, 0.05)));
  if (uInvert > 0.5) color = 1.0 - color;
  if (uThreshold > 0.0) {
    float y = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float mask = smoothstep(uThreshold - 0.015, uThreshold + 0.015, y);
    color = vec3(mask);
  }
  return color;
}

void main() {
  int n = uSamples;
  if (n < 1) n = 1;
  if (n > 4) n = 4;
  vec3 acc = vec3(0.0);
  float fn = float(n);
  for (int j = 0; j < 4; j++) {
    if (j >= n) break;
    for (int i = 0; i < 4; i++) {
      if (i >= n) break;
      vec2 fragCoord = gl_FragCoord.xy + (vec2(float(i), float(j)) + 0.5) / fn - 0.5;
      acc += mapAndShade(fragCoord);
    }
  }
  oColor = vec4(clamp(acc / (fn * fn), 0.0, 1.0), 1.0);
}
`
}

export const vertexSource = `#version 300 es
void main() {
  vec2 pos = vec2(-1.0, -1.0);
  if (gl_VertexID == 1) pos = vec2(3.0, -1.0);
  if (gl_VertexID == 2) pos = vec2(-1.0, 3.0);
  gl_Position = vec4(pos, 0.0, 1.0);
}
`

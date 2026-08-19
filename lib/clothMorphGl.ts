/**
 * The WebGL half of the cloth morph (see lib/clothMorph.ts for the façade and
 * the reasoning about when this runs at all).
 *
 * This module is only ever reached through a dynamic import, so none of it —
 * shader source included — lands in the bundle that /work/[slug] and /about
 * have to parse. It is hand-written WebGL2 rather than OGL or three: the whole
 * scene is one quad, one texture and one orthographic projection expressed as
 * two lines of vertex maths, so a scene graph would be 10-150KB of code we'd
 * use none of.
 *
 * Colour management is by omission and that is deliberate. The texture is
 * uploaded as plain RGBA8 with no colour-space conversion and written straight
 * to the default (sRGB) framebuffer, so encoded values round-trip untouched
 * and the WebGL photo is byte-identical to the DOM photo it hands off to. Ask
 * for SRGB8_ALPHA8 here — or let the driver "helpfully" convert on upload —
 * and the hand-off gains a visible brightness step.
 */

/** Total flight time. Unhurried: the wave should read as weight, not speed. */
const DURATION_MS = 1200;

/**
 * How far the wave is allowed to carry the sheet past the photo's own rect,
 * in units of the rect's shorter side. The drawn quad is padded by this much
 * so a crest has somewhere to go; beyond it the wave would be clipped into a
 * straight line, which is the one thing this effect must never show. Keep
 * comfortably above WAVE_AMP in the shader.
 */
const PAD = 0.1;

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;

uniform vec4 uRect;      // photo rect: x, y, w, h — CSS px, viewport space
uniform vec2 uPad;       // quad padding, per axis, in units of the rect
uniform vec2 uViewport;  // CSS px

out vec2 vUv;

void main() {
  // vUv is the photo's own 0..1 space and deliberately overshoots it by uPad,
  // so the fragment shader can put geometry outside the rect.
  vUv = mix(-uPad, 1.0 + uPad, aPos);

  // The orthographic camera is just this: CSS pixels in, clip space out. No
  // matrix, and rect maths stays 1:1 with getBoundingClientRect().
  vec2 px = uRect.xy + vUv * uRect.zw;
  gl_Position = vec4(px / uViewport * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform vec2 uImageSize;   // natural pixel size of the texture
uniform vec2 uQuadSize;    // photo rect size, CSS px
uniform vec4 uCrop;        // ox, oy, sx, sy — the slice of uTexture on screen
uniform float uProgress;   // 0..1, linear in wall-clock time
uniform float uTime;       // seconds since the flight began
uniform float uSaturation;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

/** Wave cycles across the photo's width. Barely over one: a swell, not a ripple. */
const float WAVE_FREQ = 1.35;
/** Slight slant on the crests, so the wavefronts aren't perfectly upright. */
const float WAVE_TILT = 0.12;
/**
 * Cycles the wave sweeps from hoist to fly over the flight. Under one, so the
 * fabric is caught in a single pass rather than seen to flap.
 */
const float WAVE_TRAVEL = 0.8;
/** Peak displacement at the fly, in units of the photo's shorter side. */
const float WAVE_AMP = 0.04;
/**
 * How steeply the wave grows away from the hoist. This is the whole shape of
 * a flag: the fabric is held on one edge and free on the other, so amplitude
 * is zero at the pole and largest at the far side. An even wave across the
 * whole frame would read as a wobble; the falloff is what reads as flying.
 */
const float FLAG_FALLOFF = 0.75;
/** Horizontal give where the surface turns away, as a fraction of WAVE_AMP. */
const float FORESHORTEN = 0.32;

/**
 * Sampling frequency of the noise that bends the wavefronts, and how far it
 * is allowed to bend them, in cycles. Deliberately almost nothing: the noise
 * exists only so the wave is not a perfect, mechanical sine. Any more of it
 * and the effect stops being one clean ondulation and starts being texture.
 */
const float NOISE_SCALE = 0.7;
const float WAVE_BEND = 0.035;

/** Photo.tsx rounds every frame by this much; the silhouette has to agree. */
const float RADIUS_PX = 2.0;
/** Width of the light-through-fabric band along the edge, shorter-side units. */
const float RIM_WIDTH = 0.05;
const float RIM = 0.07;
/** How hard the turning surface shades the photo. */
const float SHADE = 0.1;
/** Per-channel UV split, as a fraction of the local displacement. */
const float CHROMA = 0.05;
const float GRAIN = 0.02;

// 2D simplex noise — Ashima Arts / Stefan Gustavson, MIT.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                         + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/** Two octaves. This field only nudges a phase; it is never seen directly. */
float fbm(vec2 p) {
  return 0.5 * snoise(p) + 0.25 * snoise(p * 2.03);
}

void main() {
  // Work in units of the rect's shorter side, so a given displacement is the
  // same number of pixels horizontally and vertically. In raw UV space a
  // landscape photo would wave twice as hard along one axis as the other.
  vec2 aspect = uQuadSize / min(uQuadSize.x, uQuadSize.y);
  vec2 pos = (vUv - 0.5) * aspect;

  // The whole effect hangs off this: zero at both ends of the flight, so the
  // photo is a clean rectangle the instant it leaves the DOM and the instant
  // it is handed back, and moving only in between.
  float amp = sin(PI * uProgress);

  // Amplitude grows away from the hoist (the left edge), which is what makes
  // this a flag rather than a wobble.
  float grow = pow(clamp(vUv.x, 0.0, 1.0), FLAG_FALLOFF);

  float phase = (vUv.x * WAVE_FREQ + vUv.y * WAVE_TILT
               + fbm(pos * NOISE_SCALE + vec2(0.0, uTime * 0.3)) * WAVE_BEND
               - uProgress * WAVE_TRAVEL) * TAU;

  // One wave plus a swell at half its frequency. Two terms is all it takes to
  // stop a sine reading as a sine, and it costs nothing next to more noise —
  // which is what would make this busy again.
  float wave  = sin(phase) * 0.72 + sin(phase * 0.5 + 0.9) * 0.38;
  float slope = cos(phase) * 0.72 + cos(phase * 0.5 + 0.9) * 0.19;

  // *The* displacement. Everything below reads the surface through this one
  // vector, which is why the frame and the pixels can never disagree.
  vec2 disp = vec2(-slope * FORESHORTEN, wave) * WAVE_AMP * grow * amp;

  // Material space: where on the undisturbed sheet the fabric now sitting at
  // this pixel came from. Sampling the photo *and* measuring the rect here —
  // rather than warping the photo and separately perturbing an outline — is
  // what makes the border a consequence of the wave instead of a second
  // effect that has to be tuned to match it.
  vec2 posMat = pos - disp;
  vec2 uvMat = posMat / aspect + 0.5;

  // Cover-fit the visible slice into the rect. Photo.tsx gives every frame the
  // photo's own aspect ratio, so this is an identity today; it is here so that
  // the day a frame stops matching its photo, the morph crops instead of
  // stretching — a stretched photograph is worse than a cropped one.
  vec2 cropPx = uImageSize * uCrop.zw;
  float k = max(uQuadSize.x / cropPx.x, uQuadSize.y / cropPx.y);
  vec2 cover = (uQuadSize / k) / cropPx;
  vec2 base = uCrop.xy + ((uvMat - 0.5) * cover + 0.5) * uCrop.zw;
  vec2 ca = (disp / aspect) * CHROMA * uCrop.zw;

  // Splitting the channels along the displacement reads as light bending
  // through a moving surface. It survives the desaturation below as edge
  // ghosting, which is the part that actually sells the refraction.
  vec3 col = vec3(
    texture(uTexture, base + ca).r,
    texture(uTexture, base).g,
    texture(uTexture, base - ca).b
  );

  // The homepage tile is mid-way between grey and colour when it is clicked
  // (CategoryTile hands us its live filter value), and the destination has no
  // filter at all. Finishing that ramp here rather than letting CSS do it on
  // hand-off is what stops the photo popping into colour at the seam.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);

  // Light follows the surface normal, and for a sheet displaced vertically the
  // normal follows the *slope*, not the height — so the bright band sits on
  // the rising face, a quarter cycle off the crest. Shading it on the crest
  // instead is the usual tell that a wave is faked.
  col *= 1.0 + slope * SHADE * grow * amp;

  // Signed distance to the photo's rect, measured in material space, positive
  // inside. The straight edges of the sheet are still straight *in the
  // fabric*; it is the fabric that is bent, so the silhouette comes out as
  // the same wave, for free, and snaps back to four straight edges wherever
  // amp is zero.
  float r = RADIUS_PX / min(uQuadSize.x, uQuadSize.y);
  vec2 e = abs(posMat) - 0.5 * aspect + r;
  float d = -(length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - r);

  // One antialiased pixel, and no more: a flag has a clean edge, and what is
  // handed back to the DOM has to be a hard edge and not a blurred border.
  float alpha = smoothstep(0.0, fwidth(d), d);

  // Sheer: a fabric edge held up to the light is brighter than its body.
  col += pow(clamp(1.0 - d / RIM_WIDTH, 0.0, 1.0), 3.0) * amp * RIM;

  // The archive is grainy film; a clean digital surface mid-flight would read
  // as a different image. Only while distorted, so the hand-off stays exact.
  float g = fract(sin(dot(gl_FragCoord.xy + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * GRAIN * amp;

  // Premultiplied — see the blend func in createGl().
  outColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}
`;

type Rect = { x: number; y: number; w: number; h: number };
type Crop = { ox: number; oy: number; sx: number; sy: number };

interface Gl {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  u: Record<string, WebGLUniformLocation | null>;
  texture: WebGLTexture | null;
  textureWidth: number;
  imageSize: [number, number];
}

let ctx: Gl | null = null;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader alloc failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
  }
  return shader;
}

/**
 * Builds the context, program and quad once and keeps them. Throws on any
 * WebGL2 shortfall so the caller can fall back to the native morph — a
 * portfolio must not lose its navigation because a driver said no.
 */
function createGl(): Gl {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  // Between the nav (z-50) and the cursor (z-100): the travelling photo passes
  // under the site chrome, exactly as the native morph does.
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:60;pointer-events:none";

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    // Our own alpha ramp anti-aliases the silhouette; MSAA would only touch
    // the quad's own (invisible) corners.
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("no webgl2");

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
  }
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const names = [
    "uRect", "uPad", "uViewport", "uTexture", "uImageSize",
    "uQuadSize", "uCrop", "uProgress", "uTime", "uSaturation",
  ];
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) u[name] = gl.getUniformLocation(program, name);
  gl.uniform1i(u.uTexture, 0);

  return { canvas, gl, u, texture: null, textureWidth: 0, imageSize: [1, 1] };
}

/** Compiles ahead of the click so the first frame costs a draw call, not a link. */
export function warm(): boolean {
  if (ctx) return true;
  try {
    ctx = createGl();
    return true;
  } catch {
    return false;
  }
}

/**
 * Uploads an already-decoded <img>. UNPACK_COLORSPACE_CONVERSION_WEBGL is
 * switched off so the browser hands over the file's own bytes: any conversion
 * here would show up as a brightness step when the DOM photo takes over.
 */
function setTexture(c: Gl, img: HTMLImageElement) {
  const { gl } = c;
  if (!c.texture) {
    c.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, c.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Mipmaps are not optional here. These are 1920-2560px film scans drawn
    // into a ~1100px quad, so every fragment is minifying; with plain LINEAR
    // the grain and the crowds alias into mush the moment the UVs start
    // moving, and the "cloth" reads as a broken JPEG. The distorted regions
    // also compress the UVs unevenly, which is exactly what per-fragment LOD
    // and anisotropy exist to handle.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (aniso) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
      );
    }
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, c.texture);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  c.textureWidth = img.naturalWidth;
  c.imageSize = [img.naturalWidth, img.naturalHeight];
}

function draw(
  c: Gl,
  rect: Rect,
  crop: Crop,
  progress: number,
  time: number,
  saturation: number
) {
  const { gl, u } = c;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bw = Math.round(vw * dpr);
  const bh = Math.round(vh * dpr);
  if (c.canvas.width !== bw || c.canvas.height !== bh) {
    c.canvas.width = bw;
    c.canvas.height = bh;
  }
  gl.viewport(0, 0, bw, bh);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const minSide = Math.max(1, Math.min(rect.w, rect.h));
  gl.uniform4f(u.uRect, rect.x, rect.y, rect.w, rect.h);
  gl.uniform2f(u.uPad, (PAD * minSide) / rect.w, (PAD * minSide) / rect.h);
  gl.uniform2f(u.uViewport, vw, vh);
  gl.uniform2f(u.uQuadSize, rect.w, rect.h);
  gl.uniform2f(u.uImageSize, c.imageSize[0], c.imageSize[1]);
  gl.uniform4f(u.uCrop, crop.ox, crop.oy, crop.sx, crop.sy);
  gl.uniform1f(u.uProgress, progress);
  gl.uniform1f(u.uTime, time);
  gl.uniform1f(u.uSaturation, saturation);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export const engine = {
  warm,
  get canvas() {
    return ctx?.canvas ?? null;
  },
  setTexture(img: HTMLImageElement) {
    if (ctx) setTexture(ctx, img);
  },
  /** True once a bigger derivative than the one we started from is in hand. */
  wouldUpgrade(img: HTMLImageElement) {
    return Boolean(ctx) && img.naturalWidth > (ctx as Gl).textureWidth;
  },
  draw(rect: Rect, crop: Crop, progress: number, time: number, saturation: number) {
    if (ctx) draw(ctx, rect, crop, progress, time, saturation);
  },
  /**
   * Frees the photo — the only allocation here big enough to care about — and
   * shrinks the backing store to a pixel. The context and the linked program
   * stay, because recompiling them is the one thing that could make a second
   * navigation stutter where the first did not.
   */
  release() {
    if (!ctx) return;
    ctx.canvas.remove();
    if (ctx.texture) {
      ctx.gl.deleteTexture(ctx.texture);
      ctx.texture = null;
      ctx.textureWidth = 0;
    }
    ctx.canvas.width = 1;
    ctx.canvas.height = 1;
  },
};

export { DURATION_MS };
export type { Rect, Crop };

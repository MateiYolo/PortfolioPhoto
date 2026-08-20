/**
 * The scroll veil: the same sheet of fabric as the cloth morph
 * (lib/clothMorphGl.ts), but hung on the scroll instead of on a navigation.
 *
 * Inside a category the photographs are drawn by WebGL rather than by the
 * browser for as long as they are on screen, and how hard the visitor is
 * scrolling decides how much the fabric moves. Drift down the page and this
 * is a photograph; throw the page and it is a photograph printed on silk.
 * At rest the shader is an identity — no displacement, no rim, no grain —
 * so a still page is the still image, exactly.
 *
 * Differences from the morph's engine, all of them because this one runs for
 * minutes rather than for 1.2 seconds:
 *
 *  - several quads per frame, one per photo on screen, each with its own
 *    texture, all sharing one canvas and one program;
 *  - amplitude comes in from JS every frame rather than from a progress
 *    ramp, because the thing driving it is the visitor's hand;
 *  - the caller is expected to skip whole frames when nothing has changed.
 *    A category page at rest must cost nothing at all.
 *
 * Colour management is by omission, for the same reason as the morph: plain
 * RGBA8 in, default (sRGB) framebuffer out, so the WebGL photo and the DOM
 * photo it stands in for are the same bytes. Anything else shows up as a
 * brightness step at the hand-off.
 */

import { SIMPLEX_2D } from "@/lib/glslNoise";

/**
 * How far the wave may carry the sheet past the photo's own rect, in units
 * of the rect's shorter side. The quad is padded by this much so a crest has
 * somewhere to go. Keep comfortably above WAVE_AMP in the shader.
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

  // The orthographic camera is just this: CSS pixels in, clip space out, so
  // the rect maths stays 1:1 with getBoundingClientRect().
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
uniform float uAmp;        // 0 (still) .. 1 (flat out), already eased in JS
uniform float uDrift;      // the same, signed by scroll direction
uniform float uFlow;       // wave travel, in cycles, accumulated by the caller
uniform float uPhase;      // constant per photo, so no two are in step

const float TAU = 6.28318530718;

/**
 * Wave cycles down the photo's height. Barely over one: at this size the
 * fabric should read as one long swell passing through, not as ripples.
 */
const float WAVE_FREQ = 1.15;
/** Slight slant on the crests, so the wavefronts aren't perfectly level. */
const float WAVE_TILT = 0.16;
/** Peak displacement at full scroll speed, in units of the shorter side. */
const float WAVE_AMP = 0.05;
/**
 * How the fabric is held. Scrolling drags a photo past the window along its
 * long axis, so the edges that lead and trail are the top and the bottom:
 * those are free to move, and the middle — where the picture is being read —
 * is held. An even wave over the whole frame would read as a wobble.
 */
const float EDGE_HOLD = 0.42;
const float FALLOFF = 1.25;
/** Sideways sway, and give where the surface turns away, both vs WAVE_AMP. */
const float SWAY = 1.0;
const float FORESHORTEN = 0.45;
/** How far the free edges lag behind the direction of travel, vs WAVE_AMP. */
const float DRAG = 0.5;

/**
 * Sampling frequency of the noise that bends the wavefronts, and how far it
 * may bend them, in cycles. Deliberately almost nothing: the noise exists
 * only so the wave is not a perfect, mechanical sine. Any more and the
 * effect stops being one clean ondulation and starts being texture.
 */
const float NOISE_SCALE = 0.7;
const float WAVE_BEND = 0.045;

/** Photo.tsx rounds every frame by this much; the silhouette has to agree. */
const float RADIUS_PX = 2.0;
/** Width of the light-through-fabric band along the edge, shorter-side units. */
const float RIM_WIDTH = 0.05;
const float RIM = 0.06;
/** How hard the turning surface shades the photo. */
const float SHADE = 0.11;
/** Per-channel UV split, as a fraction of the local displacement. */
const float CHROMA = 0.06;
const float GRAIN = 0.018;

/**
 * Mip bias while the fabric is still. This is what makes a veiled photo and
 * a browser-painted one the same photograph.
 *
 * A 2560px scan in an 1100px frame is minifying, so trilinear filtering
 * blends in a mip level the browser's own downscaler never uses, and the
 * result is a shade softer than the <img> beside it — which at rest is a
 * difference nobody would call fabric, only blur. Biasing hard toward level
 * 0 while uAmp is nothing matches the browser; the bias is given up over the
 * first sliver of movement, where the mips earn their keep holding the film
 * grain together as the wave compresses the UVs, and where the picture is
 * moving too much for anyone to catch the change.
 */
const float REST_LOD_BIAS = -1.0;
const float LOD_FADE = 0.25;

${SIMPLEX_2D}

void main() {
  // Work in units of the rect's shorter side, so a given displacement is the
  // same number of pixels horizontally and vertically. In raw UV space a
  // landscape photo would wave twice as hard along one axis as the other.
  vec2 aspect = uQuadSize / min(uQuadSize.x, uQuadSize.y);
  vec2 pos = (vUv - 0.5) * aspect;

  // Everything below is multiplied by uAmp, which is what makes a page at
  // rest byte-for-byte the photograph and not an effect turned down low.
  float grow = mix(EDGE_HOLD, 1.0,
                   pow(clamp(abs(vUv.y - 0.5) * 2.0, 0.0, 1.0), FALLOFF));

  // uFlow is distance scrolled, not time: the wave crawls when the visitor
  // crawls, races when they throw the page, and holds still when they stop.
  float phase = (vUv.y * WAVE_FREQ + vUv.x * WAVE_TILT
               + fbm(pos * NOISE_SCALE + vec2(0.0, uFlow * 0.25)) * WAVE_BEND
               + uFlow) * TAU + uPhase;

  // One wave plus a swell at half its frequency. Two terms is all it takes to
  // stop a sine reading as a sine, and it costs nothing next to more noise —
  // which is what would make this busy again.
  float wave  = sin(phase) * 0.72 + sin(phase * 0.5 + 0.9) * 0.38;
  float slope = cos(phase) * 0.72 + cos(phase * 0.5 + 0.9) * 0.19;

  // *The* displacement. Everything below reads the surface through this one
  // vector, which is why the frame and the pixels can never disagree. The
  // sway is across the scroll, the foreshortening along it — a sheet turning
  // away from the reader is shorter, not narrower — and the drag is the free
  // edges falling behind the hand that is pulling them.
  vec2 disp = vec2(wave * SWAY, -slope * FORESHORTEN) * uAmp;
  disp.y -= uDrift * DRAG;
  disp *= WAVE_AMP * grow;

  // Material space: where on the undisturbed sheet the fabric now sitting at
  // this pixel came from. Sampling the photo *and* measuring the rect here —
  // rather than warping the photo and separately perturbing an outline — is
  // what makes the border a consequence of the wave instead of a second
  // effect that has to be tuned to match it.
  vec2 posMat = pos - disp;
  vec2 uvMat = posMat / aspect + 0.5;

  // Cover-fit, exactly as the CSS does it. Photo.tsx gives every frame the
  // photo's own aspect ratio, so this is an identity today; it is here so
  // that the day a frame stops matching its photo, the veil crops instead of
  // stretching — a stretched photograph is worse than a cropped one.
  float k = max(uQuadSize.x / uImageSize.x, uQuadSize.y / uImageSize.y);
  vec2 cover = (uQuadSize / k) / uImageSize;
  vec2 base = (uvMat - 0.5) * cover + 0.5;
  vec2 ca = (disp / aspect) * CHROMA;

  // Splitting the channels along the displacement reads as light bending
  // through a moving surface. At these amplitudes it is never seen as
  // colour, only as the faint edge ghosting that sells the refraction.
  float lod = mix(REST_LOD_BIAS, 0.0, smoothstep(0.0, LOD_FADE, uAmp));
  vec3 col = vec3(
    texture(uTexture, base + ca, lod).r,
    texture(uTexture, base, lod).g,
    texture(uTexture, base - ca, lod).b
  );

  // Light follows the surface normal, and for a sheet displaced along its
  // wave the normal follows the *slope*, not the height — so the bright band
  // sits on the rising face, a quarter cycle off the crest. Shading the crest
  // instead is the usual tell that a wave is faked.
  col *= 1.0 + slope * SHADE * grow * uAmp;

  // Signed distance to the photo's rect, measured in material space, positive
  // inside. The straight edges of the sheet are still straight *in the
  // fabric*; it is the fabric that is bent, so the silhouette comes out as
  // the same wave, for free, and snaps back to four straight edges wherever
  // uAmp is zero.
  float r = RADIUS_PX / min(uQuadSize.x, uQuadSize.y);
  vec2 e = abs(posMat) - 0.5 * aspect + r;
  float d = -(length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - r);

  // One antialiased pixel, and no more: what stands in for a DOM photo has
  // to have that photo's hard edge, not a blurred border.
  float alpha = smoothstep(0.0, fwidth(d), d);

  // Sheer: a fabric edge held up to the light is brighter than its body.
  col += pow(clamp(1.0 - d / RIM_WIDTH, 0.0, 1.0), 3.0) * uAmp * RIM;

  // The archive is grainy film; a clean digital surface mid-wave would read
  // as a different image. Only while distorted, so a still page is exact.
  float g = fract(sin(dot(gl_FragCoord.xy + uFlow * 120.0,
                         vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * GRAIN * uAmp;

  // Premultiplied — see the blend func in createVeil().
  outColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}
`;

export interface VeilRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An uploaded photo. Opaque to the caller beyond its natural size. */
export interface VeilTexture {
  readonly handle: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

export interface VeilQuad {
  rect: VeilRect;
  texture: VeilTexture;
  /** 0 (still) .. 1 (flat out). */
  amp: number;
  /** The same, signed by scroll direction. */
  drift: number;
  /** Wave travel in cycles; shared by every quad in a frame. */
  flow: number;
  /** Constant per photo. */
  phase: number;
}

export interface VeilEngine {
  /** False once the GL context has gone away under us. */
  readonly alive: boolean;
  /** Takes the canvas off the page, leaving nothing painted. Drawing a
   *  frame with something in it hangs it back up. */
  detach(): void;
  upload(img: HTMLImageElement): VeilTexture | null;
  free(texture: VeilTexture): void;
  /** Clears, then draws these quads back to front. Empty clears the canvas. */
  frame(quads: VeilQuad[]): void;
  destroy(): void;
}

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
 * Builds the context, program and quad, or returns null on any WebGL2
 * shortfall — which is the caller's cue to leave the photographs to the
 * browser and put the scroll-linked tilt back. A portfolio must not lose
 * its photographs because a driver said no.
 */
export function createVeil(): VeilEngine | null {
  let canvas: HTMLCanvasElement;
  let gl: WebGL2RenderingContext;
  let u: Record<string, WebGLUniformLocation | null>;

  try {
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    // Under the nav (z-50) and the lightbox (z-80), over the page: the veiled
    // photographs pass beneath the site chrome exactly as the DOM ones do.
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:40;pointer-events:none";

    const context = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      // Our own alpha ramp anti-aliases the silhouette; MSAA would only touch
      // the quad's own (invisible) corners.
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      // This canvas spends most of its life either idle or drawing an
      // undistorted photograph, and it is nobody's reason to spin up a
      // discrete GPU.
      powerPreference: "low-power",
    });
    if (!context) return null;
    gl = context;

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

    u = {};
    for (const name of [
      "uRect", "uPad", "uViewport", "uTexture", "uImageSize",
      "uQuadSize", "uAmp", "uDrift", "uFlow", "uPhase",
    ]) {
      u[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(u.uTexture, 0);
  } catch {
    return null;
  }

  let lost = false;
  // A driver reset would otherwise leave the veil drawing into nothing with
  // the photographs it stands in for still hidden. `alive` going false is the
  // caller's cue to hand every one of them straight back to the DOM.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    canvas.remove();
  });

  /** Cleared to nothing already, so a redundant clear can be skipped. */
  let blank = true;

  /**
   * Sizes the drawing buffer and returns the CSS box it now covers.
   *
   * That box is read off the canvas itself rather than from
   * window.innerWidth, and the difference is the width of a scrollbar. A
   * fixed, inset:0 element is laid out in the viewport *without* the classic
   * scrollbar, and getBoundingClientRect() gives its rects in that same
   * space, while innerWidth counts the scrollbar in. Project through
   * innerWidth and every quad is stretched by that ratio — about 1%, which
   * on a 1400px photo is a dozen pixels of daylight between the fabric and
   * the layout it is standing in for.
   */
  const resize = (): [number, number] => {
    const vw = canvas.clientWidth || window.innerWidth;
    const vh = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(vw * dpr);
    const h = Math.round(vh * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return [vw, vh];
  };

  return {
    get alive() {
      return !lost;
    },

    detach() {
      canvas.remove();
    },

    /**
     * Uploads an already-decoded <img>. UNPACK_COLORSPACE_CONVERSION_WEBGL is
     * switched off so the browser hands over the file's own bytes: any
     * conversion here would show as a brightness step against the DOM photo
     * next to it.
     */
    upload(img) {
      if (lost) return null;
      const handle = gl.createTexture();
      if (!handle) return null;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Mipmaps are not optional here. These are 1920-2560px film scans drawn
      // into a ~1100px quad, so every fragment is minifying; with plain LINEAR
      // the grain aliases into mush the moment the UVs start moving, and the
      // "fabric" reads as a broken JPEG. The distorted regions also compress
      // the UVs unevenly, which is exactly what per-fragment LOD and
      // anisotropy exist to handle.
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
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
      } catch {
        // A cross-origin photo would taint the context rather than merely
        // fail; leave it to the browser to draw.
        gl.deleteTexture(handle);
        return null;
      }
      return { handle, width: img.naturalWidth, height: img.naturalHeight };
    },

    free(texture) {
      if (!lost) gl.deleteTexture(texture.handle);
    },

    frame(quads) {
      if (lost) return;
      if (!quads.length) {
        if (blank) return;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        blank = true;
        return;
      }

      // Hung over the page only once there is a photograph to put there: a
      // category of wigglegrams veils nothing, and has no business carrying
      // a full-window canvas around for it.
      if (!canvas.isConnected) document.body.appendChild(canvas);
      const [vw, vh] = resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      blank = false;

      gl.uniform2f(u.uViewport, vw, vh);

      for (const q of quads) {
        const minSide = Math.max(1, Math.min(q.rect.w, q.rect.h));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, q.texture.handle);
        gl.uniform4f(u.uRect, q.rect.x, q.rect.y, q.rect.w, q.rect.h);
        gl.uniform2f(u.uPad, (PAD * minSide) / q.rect.w, (PAD * minSide) / q.rect.h);
        gl.uniform2f(u.uQuadSize, q.rect.w, q.rect.h);
        gl.uniform2f(u.uImageSize, q.texture.width, q.texture.height);
        gl.uniform1f(u.uAmp, q.amp);
        gl.uniform1f(u.uDrift, q.drift);
        gl.uniform1f(u.uFlow, q.flow);
        gl.uniform1f(u.uPhase, q.phase);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    },

    destroy() {
      canvas.remove();
      if (!lost) gl.getExtension("WEBGL_lose_context")?.loseContext();
      lost = true;
    },
  };
}

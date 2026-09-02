/**
 * The scroll swell: a photograph bulging gently toward the reader as the page
 * moves under it, and lying flat again the moment it stops.
 *
 * This is the WebGL half. lib/usePhotoWave.ts is the gate that decides whether
 * any of it runs, and components/Photo.tsx is the only thing that mounts it.
 *
 * The architecture is the whole point, so it is worth stating plainly: every
 * canvas here lives *inside* the photo's own frame, in normal flow. It is not
 * one fixed, full-viewport canvas that chases DOM rects. That distinction is
 * what makes the effect survive a phone. A fixed overlay has to re-place
 * itself in JavaScript on every frame while the compositor scrolls the page on
 * another thread, and on iOS momentum scrolling the two are never in phase —
 * the photo and its distortion visibly separate. A canvas in flow is scrolled
 * by the compositor exactly like the <img> it stands in for, so there is
 * nothing to synchronise: the frame loop only ever computes the deformation,
 * which is expressed in the canvas's own box and is therefore independent of
 * where that box currently sits.
 *
 * The deformation itself is a fragment-shader displacement, not a displaced
 * mesh. A radial bulge in Z under a perspective camera *is* a radial
 * magnification, so sampling the texture closer to the swell's centre gives
 * the same picture as bending a subdivided plane — per pixel rather than
 * per vertex, from a single quad, with no geometry to subdivide and no vertex
 * count to trade against fidelity. It is also the cheaper half of the GPU.
 *
 * The swell moves the photo's *outline*, not just the picture inside it, and
 * that is the whole reason it reads at all: a five per cent magnification in
 * the middle of a detailed photograph is invisible, while the same five per
 * cent on a straight edge against white is not. So the quad is drawn larger
 * than the frame (WAVE_PAD below) and the silhouette is measured in material
 * space — where on the undisturbed sheet the pixel now here came from — which
 * is the same trick lib/clothMorphGl.ts uses and for the same reason: the
 * border comes out as a consequence of the displacement rather than a second
 * effect that has to be kept in agreement with it.
 *
 * Colour management is by omission, for the same reason as lib/clothMorphGl.ts
 * and it matters more here: the texture is uploaded as plain RGBA8 with no
 * colour-space conversion and drawn to the default (sRGB) framebuffer, so at
 * rest the canvas is the same picture as the <img> underneath it. Ask the
 * driver to convert on upload and every hand-over gains a brightness step.
 */

/**
 * How many live WebGL contexts this is allowed to hold.
 *
 * Browsers cap contexts per page somewhere around 8-16 and start evicting the
 * oldest without warning past that, so a canvas per photo on an open-ended
 * grid is not an option. It does not need to be: both grids on this site are
 * one photo per row, sized so a frame fits in a screenful, which puts at most
 * three photos inside the activation margin at any time. Four leaves a slot
 * spare for the hand-over at the top and bottom of the screen; a fifth photo
 * asking simply doesn't get one and keeps its <img>, which is a photograph
 * that doesn't swell rather than a photograph that isn't there.
 */
const POOL_SIZE = 4;

/**
 * Retina is worth paying for; the third pixel on a modern phone is not. Same
 * cap as the cloth morph, for the same reason.
 */
const MAX_DPR = 2;

/**
 * Below this much scroll speed the sheet is flat. The velocity spring
 * (components/ScrollVelocity.tsx) settles asymptotically, so without a
 * threshold the loop would run forever on a still page, drawing a
 * displacement no one can see.
 */
const REST = 0.004;

/**
 * Shapes how scroll speed becomes amplitude, and it is the single number
 * that decides whether this effect is felt at all.
 *
 * The spring hands over a fraction of FULL_TILT_SPEED, which is 2600px/s —
 * a hard fling. Ordinary reading scrolls sit around 0.2-0.5 of that, so a
 * linear mapping spends almost the whole range on speeds nobody scrolls at
 * and gives the common case a fifth of the effect. Below 1 this is an
 * ease-out: 0.3 becomes 0.49, 0.5 becomes 0.66, while 1 stays 1. The peak
 * is unchanged and the everyday case roughly doubles, which is the part
 * that reads.
 */
const RESPONSE = 0.6;

/**
 * How fast the hover swell ramps in and out, per frame. About a third of a
 * second to arrive, which is near the 600ms scale it replaces but a little
 * quicker: a deformation that lags the pointer reads as lag, where a scale
 * reads as weight.
 */
const HOVER_LERP = 0.12;

/**
 * Where on the screen the swell sits, as a fraction of viewport height. Every
 * photo reads its centre off the same screen line, so a grid scrolling past
 * looks like one sheet being moved rather than a column of independently
 * wobbling rectangles.
 */
const FOCUS = 0.5;

/**
 * How far the drawn quad extends past the photo's frame, per axis, as a
 * fraction of that axis. A crest has to have somewhere to go: beyond this the
 * swell would be clipped into a straight line, which is the one thing the
 * effect must never show. Keep it comfortably above the peak displacement
 * (MAX_SWELL in the shader, applied to half the frame) — the excess costs
 * fragments that resolve to alpha 0, which is far cheaper than a flat edge.
 *
 * Expressed against the frame's shorter side, and rounded to whole CSS pixels
 * when it is applied, which matters more than it looks: the canvas has to sit
 * a whole number of pixels from the <img> it stands in for, or its pixel grid
 * lands half a pixel off the one the browser composites onto and the whole
 * photograph is resampled that little bit softer than the DOM photo beside
 * it. draw() owns both the CSS offset and the matching uPad for that reason —
 * they can never drift apart if one place computes both.
 */
const WAVE_PAD = 0.08;

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;

uniform vec2 uPad;  // quad overhang per axis, in units of the frame

out vec2 vUv;

void main() {
  // The quad covers the frame *and* its padding, so vUv deliberately
  // overshoots 0..1 and the fragment shader can put the photo's edge outside
  // the frame's own box. v runs top-down to match the texture's row order
  // (UNPACK_FLIP_Y is off below), which is also how uCenter is measured.
  vec2 t = vec2(aPos.x, 1.0 - aPos.y);
  vUv = mix(-uPad, 1.0 + uPad, t);
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform vec2 uSize;     // frame size, CSS px
uniform float uCenter;  // where the scroll swell sits, in vUv.y units
uniform float uAmp;     // scroll speed, -1 (up) .. 0 .. 1 (down), shaped
uniform float uHover;   // 0 .. 1, how far the pointer swell has ramped in
uniform vec2 uHoverAt;  // pointer position, in vUv

const float HALF_PI = 1.57079632679;

/**
 * Peak magnification the scroll can reach. This is the one number that
 * decides how strong the effect reads; everything else below only shapes it.
 * Its real cost is measured at the *edge*: a point on the border sits about
 * half a frame from the centre, so it travels out by roughly this fraction of
 * half the frame. On this site that has to clear the gap to a tile's caption,
 * which is the ceiling this number is set against — see CategoryTile.
 */
const float MAX_SWELL = 0.075;

/**
 * How far the scroll swell reaches, in units of the frame's shorter side.
 * Comfortably past the corners of a portrait frame (about 0.9 away) on
 * purpose: the dome has to still be climbing when it arrives at the border,
 * because a dome that has already died out there leaves the outline straight
 * and the whole effect goes back to being invisible.
 */
const float REACH = 1.6;

/**
 * Peak magnification under the pointer, and how far around it it carries.
 *
 * Larger than MAX_SWELL, and it has to be, for a reason that is easy to get
 * wrong: a magnification displaces a point by its *distance from the centre*
 * times the dome, so the surface does not move at all directly under the
 * pointer and most at a ring around it. That ring peaks near half the reach,
 * where r * dome(r) is worth about 0.38 of the reach — so the furthest the
 * sheet ever travels here is roughly HOVER_SWELL * HOVER_REACH * 0.38 of the
 * frame's shorter side, about 18px on a tile of this size. That figure, not
 * this constant, is what has to clear the caption below.
 */
const float HOVER_SWELL = 0.11;
/**
 * Tighter than the scroll's reach, and that is the point: the scroll moves
 * the whole sheet, where the pointer presses on one part of it. A hover dome
 * as wide as the scroll one would just be the scale this replaced.
 */
const float HOVER_REACH = 0.8;

/**
 * Shapes both domes. The falloff is a linear ramp bent through a sine, so the
 * surface is flat at the crest and flat again where it dies out — a swell
 * with no seam at either end. The exponent pulls a little volume back toward
 * the centre; at 1.0 the dome reads slightly slack.
 */
const float BUMP_POWER = 1.2;

/** components/Photo.tsx rounds every frame by this much; the edge must agree. */
const float RADIUS_PX = 2.0;

/** How hard a curving surface shades. Light comes from above. */
const float SHADE = 0.11;

/** Per-channel sample split at the flanks, in shorter-side units. */
const float CHROMA = 0.006;

/**
 * A dome of unit height at the centre, dying to nothing at that reach, plus the
 * slope of its surface — which is what the light has to follow, and is zero
 * at the crest where the surface faces the viewer squarely.
 */
float dome(float r, float reach, out float slope) {
  float fall = clamp(1.0 - r / reach, 0.0, 1.0);
  slope = cos(fall * HALF_PI) * smoothstep(0.0, 0.06, fall);
  return pow(sin(fall * HALF_PI), BUMP_POWER);
}

void main() {
  // Work in units of the frame's shorter side so a given displacement is the
  // same number of pixels on both axes. In raw uv a landscape photo would
  // swell into an ellipse.
  vec2 aspect = uSize / min(uSize.x, uSize.y);
  vec2 pos = (vUv - 0.5) * aspect;

  // Two domes over one sheet, about different centres, so the surface is
  // expressed as a displacement field and summed rather than as one mapping.
  // The scroll's centre rides a fixed line on the screen; the pointer's is
  // wherever the pointer is.
  vec2 d1 = pos - vec2(0.0, (uCenter - 0.5) * aspect.y);
  vec2 d2 = pos - (uHoverAt - 0.5) * aspect;
  float r1 = length(d1);
  float r2 = length(d2);

  float slope1, slope2;
  float dome1 = dome(r1, REACH, slope1) * uAmp;
  float dome2 = dome(r2, HOVER_REACH, slope2) * uHover;

  vec2 disp = d1 * (dome1 * MAX_SWELL) + d2 * (dome2 * HOVER_SWELL);

  // Material space: where on the undisturbed sheet the fabric now sitting at
  // this pixel came from. Sampling the photo *and* measuring its rect here —
  // rather than warping the picture and separately perturbing an outline — is
  // what makes the border a consequence of the swell instead of a second
  // effect that has to be tuned to match it. With both domes at rest this is
  // exactly vUv, which is what makes the resting canvas the same image as the
  // <img> it stands in for.
  vec2 posMat = pos - disp;
  vec2 uv = posMat / aspect + 0.5;

  // Splitting the channels along the displacement reads as light bending
  // through a moving surface. Zero wherever the sheet is flat, so a resting
  // photo is sampled once per channel from the same place.
  vec2 split = disp * CHROMA / aspect;

  vec3 col = vec3(
    texture(uTexture, uv + split).r,
    texture(uTexture, uv).g,
    texture(uTexture, uv - split).b
  );

  // Light follows the surface normal, and the normal follows the slope, not
  // the height — so the bright band sits on a dome's flank, not on its crest.
  // Shading the crest instead is the usual tell that a bulge is painted on.
  vec2 dir1 = r1 > 1e-5 ? d1 / r1 : vec2(0.0);
  vec2 dir2 = r2 > 1e-5 ? d2 / r2 : vec2(0.0);
  float lit = slope1 * dir1.y * dome1 + slope2 * dir2.y * dome2;
  col *= 1.0 - lit * SHADE;

  // Signed distance to the photo's rect, measured in material space, positive
  // inside. The sheet's four edges are still straight *in the fabric*; it is
  // the fabric that is being stretched, so the silhouette comes out as the
  // same swell for free, and snaps back to a clean rectangle the moment both
  // domes go flat. Standard rounded-box distance.
  float rad = RADIUS_PX / min(uSize.x, uSize.y);
  vec2 e = abs(posMat) - 0.5 * aspect + rad;
  float sd = -(length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - rad);

  // One antialiased pixel and no more: what sits next to a photograph on this
  // site is bare paper, and a soft border would read as a glow.
  float alpha = smoothstep(0.0, fwidth(sd), sd);

  // Premultiplied — see the blend func in createSlot().
  outColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}
`;

interface Slot {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  u: Record<string, WebGLUniformLocation | null>;
  texture: WebGLTexture | null;
  lost: boolean;
  /** Set while a photo holds this slot; its cue to hand back to the DOM. */
  onLost: (() => void) | null;
}

interface Entry {
  frame: HTMLElement;
  slot: Slot;
  velocity: () => number;
  /** What was last painted, so a frame is only drawn when it would differ. */
  drawn: { amp: number; hover: number; x: number; y: number; top: number };
  /** Overhang currently applied to the canvas, in whole CSS px. */
  pad: number;
  /** Whether the pointer is on this photo, and how far the dome has ramped. */
  hovered: boolean;
  hover: number;
  /** Last pointer position, in client px; kept on leave so the dome recedes
   *  where it was rather than snapping to the middle on its way out. */
  px: number;
  py: number;
  stopHover: (() => void) | null;
}

export interface WaveHandle {
  /** Caller mounts this inside the photo's frame and removes it on detach. */
  canvas: HTMLCanvasElement;
  /** Re-upload after the browser swaps in a larger srcset candidate. */
  refresh(img: HTMLImageElement): void;
  detach(): void;
}

const entries = new Set<Entry>();
const free: Slot[] = [];
let made = 0;
let frameId = 0;
/** Amplitude held by the debug hatch below, or null when the scroll drives. */
let pinned: number | null = null;

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
 * One context, program and quad, set up once and never re-bound. Each slot
 * draws a single quad with a single program, so all of the GL state below is
 * left standing for the life of the context and the frame loop only ever
 * writes uniforms.
 */
function createSlot(): Slot {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  // No visibility of its own: the cloth morph hides the whole frame during a
  // flight (lib/clothMorphFlight.ts), and a canvas that declared itself
  // visible would keep painting a photo that is supposed to have taken off.
  // inset is set by draw(), which is the one place that knows the overhang.
  canvas.style.cssText = "position:absolute;inset:0;display:block;pointer-events:none";

  const gl = canvas.getContext("webgl2", {
    // The quad is bigger than the photo now, so most of what it covers has to
    // resolve to nothing at all: the silhouette is carried in alpha.
    alpha: true,
    premultipliedAlpha: true,
    // The shader's own alpha ramp antialiases the silhouette; MSAA would only
    // touch the quad's own corners, which are never visible.
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    // An ambient effect has no business waking a discrete GPU, and on a phone
    // this is the difference the battery notices.
    powerPreference: "low-power",
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

  gl.bindVertexArray(gl.createVertexArray());
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const u: Record<string, WebGLUniformLocation | null> = {};
  const names = ["uTexture", "uSize", "uCenter", "uAmp", "uPad", "uHover", "uHoverAt"];
  for (const name of names) {
    u[name] = gl.getUniformLocation(program, name);
  }
  gl.uniform1i(u.uTexture, 0);

  const slot: Slot = { canvas, gl, u, texture: null, lost: false, onLost: null };
  // A lost context leaves a slot drawing into nothing while the <img> it
  // stands in for is still hidden, which is a hole in the page. Telling the
  // photo immediately is what puts its <img> back.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    slot.lost = true;
    slot.onLost?.();
  });
  return slot;
}

function take(): Slot | null {
  const spare = free.pop();
  if (spare) return spare;
  if (made >= POOL_SIZE) return null;
  try {
    const slot = createSlot();
    made += 1;
    return slot;
  } catch {
    // A driver that refused one context will refuse the next. Stop asking, so
    // a page of photos costs one failed attempt rather than one per photo.
    made = POOL_SIZE;
    return null;
  }
}

/**
 * Uploads an already-decoded <img>. Mipmaps are not optional: these are
 * 1600-2560px film scans drawn into a frame half that size, so every fragment
 * is minifying, and plain LINEAR turns the grain into crawling noise the
 * moment the sampling positions start moving.
 */
function upload(slot: Slot, img: HTMLImageElement): boolean {
  if (!img.complete || img.naturalWidth === 0) return false;
  const { gl } = slot;
  if (!slot.texture) {
    slot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
  gl.bindTexture(gl.TEXTURE_2D, slot.texture);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  return true;
}

function draw(entry: Entry, rect: DOMRect, amp: number) {
  entry.drawn = {
    amp,
    hover: entry.hover,
    x: entry.px,
    y: entry.py,
    top: rect.top,
  };
  const { slot } = entry;
  const { gl, u, canvas } = slot;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  // A whole number of CSS pixels of overhang on every side, so the canvas's
  // pixel grid stays in step with the <img>'s. Written only when it actually
  // changes — a resize — rather than every frame.
  const pad = Math.round(WAVE_PAD * Math.min(rect.width, rect.height));
  if (pad !== entry.pad) {
    entry.pad = pad;
    canvas.style.inset = `${-pad}px`;
  }

  const w = Math.max(1, Math.round((rect.width + 2 * pad) * dpr));
  const h = Math.max(1, Math.round((rect.height + 2 * pad) * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  // Everything outside the silhouette has to be cleared, not left over from
  // the frame before: the photo moves within this box.
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(u.uPad, pad / rect.width, pad / rect.height);
  gl.uniform2f(u.uSize, rect.width, rect.height);
  gl.uniform1f(u.uCenter, (window.innerHeight * FOCUS - rect.top) / rect.height);
  gl.uniform1f(u.uAmp, amp);
  gl.uniform1f(u.uHover, entry.hover);
  gl.uniform2f(
    u.uHoverAt,
    (entry.px - rect.left) / rect.width,
    (entry.py - rect.top) / rect.height
  );
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/**
 * The one frame loop for every swelling photo on the page.
 *
 * Reads are batched ahead of writes on purpose: getBoundingClientRect on four
 * frames costs one layout if nothing writes in between, and four if something
 * does. Nothing here writes layout at all — the canvas has a fixed CSS size,
 * so resizing its backing store is not a layout change — but the shape is
 * what keeps that true the next time someone adds a line.
 *
 * The loop stops itself once every photo has drawn its settling frame, so a
 * page at rest costs nothing. wake() below is what starts it again.
 */
function tick() {
  frameId = 0;
  let moving = false;
  const pending: Array<{ entry: Entry; rect: DOMRect; amp: number }> = [];

  // Captured once so the narrowing holds across the loop below.
  const held = pinned;

  for (const entry of entries) {
    if (entry.slot.lost) continue;
    const rect = entry.frame.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    let amp: number;
    if (held !== null) {
      amp = held;
      moving = true;
    } else {
      const raw = entry.velocity();
      amp =
        Math.abs(raw) < REST
          ? 0
          : Math.sign(raw) * Math.pow(Math.abs(raw), RESPONSE);
      if (amp !== 0) moving = true;
    }

    // The pointer dome runs on its own clock and keeps the loop awake for
    // exactly as long as it is still arriving or leaving.
    const target = entry.hovered ? 1 : 0;
    if (entry.hover !== target) {
      entry.hover += (target - entry.hover) * HOVER_LERP;
      if (Math.abs(target - entry.hover) < 0.002) entry.hover = target;
      moving = true;
    }

    // Draw only what would come out different. A photo already painted flat
    // needs no frame; one that isn't needs exactly one. The rect's top counts
    // only while the pointer dome is up, because that dome is placed off the
    // frame's live position where the scroll dome it sits beside contributes
    // nothing at rest anyway.
    const was = entry.drawn;
    if (
      amp !== was.amp ||
      entry.hover !== was.hover ||
      entry.px !== was.x ||
      entry.py !== was.y ||
      (entry.hover > 0 && rect.top !== was.top)
    ) {
      pending.push({ entry, rect, amp });
    }
  }

  for (const { entry, rect, amp } of pending) draw(entry, rect, amp);

  if (moving) frameId = requestAnimationFrame(tick);
}

/** Starts the frame loop if it isn't already running. */
export function wakeWaves() {
  if (!frameId && entries.size > 0) frameId = requestAnimationFrame(tick);
}

/**
 * Debug hatch, in the spirit of __clothMorphSpeed: hold every photo's swell
 * at a chosen amplitude so it can be looked at standing still — for a
 * screenshot, or for tuning the shader constants above against a real
 * photograph rather than against a moving page.
 *
 *   __photoWave(0.9)   crest, as far as a fast scroll down ever takes it
 *   __photoWave(-0.9)  the same going up, where the sheet draws in
 *   __photoWave()      hand it back to the scroll
 *
 * It has to wake the loop itself, and keep it awake: the whole design is
 * that a still page stops rendering, so merely setting a value would be
 * read by nothing.
 */
if (typeof window !== "undefined") {
  (window as { __photoWave?: (amp?: number) => void }).__photoWave = (amp) => {
    pinned = typeof amp === "number" ? amp : null;
    wakeWaves();
  };
}

/** Whether the browser can run this at all, asked before anything is built. */
export function waveSupported(): boolean {
  return typeof window !== "undefined" && "WebGL2RenderingContext" in window;
}

/**
 * Claims a context for one photo and paints it flat straight away, so the
 * caller has a canvas showing the right picture *before* it hides the <img>.
 * Returns null when the pool is spent or the photo isn't decoded yet, which
 * is the caller's cue to leave the DOM photo exactly as it is.
 */
export function attachWave({
  frame,
  img,
  velocity,
  hover = false,
  onLost,
}: {
  frame: HTMLElement;
  img: HTMLImageElement;
  velocity: () => number;
  /**
   * Let the pointer press a dome into this photo while it is over it. Only
   * where hovering is a thing the device does — on touch, pointerenter
   * arrives with the tap and would leave a dome standing under a finger that
   * has gone.
   */
  hover?: boolean;
  /** Called if the context dies under this photo, on the browser's thread. */
  onLost: () => void;
}): WaveHandle | null {
  if (!waveSupported()) return null;
  const slot = take();
  if (!slot) return null;
  if (slot.lost || !upload(slot, img)) {
    free.push(slot);
    return null;
  }

  const rect = frame.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    free.push(slot);
    return null;
  }
  const entry: Entry = {
    frame,
    slot,
    velocity,
    drawn: { amp: 0, hover: 0, x: 0, y: 0, top: 0 },
    pad: -1,
    hovered: false,
    hover: 0,
    px: rect.left + rect.width / 2,
    py: rect.top + rect.height / 2,
    stopHover: null,
  };
  draw(entry, rect, 0);

  if (hover) {
    const move = (event: PointerEvent) => {
      entry.px = event.clientX;
      entry.py = event.clientY;
      wakeWaves();
    };
    const enter = (event: PointerEvent) => {
      entry.hovered = true;
      move(event);
    };
    const leave = () => {
      entry.hovered = false;
      wakeWaves();
    };
    frame.addEventListener("pointerenter", enter);
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerleave", leave);
    entry.stopHover = () => {
      frame.removeEventListener("pointerenter", enter);
      frame.removeEventListener("pointermove", move);
      frame.removeEventListener("pointerleave", leave);
    };
  }
  slot.onLost = onLost;
  entries.add(entry);
  wakeWaves();

  return {
    canvas: slot.canvas,
    refresh(next: HTMLImageElement) {
      if (slot.lost) return;
      if (upload(slot, next)) {
        // Force the next tick to repaint from the new texture.
        entry.drawn.amp = NaN;
        wakeWaves();
      }
    },
    detach() {
      entries.delete(entry);
      entry.stopHover?.();
      slot.onLost = null;
      slot.canvas.remove();
      // The texture is the only allocation big enough to care about; the
      // context and its linked program stay, because recompiling them is the
      // one thing that could make the next photo stutter where this one
      // didn't. A context that died takes its slot out of circulation.
      if (slot.texture) {
        slot.gl.deleteTexture(slot.texture);
        slot.texture = null;
      }
      if (!slot.lost) {
        slot.canvas.width = 1;
        slot.canvas.height = 1;
        slot.canvas.style.inset = "0";
        free.push(slot);
      }
    },
  };
}


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
 * Where on the screen the swell sits, as a fraction of viewport height. Every
 * photo reads its centre off the same screen line, so a grid scrolling past
 * looks like one sheet being moved rather than a column of independently
 * wobbling rectangles.
 */
const FOCUS = 0.5;

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;

out vec2 vUv;

void main() {
  // v runs top-down so it matches the texture's own row order (UNPACK_FLIP_Y
  // is off below), which is also the direction uCenter is measured in.
  vUv = vec2(aPos.x, 1.0 - aPos.y);
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform vec2 uSize;    // frame size, CSS px
uniform float uCenter; // where the swell sits, in vUv.y units
uniform float uAmp;    // scroll speed, -1 (up) .. 0 .. 1 (down)

const float HALF_PI = 1.57079632679;

/**
 * Peak magnification at the crest. This is the only number that decides how
 * strong the effect reads; everything else below shapes it. Small on purpose:
 * a photograph that visibly zooms is a photograph being interfered with.
 */
const float MAX_SWELL = 0.055;

/**
 * How far the swell reaches from its centre, in units of the frame's shorter
 * side. Generous, so a whole frame breathes as one surface instead of growing
 * a localised blister.
 */
const float REACH = 0.95;

/**
 * Shapes the dome. The falloff is a linear ramp bent through a sine, so the
 * surface is flat at the crest and flat again where it dies out — a swell
 * with no seam at either end. The exponent pulls a little volume back toward
 * the centre; at 1.0 the dome reads slightly slack.
 */
const float BUMP_POWER = 1.2;

/**
 * How far in from the frame's border the swell is faded out, in uv. This is
 * what keeps the silhouette a clean rectangle: the photo may bulge, but its
 * four edges never move, so it stays aligned with the rest of the grid and
 * nothing is ever sampled from outside the texture.
 */
const float EDGE_FADE = 0.12;

/** How hard the curving surface shades. Light comes from above. */
const float SHADE = 0.085;

/** Per-channel sample split at the flanks, in shorter-side units. */
const float CHROMA = 0.004;

void main() {
  // Work in units of the frame's shorter side so a given displacement is the
  // same number of pixels on both axes. In raw uv a landscape photo would
  // swell into an ellipse.
  vec2 aspect = uSize / min(uSize.x, uSize.y);
  vec2 pos = (vUv - 0.5) * aspect;
  vec2 centre = vec2(0.0, (uCenter - 0.5) * aspect.y);

  vec2 d = pos - centre;
  float r = length(d);

  float fall = clamp(1.0 - r / REACH, 0.0, 1.0);
  float dome = pow(sin(fall * HALF_PI), BUMP_POWER);

  // Zero at the border, on both axes.
  vec2 guard = smoothstep(vec2(0.0), vec2(EDGE_FADE), min(vUv, 1.0 - vUv));
  float edge = guard.x * guard.y;
  dome *= edge;

  float swell = dome * uAmp;

  // The displacement. Sampling nearer the centre is what a surface leaning
  // toward the viewer does to the picture on it. At uAmp 0 this is exactly
  // vUv, which is what makes the resting canvas the same image as the <img>.
  vec2 uv = (centre + d * (1.0 - swell * MAX_SWELL)) / aspect + 0.5;

  vec2 dir = r > 1e-5 ? d / r : vec2(0.0);
  vec2 split = dir * swell * CHROMA / aspect;

  vec3 col = vec3(
    texture(uTexture, uv + split).r,
    texture(uTexture, uv).g,
    texture(uTexture, uv - split).b
  );

  // Light follows the surface normal, and the normal follows the *slope*, not
  // the height — so the bright band sits on the dome's flank, not on its
  // crest. cos() of the same falloff is that slope: zero at the top of the
  // dome, largest where it turns away. Shading the crest instead is the usual
  // tell that a bulge is painted on.
  float slope = cos(fall * HALF_PI) * smoothstep(0.0, 0.06, fall) * edge;
  col *= 1.0 - slope * dir.y * swell * SHADE;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
  /** Last amplitude drawn, so the settling frame is drawn exactly once. */
  drawn: number;
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
  canvas.style.cssText =
    "position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none";

  const gl = canvas.getContext("webgl2", {
    // The photo is opaque and covers the frame, so there is nothing to blend
    // against and no alpha to carry.
    alpha: false,
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

  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const name of ["uTexture", "uSize", "uCenter", "uAmp"]) {
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
  const { slot } = entry;
  const { gl, u, canvas } = slot;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  gl.uniform2f(u.uSize, rect.width, rect.height);
  gl.uniform1f(u.uCenter, (window.innerHeight * FOCUS - rect.top) / rect.height);
  gl.uniform1f(u.uAmp, amp);
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

  // Debug hatch, in the shape of __clothMorphSpeed: pin the amplitude to see
  // the swell held still at a chosen strength, for a screenshot or for
  // tuning the constants above against a real photograph. -1..1.
  const forced = (window as { __photoWaveAmp?: number }).__photoWaveAmp;
  const pinned = typeof forced === "number";

  for (const entry of entries) {
    if (entry.slot.lost) continue;
    const rect = entry.frame.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const raw = pinned ? forced : entry.velocity();
    const amp = !pinned && Math.abs(raw) < REST ? 0 : raw;
    if (amp !== 0 || pinned) moving = true;
    // A flat photo that is already drawn flat needs no frame; a flat photo
    // that isn't needs exactly one.
    if (amp !== 0 || entry.drawn !== 0) pending.push({ entry, rect, amp });
  }

  for (const { entry, rect, amp } of pending) {
    draw(entry, rect, amp);
    entry.drawn = amp;
  }

  if (moving) frameId = requestAnimationFrame(tick);
}

/** Starts the frame loop if it isn't already running. */
export function wakeWaves() {
  if (!frameId && entries.size > 0) frameId = requestAnimationFrame(tick);
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
  onLost,
}: {
  frame: HTMLElement;
  img: HTMLImageElement;
  velocity: () => number;
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

  const entry: Entry = { frame, slot, velocity, drawn: 0 };
  const rect = frame.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    free.push(slot);
    return null;
  }
  draw(entry, rect, 0);
  slot.onLost = onLost;
  entries.add(entry);
  wakeWaves();

  return {
    canvas: slot.canvas,
    refresh(next: HTMLImageElement) {
      if (slot.lost) return;
      if (upload(slot, next)) {
        entry.drawn = 1; // force the next tick to repaint from the new texture
        wakeWaves();
      }
    },
    detach() {
      entries.delete(entry);
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
        free.push(slot);
      }
    },
  };
}


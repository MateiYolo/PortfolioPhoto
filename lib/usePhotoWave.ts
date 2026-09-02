"use client";

import { useInView } from "motion/react";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useScrollVelocityFactor } from "@/components/ScrollVelocity";
import { attachWave, wakeWaves, waveSupported } from "@/lib/photoWaveGl";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * How far outside the viewport a photo claims and gives up its context.
 *
 * The same margin ScrollTilt uses, for a sharper reason: taking a slot means
 * swapping the DOM photo for a canvas, and however close the two are, the
 * swap is the one moment they could ever be told apart. At 300px it always
 * happens off screen.
 */
const ACTIVE_MARGIN = "300px";

/**
 * Gates the scroll swell (lib/photoWaveGl.ts) for one photo and reports
 * whether it is actually running.
 *
 * Everything here is arranged so the <img> is the truth and the canvas is a
 * layer that may or may not arrive. A photo that is off screen, not yet
 * decoded, on a browser without WebGL2, on a device whose owner asked for
 * less motion, or simply too far down a page that has already spent its four
 * contexts, gets no canvas and no swell — and is a photograph either way.
 * That is also why the caller is handed a boolean rather than a canvas: it
 * has to keep rendering its <img> regardless, and only hide it once this
 * says the replacement is up and painted.
 */
export function usePhotoWave({
  frameRef,
  imgRef,
  mountRef,
  enabled,
  hover,
  ready,
}: {
  /** Photo's aspect box — the rect the swell is measured against. */
  frameRef: RefObject<HTMLDivElement | null>;
  /** The decoded photo, used directly as the texture. */
  imgRef: RefObject<HTMLImageElement | null>;
  /**
   * An empty element inside the frame that React owns but never fills, so the
   * canvas can be appended to a parent whose children React will not reorder
   * underneath it.
   */
  mountRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  /**
   * Let the pointer press its own dome into the photo while it is over it.
   * The caller decides, because only it knows whether hovering is reachable
   * on this device and whether this photo is one that should answer it.
   */
  hover: boolean;
  /** Whether the <img> has decoded. Nothing can be uploaded before it has. */
  ready: boolean;
}): boolean {
  const velocity = useScrollVelocityFactor();
  const reducedMotion = useReducedMotion();
  const active = useInView(frameRef, { margin: ACTIVE_MARGIN });
  const [waving, setWaving] = useState(false);

  const run = enabled && ready && active && !reducedMotion;

  useEffect(() => {
    if (!run || !waveSupported()) return;
    const frame = frameRef.current;
    const img = imgRef.current;
    const mount = mountRef.current;
    if (!frame || !img || !mount) return;

    const handle = attachWave({
      frame,
      img,
      velocity: () => velocity.get(),
      hover,
      onLost: () => setWaving(false),
    });
    if (!handle) return;

    mount.appendChild(handle.canvas);
    setWaving(true);

    // The browser can swap in a larger srcset candidate after the first
    // decode — a window widened, or a connection that improved — and the
    // texture would otherwise stay at whatever resolution it was uploaded at.
    const reupload = () => handle.refresh(img);
    img.addEventListener("load", reupload);

    // The frame loop sleeps whenever the page is still, so something has to
    // wake it. The spring is that something, and it is one shared value, so
    // this costs one subscription per photo and no extra work per frame.
    const stopWaking = velocity.on("change", wakeWaves);

    return () => {
      stopWaking();
      img.removeEventListener("load", reupload);
      handle.detach();
      setWaving(false);
    };
  }, [run, hover, frameRef, imgRef, mountRef, velocity]);

  return waving;
}

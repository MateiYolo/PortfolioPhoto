"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion, type MotionValue } from "motion/react";
import { preload } from "react-dom";
import { buildSrcSet, largestSrc } from "@/lib/imageSizes";
import type { Photo as PhotoType } from "@/lib/content";

/**
 * How far outside the viewport a photo starts fetching and decoding. This
 * is the number that makes the site feel smooth, so it's worth stating why:
 *
 * A full-width AVIF from this archive costs 28-125ms to decode on a mid
 * range machine (film grain makes these expensive to both store and
 * decode). With plain `loading="lazy"` the browser only begins that work as
 * the photo nears the viewport edge, so the download, the decode, the first
 * raster and the reveal animation all land on the same handful of frames —
 * which is exactly the stutter you feel as a photo arrives.
 *
 * Warming a couple of screens early moves all of it into idle time, so by
 * the time a photo is on screen the only work left is a composite.
 *
 * The exception is a metered connection: there, fetching photos the visitor
 * may never scroll to is spending someone else's money, and Save-Data is an
 * explicit request not to. Those users fall back to native lazy timing.
 */
function warmMargin(): string {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  if (connection?.saveData) return "0px";
  switch (connection?.effectiveType) {
    case "slow-2g":
    case "2g":
      return "50% 0px";
    case "3g":
      return "120% 0px";
    default:
      return "250% 0px";
  }
}

/** Length of the blur-up crossfade, shared by the transition and the timer. */
const FADE_MS = 600;

/**
 * The one place an <img> gets rendered. Builds a srcset from the ingest-time
 * derivatives, decodes off the main thread well before the photo is on
 * screen, blurs up from the inlined LQIP if the network loses that race, and
 * reserves layout space via aspect-ratio so nothing shifts while it loads —
 * portrait and landscape both just work.
 */
export function Photo({
  photo,
  sizes = "100vw",
  priority = false,
  className,
  style,
  grayscale,
  imgY,
  imgScale,
  instant,
}: {
  photo: PhotoType;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  /**
   * Leave undefined to render with no filter at all. `filter` forces an
   * extra raster pass over the whole frame, so only the homepage tiles —
   * which actually animate between grey and colour — should pay for it.
   */
  grayscale?: boolean;
  /**
   * Scroll-linked vertical drift for the image *within* its own frame
   * (percent of the frame's height, e.g. "-9%"), independent of any
   * motion applied to the frame itself. Leave undefined for a static
   * image — only the homepage grid passes this.
   */
  imgY?: MotionValue<string>;
  /**
   * Zoom applied together with `imgY` so the drift never uncovers the
   * frame's edges. Callers that pass `imgY` must pass a scale large enough
   * to cover its range; ignored otherwise.
   */
  imgScale?: number;
  /**
   * Skip this component's own decode-then-fade reveal and paint the <img>
   * at full opacity from the first render. Only for a photo that is itself
   * the landing side of a `<ViewTransition share="morph">`: the browser's
   * native ::view-transition-image-pair crossfade already dissolves the
   * thumbnail into this photo, so running the normal blur-up sequence on
   * top of it plays the same blur-to-sharp motion a second time, right as
   * the first one finishes.
   */
  instant?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // `warm` flips the <img> from lazy to eager once the photo comes within
  // warmMargin(); `ready` flips only once the pixels are actually decoded.
  const [warm, setWarm] = useState(priority);
  const [ready, setReady] = useState(false);
  // Separate from `ready` because the LQIP has to outlive the *start* of
  // the crossfade: drop it the moment the photo begins fading in and the
  // photo spends 600ms dissolving out of the page background instead of
  // out of its own placeholder, which reads as a wash.
  const [settled, setSettled] = useState(false);

  const srcSet = buildSrcSet(photo);
  const fallbackSrc = largestSrc(photo);

  // An above-the-fold photo shouldn't wait for React to hydrate before the
  // browser learns about it. Emitted into <head> during SSR, so the fetch
  // starts alongside the HTML rather than after it.
  if (priority && fallbackSrc) {
    preload(fallbackSrc, {
      as: "image",
      imageSrcSet: srcSet,
      imageSizes: sizes,
      fetchPriority: "high",
    });
  }

  useEffect(() => {
    if (warm) return;
    const el = frameRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setWarm(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setWarm(true);
          observer.disconnect();
        }
      },
      { rootMargin: warmMargin() }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [warm]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    let cancelled = false;

    const reveal = () => {
      if (!cancelled) setReady(true);
    };

    // decode() resolves only once the frame is ready to paint, and does the
    // work off the main thread. Revealing on `load` instead would just move
    // the decode to whichever frame first paints the image.
    const decodeThenReveal = () => {
      if (typeof img.decode !== "function") {
        reveal();
        return;
      }
      img.decode().then(reveal, reveal);
    };

    // A cached image can finish loading before this effect ever runs, in
    // which case no `load` event is coming and a listener alone would leave
    // the photo stuck at opacity 0.
    if (img.complete && img.naturalWidth > 0) {
      decodeThenReveal();
      return () => {
        cancelled = true;
      };
    }

    img.addEventListener("load", decodeThenReveal);
    img.addEventListener("error", reveal);
    return () => {
      cancelled = true;
      img.removeEventListener("load", decodeThenReveal);
      img.removeEventListener("error", reveal);
    };
  }, [fallbackSrc, warm]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setSettled(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const eager = priority || warm;

  return (
    <div
      ref={frameRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        aspectRatio: `${photo.width} / ${photo.height}`,
        // Dropped once the crossfade is over, not when it starts: an LQIP
        // left painted underneath forever is a second layer the compositor
        // blends on every frame for the life of the page.
        backgroundImage: settled ? undefined : `url(${photo.lqip})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        // Grayscale belongs on the frame, not on the <img>. The LQIP is
        // painted as this element's own background, so filtering only the
        // image leaves a full-colour placeholder showing underneath it
        // until the photo has finished fading in — which on a cold load
        // is a visible second of colour on a monochrome grid.
        filter:
          grayscale === undefined
            ? undefined
            : grayscale
              ? "grayscale(1)"
              : "grayscale(0)",
        transition:
          grayscale === undefined
            ? undefined
            : `filter ${FADE_MS}ms cubic-bezier(0.65,0,0.35,1)`,
        ...style,
      }}
    >
      <motion.img
        ref={imgRef}
        src={fallbackSrc}
        srcSet={srcSet}
        sizes={sizes}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading={eager ? "eager" : "lazy"}
        // Never block presentation on this image's decode — with the
        // warm-up above the decode is already done, and if it somehow
        // isn't, a late photo is far better than a frozen page.
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: instant || ready ? 1 : 0,
          transition: instant
            ? undefined
            : `opacity ${FADE_MS}ms cubic-bezier(0.65,0,0.35,1)`,
          ...(imgY ? { y: imgY, scale: imgScale } : undefined),
        }}
      />
    </div>
  );
}

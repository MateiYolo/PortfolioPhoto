"use client";

import { motion, useInView, type MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { VideoClip } from "@/lib/content";
import { pickVideoSrc } from "@/lib/imageSizes";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** Crossfade from the poster frame to the moving clip, and back. */
const FADE_MS = 420;

/**
 * How far outside the viewport a clip is allowed to run. Narrower than the
 * photos' warm margin (see components/Photo.tsx) on purpose: a decoded
 * video that nobody can see is a decode loop running forever, where a
 * warmed photo is a decode that happens once.
 */
const PLAY_MARGIN = "150px";

/**
 * The moving half of a wigglegram: a few frames on a loop, laid over the
 * still that scripts/ingest.ts cut from its first frame.
 *
 * Everything here is arranged so the still is the truth and the clip is an
 * embellishment that may or may not arrive. It is rendered *inside* the
 * Photo frame, at the same size, starting at the same frame, so:
 *
 *  - nothing is fetched until something asks the clip to play, and nothing
 *    plays off screen;
 *  - a refused autoplay, a codec nobody has, a visitor who asked for less
 *    motion: in each case the fade never runs and the still stays, which
 *    is the whole fallback;
 *  - the layout is the poster's, so a clip that never loads costs no shift.
 *
 * There are no controls, by design. The clip is muted, loops forever, and
 * carries no information the poster doesn't, so a control bar would only
 * be furniture on top of a photograph.
 */
export function LoopVideo({
  clip,
  active,
  imgY,
  imgScale,
}: {
  clip: VideoClip;
  /**
   * The caller's own gate — a tile passes its hover state, a category page
   * passes true. Being on screen is checked here regardless.
   */
  active: boolean;
  /**
   * The drift and zoom the still is under, when it is under any (the
   * homepage grid parallaxes its photo inside the frame). The clip has to
   * match it or the crossfade lands on a differently framed picture.
   */
  imgY?: MotionValue<string>;
  imgScale?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const onScreen = useInView(ref, { margin: PLAY_MARGIN });
  const reducedMotion = useReducedMotion();

  const [src, setSrc] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const play = active && onScreen && !reducedMotion;

  // The fetch waits for the first request to play, so a homepage of tiles
  // nobody hovers costs nothing, and a category page loads its clips as
  // they come up rather than eleven at once.
  useEffect(() => {
    if (!play || src) return;
    const el = ref.current;
    if (!el) return;

    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    // Save-Data asks for the cheapest thing that still works. Passing 0
    // picks the smallest rung rather than skipping the clip: on this
    // category the movement *is* the photograph.
    const target = connection?.saveData
      ? 0
      : el.getBoundingClientRect().width * (window.devicePixelRatio || 1);

    setSrc(pickVideoSrc(clip, target));
  }, [play, src, clip]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;

    if (play) {
      // Muted autoplay is allowed everywhere, but "allowed" is not
      // "guaranteed" (low power mode refuses it), and a rejected promise
      // here is an unhandled rejection in the console for a case that is
      // already handled: the poster is still on screen.
      void el.play().catch(() => {});
      return;
    }

    el.pause();
    setRolling(false);
    // Rewind to the frame the poster underneath is showing, so the fade
    // back to the still has nothing left to give away.
    el.currentTime = 0;
  }, [play, src]);

  return (
    <motion.video
      ref={ref}
      src={src ?? undefined}
      // Muted is what makes autoplay legal; the sources have no audio track
      // at all, so this only ever states the obvious to the browser.
      muted
      loop
      playsInline
      preload={src ? "auto" : "none"}
      disablePictureInPicture
      // The poster frame is the <img> underneath, in the same frame, at the
      // same size. Giving the video one too would only paint it twice.
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setRolling(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        // The click target is the link or button this sits inside, and the
        // custom cursor reads the element under the pointer.
        pointerEvents: "none",
        // Only once frames are actually moving: fading in on `canplay`
        // would cross into a video that is still a single held frame.
        opacity: play && rolling ? 1 : 0,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.65,0,0.35,1)`,
        ...(imgY ? { y: imgY, scale: imgScale } : undefined),
      }}
    />
  );
}

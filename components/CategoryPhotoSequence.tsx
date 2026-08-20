"use client";

import { useEffect, useState, ViewTransition } from "react";
import { Lightbox } from "@/components/Lightbox";
import { LoopVideo } from "@/components/LoopVideo";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import { watchClothMorphHome } from "@/lib/clothMorph";
import type { Photo as PhotoType } from "@/lib/content";
import {
  SEQUENCE_LEAD_TILE,
  SEQUENCE_TILE,
  tileSizes,
  tileWidth,
} from "@/lib/imageSizes";
import { useReducedMotion } from "@/lib/useReducedMotion";

const ALIGN_PATTERN: Array<"flex-start" | "flex-end" | "center"> = [
  "center",
  "flex-start",
  "flex-end",
];

/**
 * The photo set for one category: a vertical sequence of full-resolution
 * shots, sized by their own orientation and alternately aligned so mixed
 * portrait/landscape sets don't read as a rigid uniform grid. Clicking any
 * photo opens it in the Lightbox.
 *
 * A photo here can be a wigglegram, in which case it loops on its own for
 * as long as it is on screen, with no controls: see components/LoopVideo.
 *
 * Every photo keeps its own aspect ratio, so a frame is only ever sized by
 * width, and that width is capped by what the ratio allows in a screenful
 * of height — which is how a tall portrait stays readable on a short
 * laptop without a single pixel being cropped off it. Both the frame width
 * and the `sizes` attribute come out of lib/imageSizes, off the same
 * numbers, so what the browser is told to fetch matches what it paints.
 *
 * The first photo is the one the homepage thumbnail morphs into (that is
 * what `morphName` wires up) and is never lazy-loaded. Its entry pose is
 * already spent at the top of the page, so it only ever leans with scroll
 * speed, and the morph is captured against an untransformed element.
 * Everything after it settles out of a tilt as it is scrolled into place;
 * see ScrollTilt for why that replaced the old mask-wipe reveal.
 */
export function CategoryPhotoSequence({
  photos,
  morphName,
}: {
  photos: PhotoType[];
  morphName?: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  // The lead photo flies back to its tile when the visitor goes home. This has
  // to be armed for the whole visit rather than hung off one link, because the
  // browser's back button is a navigation nobody clicks.
  useEffect(() => {
    if (!morphName || reducedMotion) return;
    return watchClothMorphHome(morphName);
  }, [morphName, reducedMotion]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {photos.map((photo, i) => {
        const lead = i === 0;
        const tile = (lead ? SEQUENCE_LEAD_TILE : SEQUENCE_TILE)[photo.orientation];
        const button = (
          <button
            type="button"
            onClick={() => setLightboxIndex(i)}
            data-cursor="view"
            className="block w-full cursor-pointer text-left"
            aria-label={`Open ${photo.alt} in full screen`}
          >
            <Photo
              photo={photo}
              sizes={tileSizes(tile, photo)}
              priority={lead}
              instant={lead && Boolean(morphName)}
              style={{ borderRadius: 2 }}
            >
              {/* Inside a category there is nothing to reveal, so a clip
                  runs from the moment it is on screen and keeps running. */}
              {photo.video && <LoopVideo clip={photo.video} active />}
            </Photo>
          </button>
        );

        return (
          <div
            key={photo.id}
            className="category-row"
            style={
              {
                "--tile-align": lead ? "center" : ALIGN_PATTERN[i % ALIGN_PATTERN.length],
                marginBottom: lead ? "clamp(3rem, 9vw, 7rem)" : "var(--gutter)",
                paddingLeft: "var(--gutter)",
                paddingRight: "var(--gutter)",
              } as React.CSSProperties
            }
          >
            <div
              className="category-tile-frame"
              style={{ "--tile-width": tileWidth(tile, photo) } as React.CSSProperties}
            >
              <ScrollTilt>
                {lead && morphName ? (
                  <ViewTransition name={morphName} share="morph" default="none">
                    {/* Both directions of the WebGL morph find this photo
                        through the attribute — as the rect to land on coming
                        in, and as the one to take off from going home. */}
                    <div data-cloth-target={morphName}>{button}</div>
                  </ViewTransition>
                ) : (
                  button
                )}
              </ScrollTilt>
            </div>
          </div>
        );
      })}

      <Lightbox
        photos={photos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}

"use client";

import { useState, ViewTransition } from "react";
import { Lightbox } from "@/components/Lightbox";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import type { Photo as PhotoType } from "@/lib/content";

const WIDTHS: Record<PhotoType["orientation"], string> = {
  landscape: "clamp(20rem, 74vw, 58rem)",
  portrait: "clamp(15rem, 40vw, 28rem)",
  square: "clamp(17rem, 52vw, 36rem)",
};

/** The opening photo carries the page, so it gets more room than the rest. */
const LEAD_WIDTHS: Record<PhotoType["orientation"], string> = {
  landscape: "clamp(20rem, 92vw, 72rem)",
  portrait: "clamp(15rem, 52vw, 34rem)",
  square: "clamp(17rem, 66vw, 46rem)",
};

const ALIGN_PATTERN: Array<"flex-start" | "flex-end" | "center"> = [
  "center",
  "flex-start",
  "flex-end",
];

/**
 * Every photo keeps its own aspect ratio, so the frame is only ever sized
 * by width. That width is then capped by what the photo's ratio allows in
 * a screenful of height, which is how a tall portrait stays readable on a
 * short laptop without a single pixel being cropped off it.
 */
function frameWidth(photo: PhotoType, lead: boolean) {
  const ratio = photo.width / photo.height;
  const base = (lead ? LEAD_WIDTHS : WIDTHS)[photo.orientation];
  const heightCap = lead ? "78svh" : "88svh";
  return `min(${base}, calc(${heightCap} * ${ratio.toFixed(4)}))`;
}

/**
 * The photo set for one category: a vertical sequence of full-resolution
 * shots, sized by their own orientation and alternately aligned so mixed
 * portrait/landscape sets don't read as a rigid uniform grid. Clicking any
 * photo opens it in the Lightbox.
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

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {photos.map((photo, i) => {
        const lead = i === 0;
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
              sizes="(max-width: 767px) 100vw, 75vw"
              priority={lead}
              style={{ borderRadius: 2 }}
            />
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
              style={{ "--tile-width": frameWidth(photo, lead) } as React.CSSProperties}
            >
              <ScrollTilt direction={i % 2 === 0 ? 1 : -1}>
                {lead && morphName ? (
                  <ViewTransition name={morphName} share="morph" default="none">
                    <div>{button}</div>
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

"use client";

import { useState } from "react";
import { Lightbox } from "@/components/Lightbox";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";
import type { Photo as PhotoType } from "@/lib/content";

const WIDTHS: Record<PhotoType["orientation"], string> = {
  landscape: "clamp(20rem, 74vw, 58rem)",
  portrait: "clamp(15rem, 40vw, 28rem)",
  square: "clamp(17rem, 52vw, 36rem)",
};

const ALIGN_PATTERN: Array<"flex-start" | "flex-end" | "center"> = [
  "center",
  "flex-start",
  "flex-end",
];

/**
 * The photo set for one category: a vertical sequence of full-resolution
 * shots, each mask-revealed on scroll, sized by its own orientation and
 * alternately aligned so mixed portrait/landscape sets don't read as a
 * rigid uniform grid. Clicking any photo opens it in the Lightbox.
 */
export function CategoryPhotoSequence({ photos }: { photos: PhotoType[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {photos.map((photo, i) => (
        <div
          key={photo.id}
          className="category-row"
          style={
            {
              "--tile-align": ALIGN_PATTERN[i % ALIGN_PATTERN.length],
              marginBottom: "var(--gutter)",
              paddingLeft: "var(--gutter)",
              paddingRight: "var(--gutter)",
            } as React.CSSProperties
          }
        >
          <div
            className="category-tile-frame"
            style={{ "--tile-width": WIDTHS[photo.orientation] } as React.CSSProperties}
          >
            <Reveal>
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
                  style={{ borderRadius: 2 }}
                />
              </button>
            </Reveal>
          </div>
        </div>
      ))}

      <Lightbox
        photos={photos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}

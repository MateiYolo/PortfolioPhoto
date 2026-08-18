"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Photo as PhotoType } from "@/lib/content";

const NOMINAL_WIDTHS = [720, 1440, 2560] as const;

/**
 * The one place an <img> gets rendered. Builds a srcset from the three
 * ingest-time derivatives (clamped to the photo's real width so we never
 * claim a size larger than what was actually generated), blurs up from the
 * inlined LQIP, and reserves layout space via aspect-ratio so nothing
 * shifts while it loads — portrait and landscape both just work.
 */
export function Photo({
  photo,
  sizes = "100vw",
  priority = false,
  className,
  style,
  grayscale = false,
}: {
  photo: PhotoType;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  grayscale?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  const srcSet = NOMINAL_WIDTHS.map((w) => {
    const path =
      w === 720 ? photo.src.w720 : w === 1440 ? photo.src.w1440 : photo.src.w2560;
    return `${path} ${Math.min(w, photo.width)}w`;
  }).join(", ");

  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        aspectRatio: `${photo.width} / ${photo.height}`,
        backgroundImage: `url(${photo.lqip})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        ...style,
      }}
    >
      <img
        src={photo.src.w1440}
        srcSet={srcSet}
        sizes={sizes}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: grayscale ? "grayscale(1)" : "grayscale(0)",
          opacity: loaded ? 1 : 0,
          transition:
            "opacity 700ms cubic-bezier(0.65,0,0.35,1), filter 600ms cubic-bezier(0.65,0,0.35,1), transform 600ms cubic-bezier(0.65,0,0.35,1)",
        }}
      />
    </div>
  );
}

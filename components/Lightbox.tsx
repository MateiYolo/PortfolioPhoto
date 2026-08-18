"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "lenis/react";
import { useEffect } from "react";
import { Photo } from "@/components/Photo";
import type { Photo as PhotoType } from "@/lib/content";
import { ease } from "@/lib/motion";

/**
 * Full-screen photo viewer. Arrow keys / swipe to navigate, Escape or a
 * click on the backdrop to close. Locks scroll (both Lenis and native)
 * while open so the page behind can't drift.
 */
export function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
}: {
  photos: PhotoType[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const lenis = useLenis();
  const open = index !== null;

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lenis?.stop();
    return () => {
      document.body.style.overflow = prevOverflow;
      lenis?.start();
    };
  }, [open, lenis]);

  useEffect(() => {
    if (!open || index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNavigate((index + 1) % photos.length);
      if (e.key === "ArrowLeft")
        onNavigate((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, photos.length, onClose, onNavigate]);

  return (
    <AnimatePresence>
      {open && index !== null && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={photos[index].alt}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: ease.inOutQuart }}
          onClick={onClose}
          onPointerDown={(e) => {
            const startX = e.clientX;
            const handleUp = (up: PointerEvent) => {
              const dx = up.clientX - startX;
              if (dx > 60) onNavigate((index - 1 + photos.length) % photos.length);
              if (dx < -60) onNavigate((index + 1) % photos.length);
              window.removeEventListener("pointerup", handleUp);
            };
            window.addEventListener("pointerup", handleUp);
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-6 top-6 z-10 font-sans text-[0.8rem] uppercase tracking-[0.2em] text-paper"
          >
            Close ✕
          </button>

          <div
            className="absolute left-6 top-6 z-10 font-sans text-[0.8rem] tracking-[0.15em] text-paper"
            aria-hidden
          >
            {String(index + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}
          </div>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate((index - 1 + photos.length) % photos.length);
                }}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 p-4 font-sans text-2xl text-paper sm:left-6"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate((index + 1) % photos.length);
                }}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 p-4 font-sans text-2xl text-paper sm:right-6"
              >
                ›
              </button>
            </>
          )}

          <motion.div
            key={photos[index].id}
            className="relative"
            // The box is sized to exactly match the photo's own aspect
            // ratio (bounded by viewport), so cover-vs-contain never
            // matters — there's no mismatch left to crop.
            style={{
              width: `min(90vw, calc(84vh * ${photos[index].width / photos[index].height}))`,
              aspectRatio: `${photos[index].width} / ${photos[index].height}`,
            }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.4, ease: ease.inOutQuart }}
            onClick={(e) => e.stopPropagation()}
          >
            <Photo photo={photos[index]} sizes="90vw" priority />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useState } from "react";
import { cursorRingSpring } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Custom cursor: a small dot that tracks the pointer exactly, plus a ring
 * that lags behind on a spring. Any element with [data-cursor="view"] in
 * range expands the ring and shows a label — used on photo tiles.
 *
 * Desktop-only (hover:hover + pointer:fine); on touch devices this renders
 * nothing and the OS cursor/tap behaviour is untouched.
 */
export function Cursor() {
  const reducedMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, cursorRingSpring);
  const ringY = useSpring(y, cursorRingSpring);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "has-custom-cursor",
      enabled && !reducedMotion
    );
  }, [enabled, reducedMotion]);

  useEffect(() => {
    if (!enabled || reducedMotion) return;

    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = (e.target as HTMLElement)?.closest("[data-cursor]");
      setLabel(target?.getAttribute("data-cursor") || null);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [enabled, reducedMotion, x, y]);

  if (!enabled || reducedMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
      <motion.div
        className="fixed left-0 top-0 h-1.5 w-1.5 rounded-full bg-ink"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
      />
      <motion.div
        className="fixed left-0 top-0 flex items-center justify-center rounded-full bg-ink"
        style={{
          x: ringX,
          y: ringY,
          translateX: "-50%",
          translateY: "-50%",
          mixBlendMode: "difference",
        }}
        animate={{
          width: label ? 88 : 32,
          height: label ? 88 : 32,
          opacity: label ? 1 : 0.5,
        }}
        transition={{ duration: 0.3, ease: [0.65, 0, 0.35, 1] }}
      >
        {label && (
          <span className="text-[10px] font-sans uppercase tracking-[0.15em] text-paper">
            {label}
          </span>
        )}
      </motion.div>
    </div>
  );
}

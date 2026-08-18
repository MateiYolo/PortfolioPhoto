"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { magneticSpring } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Wraps interactive elements (nav links, tile titles) so they nudge toward
 * the cursor within their own bounds: a small, cheap detail that makes the
 * whole UI feel physically responsive. No-ops on touch and reduced-motion.
 */
export function MagneticLink({
  children,
  strength = 0.3,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, magneticSpring);
  const springY = useSpring(y, magneticSpring);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || e.pointerType !== "mouse") return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left - rect.width / 2) * strength);
    y.set((e.clientY - rect.top - rect.height / 2) * strength);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      style={{ x: springX, y: springY }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

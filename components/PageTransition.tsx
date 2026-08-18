"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { duration, ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Curtain page-out: a black panel wipes across on route change, masking
 * the swap underneath it. This runs independently of the native View
 * Transition used for the photo shared-element morph (see globals.css) —
 * the curtain covers ordinary navigations (nav links, "next category"),
 * while the VT handles the grid → category photo morph specifically.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <>{children}</>;

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fast, ease: ease.inOutQuart }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <motion.div
        key={`curtain-${pathname}`}
        className="pointer-events-none fixed inset-0 z-[90] bg-ink"
        style={{ originY: 0 }}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: 0 }}
        transition={{ duration: duration.curtain, ease: ease.inOutQuart }}
      />
    </>
  );
}

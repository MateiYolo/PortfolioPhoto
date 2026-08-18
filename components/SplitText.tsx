"use client";

import { motion } from "motion/react";
import { ease, stagger } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Splits text into masked, staggered characters (or words) that rise into
 * place. Used for the homepage name and section headings — the signature
 * "typography as motion" moment.
 *
 * Splitting by character reads best short (a name, a title); long strings
 * should use `by="words"` so screen-reading rhythm and wrapping stay sane.
 */
export function SplitText({
  text,
  by = "chars",
  delay = 0,
  className,
}: {
  text: string;
  by?: "chars" | "words";
  delay?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const units = by === "chars" ? Array.from(text) : text.split(" ");
  const gap = by === "words" ? "0.28em" : "0";

  if (reducedMotion) {
    return (
      <span className={className} aria-label={text}>
        {text}
      </span>
    );
  }

  return (
    <span
      className={className}
      aria-label={text}
      style={{ display: "inline-flex", flexWrap: "wrap", columnGap: gap }}
    >
      {units.map((unit, i) => (
        <span
          key={i}
          aria-hidden
          style={{ display: "inline-block", overflow: "hidden" }}
        >
          <motion.span
            style={{ display: "inline-block" }}
            initial={{ y: "110%", rotate: 6 }}
            animate={{ y: "0%", rotate: 0 }}
            transition={{
              duration: 0.7,
              ease: ease.outExpo,
              delay: delay + i * stagger.chars,
            }}
          >
            {unit === " " ? " " : unit}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

"use client";

import { useState } from "react";

/**
 * The email address on the About page: hovering rolls the label up to
 * reveal "Click to copy" underneath, and clicking copies the address and
 * confirms with a brief "Copied" swap. Falls back gracefully if the
 * Clipboard API is unavailable (older Safari, non-secure context).
 */
export function ContactEmail({ email }: { email: string }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — the address is still fully visible
      // and selectable, so the user can copy it manually.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      data-cursor="copy"
      className="font-display italic"
      style={{
        fontSize: "var(--step-2)",
        display: "block",
        overflow: "hidden",
        height: "1.3em",
        textAlign: "left",
      }}
    >
      <span
        style={{
          display: "block",
          transform: hovered && !copied ? "translateY(-50%)" : "translateY(0)",
          transition: "transform 450ms cubic-bezier(0.65,0,0.35,1)",
        }}
      >
        <span style={{ display: "block", height: "1.3em" }}>
          {copied ? "Copied ✓" : email}
        </span>
        <span style={{ display: "block", height: "1.3em" }} aria-hidden>
          Click to copy
        </span>
      </span>
    </button>
  );
}

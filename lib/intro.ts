"use client";

import { createContext, useContext } from "react";

/**
 * Whether the intro panel (components/Intro.tsx) has let go of the page, so
 * anything that animates on mount knows whether it is being mounted *behind*
 * the panel or in front of a visitor.
 *
 * Without this, every entrance on a first load plays while the panel is still
 * covering it: the hero title finishes rising before anyone can see it, and
 * the curtain comes up on type that is already sitting there. Components read
 * this instead of guessing at a delay, so the two stay in step whatever the
 * panel ends up waiting for.
 *
 * Defaults to true, which is the whole reason this is a context rather than a
 * prop: a client navigation, a page rendered with no panel above it, or a
 * component mounted on its own all answer "the page is already here, play
 * now" and behave exactly as they did before the panel existed.
 */
export const IntroReadyContext = createContext(true);

export function useIntroReady(): boolean {
  return useContext(IntroReadyContext);
}

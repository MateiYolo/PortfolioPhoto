/**
 * What the cloth morph tells the rest of the page, and nothing else.
 *
 * Kept apart from lib/clothMorph.ts so that anything needing to get out of a
 * flight's way can listen without pulling the façade — and, through it, the
 * shader — into its own bundle. Two constants and a dispatch: there is no
 * more to it, and there should not be.
 */

/** On <html> for the length of a flight. globals.css reads it too. */
export const MORPH_GATE = "cloth-morph";

/**
 * Raised before a flight hides the photo it is taking off from, and again
 * once it has handed back to the DOM. The scroll veil
 * (components/ScrollVeil.tsx) draws photographs on its own canvas and has to
 * be off the screen in between: two effects standing in for the same
 * photograph at once is one photograph too many.
 *
 * Order matters at the start — the signal goes out *first*, so a listener
 * can put its own photographs back before the flight hides one of them.
 */
export const MORPH_START = "clothmorph:start";
export const MORPH_END = "clothmorph:end";

export function signalMorph(type: typeof MORPH_START | typeof MORPH_END): void {
  window.dispatchEvent(new Event(type));
}

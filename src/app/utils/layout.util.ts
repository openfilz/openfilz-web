/**
 * The width below which the UI switches to its phone layout: the details panel
 * becomes a modal bottom sheet, and the selection toolbar collapses into the
 * actions sheet. Mirrors the 768px breakpoint the stylesheets use.
 */
export const MOBILE_BREAKPOINT_PX = 768;

/** Whether the viewport is currently showing that phone layout. */
export function isCompactViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

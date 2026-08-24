import { SignatureFieldType } from '../models/signature.models';

/**
 * Geometry helpers shared by the envelope builder and the signer page.
 *
 * The API stores field boxes normalized to the page media box (0..1) with the
 * PDF origin at the bottom-left. The browser works in CSS pixels with the
 * origin at the top-left. These helpers convert between the two.
 */

export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** CSS top-left box in pixels relative to the rendered page element. */
export interface CssBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/** Convert a CSS box (px, origin top-left) inside a page of `pageW`×`pageH` px into a normalized PDF box. */
export function cssToPdf(css: CssBox, pageW: number, pageH: number): NormalizedBox {
  const w = clamp(css.width / pageW, 0.01, 1);
  const h = clamp(css.height / pageH, 0.01, 1);
  const x = clamp(css.left / pageW, 0, 1 - w);
  const yTop = clamp(css.top / pageH, 0, 1 - h);
  return { x, y: 1 - yTop - h, w, h };
}

/** Convert a normalized PDF box back into a CSS box for a page rendered at `pageW`×`pageH` px. */
export function pdfToCss(box: NormalizedBox, pageW: number, pageH: number): CssBox {
  return {
    left: box.x * pageW,
    top: (1 - box.y - box.h) * pageH,
    width: box.w * pageW,
    height: box.h * pageH
  };
}

/** Percent-based CSS style for a normalized box (resolution independent overlay positioning). */
export function pdfToPercentStyle(box: NormalizedBox): Record<string, string> {
  return {
    left: `${box.x * 100}%`,
    top: `${(1 - box.y - box.h) * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`
  };
}

/** Keep a normalized box inside the page, preserving its size where possible. */
export function clampBox(box: NormalizedBox): NormalizedBox {
  const w = clamp(box.w, 0.01, 1);
  const h = clamp(box.h, 0.01, 1);
  return { x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h), w, h };
}

export function isWithinPage(box: NormalizedBox): boolean {
  return box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0
    && box.x + box.w <= 1 + 1e-9 && box.y + box.h <= 1 + 1e-9;
}

/** Default normalized size of a freshly dropped field, per type (portrait A4/Letter proportions). */
export function defaultFieldSize(type: SignatureFieldType): { w: number; h: number } {
  switch (type) {
    case 'SIGNATURE': return { w: 0.26, h: 0.07 };
    case 'INITIALS': return { w: 0.10, h: 0.05 };
    case 'DATE_SIGNED': return { w: 0.16, h: 0.035 };
    case 'CHECKBOX': return { w: 0.035, h: 0.025 };
    case 'RADIO': return { w: 0.16, h: 0.08 };
    case 'SELECT': return { w: 0.20, h: 0.035 };
    case 'IMAGE':
    case 'STAMP': return { w: 0.16, h: 0.10 };
    default: return { w: 0.22, h: 0.035 };
  }
}

/** Minimum normalized size a field can be resized to. */
export const MIN_FIELD_SIZE = { w: 0.02, h: 0.015 };

/**
 * Client-side mirror of the API's page selection grammar (`PageRangeParser` on the backend):
 * `3`, `2-5`, `4-`, `-3`, `1-3,7,10-`, and the keywords `all`, `odd`, `even`. Used to validate
 * before calling the API, to drive selections in the page grid, and to turn a set of pages
 * back into a compact selection string.
 */

export interface PageRangeParseResult {
  pages: number[];
  error?: string;
}

/** Parse a selection against a page count. Order and duplicates are kept. */
export function parsePageRanges(spec: string | null | undefined, pageCount: number): PageRangeParseResult {
  if (pageCount < 1) {
    return { pages: [], error: 'empty' };
  }
  const pages: number[] = [];
  const text = (spec ?? '').trim();
  if (!text) {
    for (let p = 1; p <= pageCount; p++) pages.push(p);
    return { pages };
  }
  for (const rawToken of text.split(/[,\s]+/)) {
    const token = rawToken.trim().toLowerCase();
    if (!token) continue;
    if (token === 'all') {
      for (let p = 1; p <= pageCount; p++) pages.push(p);
      continue;
    }
    if (token === 'odd') {
      for (let p = 1; p <= pageCount; p += 2) pages.push(p);
      continue;
    }
    if (token === 'even') {
      for (let p = 2; p <= pageCount; p += 2) pages.push(p);
      continue;
    }
    const dash = token.indexOf('-');
    if (dash < 0) {
      const page = parsePage(token, pageCount);
      if (page === null) return { pages: [], error: token };
      pages.push(page);
      continue;
    }
    const left = token.substring(0, dash).trim();
    const right = token.substring(dash + 1).trim();
    if (right.includes('-')) return { pages: [], error: token };
    const from = left ? parsePage(left, pageCount) : 1;
    const to = right ? parsePage(right, pageCount) : pageCount;
    if (from === null || to === null || from > to) return { pages: [], error: token };
    for (let p = from; p <= to; p++) pages.push(p);
  }
  if (pages.length === 0) {
    return { pages: [], error: text };
  }
  return { pages };
}

function parsePage(value: string, pageCount: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return page >= 1 && page <= pageCount ? page : null;
}

/** "1-3,7,10-12" for a set of pages (sorted, deduplicated). */
export function formatPageRanges(pages: Iterable<number>): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = -1;
  let prev = -1;
  for (const p of sorted) {
    if (start < 0) {
      start = prev = p;
    } else if (p === prev + 1) {
      prev = p;
    } else {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = prev = p;
    }
  }
  if (start >= 0) parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(', ');
}

/** Consecutive chunks of `n` pages: [[1..n], [n+1..2n], …]. */
export function chunkPages(pageCount: number, n: number): number[][] {
  const parts: number[][] = [];
  if (n < 1) return parts;
  for (let start = 1; start <= pageCount; start += n) {
    const part: number[] = [];
    for (let p = start; p <= Math.min(start + n - 1, pageCount); p++) part.push(p);
    parts.push(part);
  }
  return parts;
}

/** Parts delimited by cut pages (each cut starts a new part; cuts in 2..pageCount). */
export function cutPages(pageCount: number, cuts: Iterable<number>): number[][] {
  const sortedCuts = Array.from(new Set(cuts)).filter(c => c >= 2 && c <= pageCount).sort((a, b) => a - b);
  const parts: number[][] = [];
  let start = 1;
  for (const cut of sortedCuts) {
    parts.push(range(start, cut - 1));
    start = cut;
  }
  parts.push(range(start, pageCount));
  return parts;
}

export function range(from: number, to: number): number[] {
  const pages: number[] = [];
  for (let p = from; p <= to; p++) pages.push(p);
  return pages;
}

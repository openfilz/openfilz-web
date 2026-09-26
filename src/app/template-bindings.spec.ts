import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard against an element binding the same output or input twice — a merge leftover that
 * compiles fine but runs the handler twice: the toolbar's (requestSignatureSelected) opened
 * the e-Sign dialog twice, the list view's (toggleFavorite) starred then un-starred.
 * Scans every inline and external template. Runs in node:
 * `npx vitest run src/app/template-bindings.spec.ts --globals`.
 */
const APP_DIR = join(process.cwd(), 'src', 'app');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

/** "file <tag> binding" for every element that repeats an (output), [input] or [(model)] binding. */
function duplicateBindings(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const found: string[] = [];
  // An opening tag: attribute values may hold '>' (e.g. arrow functions), so skip quoted runs.
  const tag = /<([a-z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    const counts = new Map<string, number>();
    const binding = /(\[\(\w+\)\]|\(\w[\w.]*\)|\[\w[\w.-]*\])\s*=/g;
    for (let b = binding.exec(m[2]); b; b = binding.exec(m[2])) counts.set(b[1], (counts.get(b[1]) ?? 0) + 1);
    for (const [name, n] of counts) {
      if (n > 1) found.push(`${relative(APP_DIR, file)} <${m[1]}> ${name} x${n}`);
    }
  }
  return found;
}

describe('component templates', () => {
  it('never bind the same output or input twice on one element', () => {
    const files = sources(APP_DIR);
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap(duplicateBindings)).toEqual([]);
  });
});

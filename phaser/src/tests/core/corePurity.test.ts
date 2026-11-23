import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

// Guards the architecture rule from CLAUDE.md: src/core is pure TypeScript.
// No Phaser, no DOM/browser APIs, no timers/async, no unseeded randomness,
// and no imports from the outer layers (scenes/ui/app/net/server).

const CORE_DIR = join(import.meta.dirname, '../../core');

const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /from ['"]phaser['"]/, reason: 'imports Phaser' },
  { pattern: /from ['"](\.\.\/)+(scenes|ui|app|net|server)\//, reason: 'imports an outer layer' },
  { pattern: /\b(document|window|localStorage|sessionStorage|indexedDB|navigator)\./, reason: 'uses a browser global' },
  { pattern: /\b(setTimeout|setInterval|requestAnimationFrame)\(/, reason: 'uses a timer' },
  { pattern: /\basync\s+(function|\(|[a-zA-Z_$][\w$]*\s*\()/, reason: 'uses async' },
  { pattern: /Math\.random\(/, reason: 'uses unseeded Math.random (use state.rng)' },
  { pattern: /Date\.now\(/, reason: 'reads the wall clock' },
];

// Explicit, reviewed exceptions: "file:reason".
const ALLOWED = new Set([
  // Fallback seed when the caller does not supply one; tests always pass a seed.
  'engines/gameManager.ts:reads the wall clock',
]);

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('core purity', () => {
  it('src/core has no Phaser, DOM, timer, async, or unseeded-random usage', () => {
    const violations: string[] = [];
    for (const file of listTsFiles(CORE_DIR)) {
      const rel = relative(CORE_DIR, file).replace(/\\/g, '/');
      const source = stripComments(readFileSync(file, 'utf-8'));
      for (const { pattern, reason } of FORBIDDEN) {
        if (pattern.test(source) && !ALLOWED.has(`${rel}:${reason}`)) {
          violations.push(`${rel}: ${reason}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

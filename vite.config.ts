import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Writes dist/sw.js after the build: the service worker template with the list
 * of every built file and a version derived from their contents. Hand-rolled on
 * purpose, to keep the dependency list short and the caching rules readable.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'larpcam-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      // .woff is only a fallback for browsers older than we support; skip it offline.
      const precache = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.endsWith('.woff')).sort();
      const hash = createHash('sha256');
      for (const file of precache) {
        hash.update(file);
        hash.update(readFileSync(join(outDir, file)));
      }
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(resolve(import.meta.dirname, 'src/sw.js'), 'utf8');
      const source = template
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace("['__PRECACHE__']", JSON.stringify(precache));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  // Relative base: the same build works at the site root, under /LarpCam/, and
  // under a pull-request preview folder.
  base: './',
  plugins: [preact(), serviceWorker()],
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
  },
  build: {
    target: ['es2022', 'safari16.4'],
    cssMinify: true,
  },
  server: { host: true },
  preview: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

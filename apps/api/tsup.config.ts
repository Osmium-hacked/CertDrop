import { defineConfig } from 'tsup';

// Bundling (rather than plain tsc) lets the API import @certdrop/shared as TypeScript source:
// the shared code is inlined, while real npm dependencies stay external in node_modules.
export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: ['@certdrop/shared'],
});

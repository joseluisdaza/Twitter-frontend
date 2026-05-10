// Build script: bundles src/main.ts → dist/app.js using esbuild.
// Run from the CDK repo root context (where smithy/ and frontend/ are siblings),
// so that the Smithy type imports in src/main.ts resolve correctly.
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  platform: 'browser',
  target: 'es2022',
  // import type { ... } statements are erased by esbuild — the Smithy SDK
  // is NOT included in the bundle. Only the app logic ends up in dist/app.js.
});

console.log('✅ Build complete → dist/app.js');

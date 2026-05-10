// Build script: copies public/ → dist/ and bundles src/main.ts → dist/app.js.
// Run with --watch for local development (esbuild watch mode + public/ watcher).
//
// Usage:
//   npm run build   → one-shot production build
//   npm run dev     → watch mode for local development
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const isWatch = process.argv.includes('--watch');

// Ensure dist/ exists
fs.mkdirSync('dist', { recursive: true });

// Copy all files from public/ to dist/ (skips runtime-config.example.js)
function copyPublic() {
  for (const file of fs.readdirSync('public')) {
    if (file === 'runtime-config.example.js') continue; // never copy the example
    fs.copyFileSync(path.join('public', file), path.join('dist', file));
  }
  console.log('📋 Copied public/ → dist/');
}

copyPublic();

/** @type {import('esbuild').BuildOptions} */
const esbuildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  platform: 'browser',
  target: 'es2022',
  // import type { ... } statements are erased at bundle time — zero runtime overhead.
};

if (isWatch) {
  // Watch public/ for HTML/CSS changes and re-copy to dist/
  fs.watch('public', (_event, filename) => {
    if (filename && filename !== 'runtime-config.example.js') {
      console.log(`📋 ${filename} changed, copying public/ → dist/`);
      copyPublic();
    }
  });

  // Watch src/ with esbuild's incremental rebuild
  const ctx = await esbuild.context(esbuildOptions);
  await ctx.watch();

  console.log('👀 Watching for changes... (Ctrl+C to stop)');
  console.log('📂 Open dist/index.html in your browser');
  console.log('💡 Tip: copy public/runtime-config.example.js → dist/runtime-config.js');
} else {
  await esbuild.build(esbuildOptions);
  console.log('✅ Build complete → dist/');
}

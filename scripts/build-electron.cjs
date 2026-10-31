const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

fs.mkdirSync('dist-electron', { recursive: true });

esbuild.buildSync({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist-electron/main.cjs',
  external: ['electron', 'better-sqlite3', 'koffi', 'sharp', 'vite'],
});

fs.copyFileSync(
  path.resolve(__dirname, '../electron/preload.cjs'),
  path.resolve(__dirname, '../dist-electron/preload.cjs')
);

if (fs.existsSync(path.resolve(__dirname, '../electron/auth-preload.cjs'))) {
  fs.copyFileSync(
    path.resolve(__dirname, '../electron/auth-preload.cjs'),
    path.resolve(__dirname, '../dist-electron/auth-preload.cjs')
  );
}

console.log('Successfully bundled dist-electron/main.cjs and copied preload scripts');

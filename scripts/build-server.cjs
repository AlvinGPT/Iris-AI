const esbuild = require('esbuild');
const fs = require('fs');

fs.mkdirSync('dist-server', { recursive: true });

esbuild.buildSync({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist-server/server.cjs',
  external: ['better-sqlite3', 'koffi', 'sharp', 'vite'],
});

console.log('Successfully bundled dist-server/server.cjs');

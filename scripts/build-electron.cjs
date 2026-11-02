const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

fs.mkdirSync('dist-electron', { recursive: true });

function xorEncode(text, key) {
  if (!text) return '';
  const buf = Buffer.from(text, 'utf8');
  const keyBuf = Buffer.from(key, 'utf8');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
  }
  return out.toString('hex');
}

let geminiKey = process.env.GEMINI_API_KEY || '';
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const xorMatch = envContent.match(/^GEMINI_API_KEY_XOR\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (xorMatch && xorMatch[1]) {
      const hex = xorMatch[1].trim();
      const mask = 'IRIS_RETIS_SECRET_SALT_2026';
      const buf = Buffer.from(hex, 'hex');
      const keyBuf = Buffer.from(mask, 'utf8');
      const out = Buffer.alloc(buf.length);
      for (let i = 0; i < buf.length; i++) {
        out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
      }
      geminiKey = out.toString('utf8');
    } else {
      const match = envContent.match(/^GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m);
      if (match && match[1]) {
        geminiKey = match[1].trim();
      }
    }
  }
} catch (e) {
  console.warn('[build-electron] Could not parse .env key:', e.message);
}

// Obfuscate secret so zero plaintext API keys appear in compiled binaries
const obfuscatedHex = xorEncode(geminiKey, 'IRIS_RETIS_SECRET_SALT_2026');

const bannerJs = `// IRIS Security Layer: Runtime Key Deobfuscation (Zero Plaintext Keys)
(() => {
  const hex = ${JSON.stringify(obfuscatedHex)};
  const salt = 'IRIS_RETIS_SECRET_SALT_2026';
  if (hex) {
    try {
      const buf = Buffer.from(hex, 'hex');
      const keyBuf = Buffer.from(salt, 'utf8');
      const out = Buffer.alloc(buf.length);
      for (let i = 0; i < buf.length; i++) {
        out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
      }
      const resolved = out.toString('utf8');
      if (!process.env.GEMINI_API_KEY && resolved) process.env.GEMINI_API_KEY = resolved;
      if (!process.env.VITE_GEMINI_API_KEY && resolved) process.env.VITE_GEMINI_API_KEY = resolved;
    } catch {}
  }
})();`;

esbuild.buildSync({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist-electron/main.cjs',
  external: ['electron', 'better-sqlite3', 'koffi', 'sharp', 'vite', '@andresaya/edge-tts', '@travisvn/edge-tts'],
  banner: {
    js: bannerJs,
  },
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

console.log('Successfully bundled dist-electron/main.cjs and copied preload scripts (with runtime XOR deobfuscated key)');

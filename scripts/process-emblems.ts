import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

async function main() {
  const dir = path.resolve('public/assets');
  const aistudioDir = path.join(dir, 'aistudio');

  const file1 = path.join(aistudioDir, 'Iris_AI__Logo__86a35229.png');
  const file2 = path.join(aistudioDir, 'Iris_AI__Logo___1__588b8171.png');

  async function inspectFile(filePath: string) {
    const buffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    let sumR = 0, sumG = 0, sumB = 0, opaqueCount = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const a = info.channels === 4 ? data[idx + 3] : 255;
        if (a > 10) { // opaque or semi-opaque
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          opaqueCount++;
        }
      }
    }

    const avgR = opaqueCount ? Math.round(sumR / opaqueCount) : 0;
    const avgG = opaqueCount ? Math.round(sumG / opaqueCount) : 0;
    const avgB = opaqueCount ? Math.round(sumB / opaqueCount) : 0;

    return {
      filePath,
      hash,
      width: info.width,
      height: info.height,
      channels: info.channels,
      bounds: { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
      avgColor: { r: avgR, g: avgG, b: avgB },
      isDark: avgR < 50 && avgG < 50 && avgB < 50,
      buffer
    };
  }

  const f1 = await inspectFile(file1);
  const f2 = await inspectFile(file2);

  console.log('File 1:', {
    name: path.basename(f1.filePath),
    hash: f1.hash,
    bounds: f1.bounds,
    avgColor: f1.avgColor,
    isDark: f1.isDark
  });

  console.log('File 2:', {
    name: path.basename(f2.filePath),
    hash: f2.hash,
    bounds: f2.bounds,
    avgColor: f2.avgColor,
    isDark: f2.isDark
  });

  const blackInfo = f1.isDark ? f1 : f2;
  const whiteInfo = f1.isDark ? f2 : f1;

  // 1. Copy originals byte-for-byte
  const originalBlackPath = path.join(dir, 'iris-emblem-black.png');
  const originalWhitePath = path.join(dir, 'iris-emblem-white.png');
  fs.writeFileSync(originalBlackPath, blackInfo.buffer);
  fs.writeFileSync(originalWhitePath, whiteInfo.buffer);

  console.log('Original black copied to:', originalBlackPath, 'SHA:', crypto.createHash('sha256').update(fs.readFileSync(originalBlackPath)).digest('hex'));
  console.log('Original white copied to:', originalWhitePath, 'SHA:', crypto.createHash('sha256').update(fs.readFileSync(originalWhitePath)).digest('hex'));

  // 2. Crop to square centered on emblem's bounds with uniform 4% margin
  // To ensure scale consistency:
  // Let emblem max dimension be max(w, h). We want emblem to occupy exactly the same fraction of the square crop (e.g. 1 / (1 + 2 * marginFraction)).
  // If margin = 4% on each side, emblem fraction = 1 / (1 + 0.08) = ~92.59% or margin = 4% of emblem size.
  // "Crop each file to a square centered on the emblem's opaque bounds with a small uniform margin (about 4%). Both crops must preserve the emblem's proportions exactly (no stretching).
  // Make the two crops scale-consistent so the emblem occupies the same fraction of the frame in both. Swapping between the black and white versions must never change the rendered logo size. The white emblem is slightly smaller inside its canvas than the black one, so crop each to its own bounds."

  async function processEmblem(info: typeof f1, prefix: 'black' | 'white') {
    const { minX, maxX, minY, maxY, w, h } = info.bounds;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const maxDim = Math.max(w, h);
    
    // 4% margin on each side means square size = maxDim / (1 - 2 * 0.04) or maxDim * 1.08
    // Let's use 4% margin relative to the square: emblem occupies exactly 92% of the crop box, margin is 4% on each side.
    const cropSize = Math.round(maxDim / 0.92);

    const left = Math.round(centerX - cropSize / 2);
    const top = Math.round(centerY - cropSize / 2);

    console.log(`${prefix} crop:`, {
      emblemBounds: info.bounds,
      center: { centerX, centerY },
      maxDim,
      cropSize,
      cropBox: { left, top, width: cropSize, height: cropSize },
      emblemFractionOfCrop: (maxDim / cropSize * 100).toFixed(2) + '%'
    });

    // Extract square region from original 2000x2000
    // Using sharp:
    const croppedBuffer = await sharp(info.buffer)
      .extract({ left, top, width: cropSize, height: cropSize })
      .toBuffer();

    // Export derived sizes: 512, 128, 64, 32, 16
    const sizes = [512, 128, 64, 32, 16];
    for (const size of sizes) {
      const outPath = path.join(dir, `iris-emblem-${prefix}-${size}.png`);
      await sharp(croppedBuffer)
        .resize(size, size, { kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
      console.log(`Saved: ${outPath} (${size}x${size})`);
    }

    // Also export standard cropped full-res derived file
    const croppedMasterPath = path.join(dir, `iris-emblem-${prefix}-cropped.png`);
    await sharp(croppedBuffer)
      .png({ compressionLevel: 9 })
      .toFile(croppedMasterPath);
  }

  await processEmblem(blackInfo, 'black');
  await processEmblem(whiteInfo, 'white');

  console.log('\n--- VERIFYING DERIVED FILES ---');
  const verifySizes = [512, 128, 64, 32, 16];
  for (const prefix of ['black', 'white'] as const) {
    for (const size of verifySizes) {
      const p = path.join(dir, `iris-emblem-${prefix}-${size}.png`);
      const v = await inspectFile(p);
      const frac = (Math.max(v.bounds.w, v.bounds.h) / size * 100).toFixed(2);
      console.log(`[VERIFY ${prefix.toUpperCase()} ${size}x${size}]`, {
        bounds: v.bounds,
        center: { cx: (v.bounds.minX + v.bounds.maxX)/2, cy: (v.bounds.minY + v.bounds.maxY)/2 },
        fraction: `${frac}%`,
        avgColor: `rgb(${v.avgColor.r},${v.avgColor.g},${v.avgColor.b})`
      });
    }
  }

  console.log('Processing and verification completed successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

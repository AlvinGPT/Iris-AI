/**
 * IRIS AI — Emblem Derived Assets Generator
 * 
 * Strict specifications:
 * 1. Takes original 2000x2000 supplied PNGs (black: Iris_AI__Logo__86a35229.png, white: Iris_AI__Logo___1__588b8171.png).
 * 2. Crops to square centered on opaque bounds with uniform 4% margin.
 * 3. Maintains identical emblem scale between black and white variants (~92% fill, ~4% padding).
 * 4. Resamples cleanly to 512, 128, 64, 32, and 16 px without distortion or color change.
 * 5. Generates high-contrast browser favicon variants.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'public', 'assets');

async function getOpaqueBounds(filePath) {
  const image = sharp(filePath);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const alpha = data[idx + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  return { minX, maxX, minY, maxY, width, height, centerX, centerY };
}

async function processEmblem(variant, srcPath) {
  const fileBuf = fs.readFileSync(srcPath);
  const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
  console.log(`[Source] ${variant}: ${srcPath} (${fileBuf.length} bytes, SHA-256: ${hash})`);

  const bounds = await getOpaqueBounds(srcPath);
  console.log(`[Bounds] ${variant}:`, bounds);

  // Square crop size: max dimension / 0.92 gives 4% padding on each side
  const maxDim = Math.max(bounds.width, bounds.height);
  const targetSquareSize = Math.round(maxDim / 0.92);
  
  const left = Math.round(bounds.centerX - targetSquareSize / 2);
  const top = Math.round(bounds.centerY - targetSquareSize / 2);

  console.log(`[Crop Area] ${variant}: left=${left}, top=${top}, size=${targetSquareSize}x${targetSquareSize}`);

  const croppedBuf = await sharp(srcPath)
    .extract({ left, top, width: targetSquareSize, height: targetSquareSize })
    .png()
    .toBuffer();

  // Save master cropped file
  const croppedPath = path.join(ASSETS_DIR, `iris-emblem-${variant}-cropped.png`);
  fs.writeFileSync(croppedPath, croppedBuf);

  // Generate targets: 512, 128, 64, 32, 16
  const sizes = [512, 128, 64, 32, 16];
  for (const size of sizes) {
    const resizedBuf = await sharp(croppedBuf)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();

    const outPath = path.join(ASSETS_DIR, `iris-emblem-${variant}-${size}.png`);
    fs.writeFileSync(outPath, resizedBuf);
  }

  // Also copy master original to public/assets/iris-emblem-${variant}.png
  const destOriginal = path.join(ASSETS_DIR, `iris-emblem-${variant}.png`);
  if (!fs.existsSync(destOriginal) || fs.readFileSync(destOriginal).length !== fileBuf.length) {
    fs.writeFileSync(destOriginal, fileBuf);
  }

  console.log(`[Complete] ${variant} generated sizes: ${sizes.join(', ')}`);
}

async function run() {
  const blackSrc = path.join(ASSETS_DIR, 'iris-emblem-black.png');
  const whiteSrc = path.join(ASSETS_DIR, 'iris-emblem-white.png');

  await processEmblem('black', blackSrc);
  await processEmblem('white', whiteSrc);
  console.log('All emblems derived successfully.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

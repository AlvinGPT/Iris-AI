const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createIco(sourcePngPath, outputIcoPath, sizes = [16, 32, 48, 64, 128, 256]) {
  console.log(`Generating ICO from ${sourcePngPath} -> ${outputIcoPath}...`);
  if (!fs.existsSync(sourcePngPath)) {
    throw new Error(`Source image not found: ${sourcePngPath}`);
  }

  // Generate PNG buffers for each size
  const images = [];
  for (const size of sizes) {
    const buffer = await sharp(sourcePngPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    images.push({
      size,
      buffer,
    });
  }

  const count = images.length;
  const headerSize = 6;
  const directoryEntrySize = 16;
  const totalHeaderSize = headerSize + count * directoryEntrySize;

  let offset = totalHeaderSize;
  const directoryEntries = [];

  for (const img of images) {
    const entry = Buffer.alloc(directoryEntrySize);
    const width = img.size >= 256 ? 0 : img.size;
    const height = img.size >= 256 ? 0 : img.size;

    entry.writeUInt8(width, 0); // Width
    entry.writeUInt8(height, 1); // Height
    entry.writeUInt8(0, 2); // Color count
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Image offset

    directoryEntries.push(entry);
    offset += img.buffer.length;
  }

  // File Header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO icon
  header.writeUInt16LE(count, 4); // Number of images

  const icoBuffer = Buffer.concat([
    header,
    ...directoryEntries,
    ...images.map((img) => img.buffer),
  ]);

  const dir = path.dirname(outputIcoPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputIcoPath, icoBuffer);
  console.log(`Successfully generated ${outputIcoPath} (${icoBuffer.length} bytes, ${count} sizes).`);
}

async function main() {
  const sourcePath = path.resolve(__dirname, '../public/assets/iris-emblem-black-512.png');
  const targetPublic = path.resolve(__dirname, '../public/assets/icon.ico');
  const targetBuild = path.resolve(__dirname, '../build/icon.ico');

  await createIco(sourcePath, targetPublic);
  await createIco(sourcePath, targetBuild);
}

main().catch((err) => {
  console.error('Error generating ICO:', err);
  process.exit(1);
});

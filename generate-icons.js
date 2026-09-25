// Pure Node.js script using built-in zlib to create valid 192x192 and 512x512 PNG icons for PWA
const fs = require('fs');
const zlib = require('zlib');

function createSolidPNG(width, height, r, g, b, a = 255) {
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw Image Scanlines (Filter byte 0 + RGBA per pixel)
  const lineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * lineLength);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.42;

  for (let y = 0; y < height; y++) {
    const lineStart = y * lineLength;
    rawData[lineStart] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const idx = lineStart + 1 + x * 4;
      const dist = Math.hypot(x - cx, y - cy);

      // Cyber gradient with glowing circle
      if (dist < radius) {
        const ring = Math.abs(dist - radius * 0.7);
        if (ring < 6) {
          // Neon cyan ring
          rawData[idx] = 0;
          rawData[idx + 1] = 243;
          rawData[idx + 2] = 255;
          rawData[idx + 3] = 255;
        } else if (dist < radius * 0.25) {
          // Hot pink core
          rawData[idx] = 255;
          rawData[idx + 1] = 0;
          rawData[idx + 2] = 127;
          rawData[idx + 3] = 255;
        } else {
          // Dark cyber blue gradient
          rawData[idx] = 14;
          rawData[idx + 1] = 23;
          rawData[idx + 2] = 38;
          rawData[idx + 3] = 255;
        }
      } else {
        // Outer dark background
        rawData[idx] = 7;
        rawData[idx + 1] = 9;
        rawData[idx + 2] = 14;
        rawData[idx + 3] = 255;
      }
    }
  }

  // IDAT Chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

fs.writeFileSync('icon-192.png', createSolidPNG(192, 192, 0, 243, 255));
fs.writeFileSync('icon-512.png', createSolidPNG(512, 512, 0, 243, 255));
console.log('PWA PNG icons generated successfully: icon-192.png, icon-512.png');

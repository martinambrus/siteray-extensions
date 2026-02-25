const fs = require('fs');
const path = require('path');

// Generate simple PNG icons using raw pixel data
// Each icon is a radar/scanner circle design

const SIZES = [16, 48, 128];
const ICONS_DIR = path.join(__dirname, '..', 'src', 'icons');

fs.mkdirSync(ICONS_DIR, { recursive: true });

// Create a simple PNG file from pixel data
function createPNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      const ri = y * (1 + width * 4) + 1 + x * 4;
      rawData[ri] = pixels[pi];     // R
      rawData[ri + 1] = pixels[pi + 1]; // G
      rawData[ri + 2] = pixels[pi + 2]; // B
      rawData[ri + 3] = pixels[pi + 3]; // A
    }
  }

  const { deflateSync } = require('zlib');
  const compressed = deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function drawCircle(pixels, width, cx, cy, r, color, thickness) {
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (Math.abs(dist - r) < thickness / 2) {
        const alpha = Math.max(0, 1 - Math.abs(dist - r) / (thickness / 2));
        const pi = (y * width + x) * 4;
        blendPixel(pixels, pi, color, alpha);
      }
    }
  }
}

function drawFilledCircle(pixels, width, cx, cy, r, color) {
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        const alpha = dist > r - 1 ? r - dist : 1;
        const pi = (y * width + x) * 4;
        blendPixel(pixels, pi, color, Math.max(0, alpha));
      }
    }
  }
}

function drawLine(pixels, width, x1, y1, x2, y2, color, thickness) {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(len * 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    drawFilledCircle(pixels, width, px, py, thickness / 2, color);
  }
}

function blendPixel(pixels, pi, color, alpha) {
  const a = alpha * (color[3] / 255);
  const existingA = pixels[pi + 3] / 255;
  const newA = a + existingA * (1 - a);
  if (newA > 0) {
    pixels[pi] = Math.round((color[0] * a + pixels[pi] * existingA * (1 - a)) / newA);
    pixels[pi + 1] = Math.round((color[1] * a + pixels[pi + 1] * existingA * (1 - a)) / newA);
    pixels[pi + 2] = Math.round((color[2] * a + pixels[pi + 2] * existingA * (1 - a)) / newA);
    pixels[pi + 3] = Math.round(newA * 255);
  }
}

function generateIcon(size, color) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 24; // Base design is 24x24

  // Ensure minimum stroke widths so small icons stay visible
  const outerStroke = Math.max(2.2, 2.5 * scale);
  const innerStroke = Math.max(1.8, 2.0 * scale);
  const lineStroke = Math.max(1.8, 2.0 * scale);

  // Outer circle
  drawCircle(pixels, size, cx, cy, 10 * scale, color, outerStroke);

  // Inner circle - use 80% alpha instead of 60%
  const innerColor = [...color];
  innerColor[3] = Math.round(color[3] * 0.8);
  drawCircle(pixels, size, cx, cy, 6 * scale, innerColor, innerStroke);

  // Center dot - slightly larger
  drawFilledCircle(pixels, size, cx, cy, Math.max(1.5, 2.2 * scale), color);

  // Crosshair lines - thicker and with minimum size
  drawLine(pixels, size, cx, 1.5 * scale, cx, 5 * scale, color, lineStroke);   // top
  drawLine(pixels, size, cx, 19 * scale, cx, 22.5 * scale, color, lineStroke);  // bottom
  drawLine(pixels, size, 1.5 * scale, cy, 5 * scale, cy, color, lineStroke);   // left
  drawLine(pixels, size, 19 * scale, cy, 22.5 * scale, cy, color, lineStroke);  // right

  return pixels;
}

// Color definitions [R, G, B, A]
const COLORS = {
  gray: [107, 114, 128, 255],
  green: [34, 197, 94, 255],
  yellow: [234, 179, 8, 255],
  red: [239, 68, 68, 255],
};

for (const [colorName, color] of Object.entries(COLORS)) {
  for (const size of SIZES) {
    const pixels = generateIcon(size, color);
    const png = createPNG(size, size, pixels);
    const filename = `icon-${colorName}-${size}.png`;
    fs.writeFileSync(path.join(ICONS_DIR, filename), png);
    console.log(`Generated ${filename}`);
  }
}

console.log('All icons generated!');

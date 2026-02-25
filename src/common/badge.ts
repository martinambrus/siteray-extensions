import browser from 'webextension-polyfill';
import type { IconDisplayMode, RiskLevel } from './types';

const BADGE_COLORS: Record<RiskLevel, [number, number, number]> = {
  green: [34, 197, 94],
  yellow: [234, 179, 8],
  red: [239, 68, 68],
};

const GRAY_COLOR: [number, number, number] = [107, 114, 128];

function generateScoreIcon(size: number, score: number, color: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // Just colored text on transparent background, as large as the icon allows
  const text = String(score);
  drawTextMaxSize(data, size, text, cx, cy, color);

  return new ImageData(data, size, size);
}

function generateGrayIcon(size: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 24;

  const color = GRAY_COLOR;

  // Draw outer circle (ring)
  const outerR = 10 * scale;
  const outerStroke = Math.max(2.2, 2.5 * scale);
  drawRing(data, size, cx, cy, outerR, outerStroke, color, 255);

  // Draw inner circle (ring) at 80% alpha
  const innerR = 6 * scale;
  const innerStroke = Math.max(1.8, 2.0 * scale);
  drawRing(data, size, cx, cy, innerR, innerStroke, color, 204);

  // Center dot
  const dotR = Math.max(1.5, 2.2 * scale);
  drawFilledCircle(data, size, cx, cy, dotR, color, 255);

  // Crosshair lines
  const lineStroke = Math.max(1.8, 2.0 * scale);
  drawLineSegment(data, size, cx, 1.5 * scale, cx, 5 * scale, lineStroke, color, 255);
  drawLineSegment(data, size, cx, 19 * scale, cx, 22.5 * scale, lineStroke, color, 255);
  drawLineSegment(data, size, 1.5 * scale, cy, 5 * scale, cy, lineStroke, color, 255);
  drawLineSegment(data, size, 19 * scale, cy, 22.5 * scale, cy, lineStroke, color, 255);

  return new ImageData(data, size, size);
}

function drawRing(
  data: Uint8ClampedArray, size: number,
  cx: number, cy: number, r: number, thickness: number,
  color: [number, number, number], alpha: number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2);
      const edgeDist = Math.abs(dist - r);
      if (edgeDist < thickness / 2) {
        const a = Math.max(0, 1 - edgeDist / (thickness / 2));
        blendPixel(data, size, x, y, color, a * (alpha / 255));
      }
    }
  }
}

function drawFilledCircle(
  data: Uint8ClampedArray, size: number,
  cx: number, cy: number, r: number,
  color: [number, number, number], alpha: number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2);
      if (dist <= r) {
        const a = dist > r - 1 ? Math.max(0, r - dist) : 1;
        blendPixel(data, size, x, y, color, a * (alpha / 255));
      }
    }
  }
}

function drawLineSegment(
  data: Uint8ClampedArray, size: number,
  x1: number, y1: number, x2: number, y2: number,
  thickness: number, color: [number, number, number], alpha: number,
): void {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(len * 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    drawFilledCircle(data, size, px, py, thickness / 2, color, alpha);
  }
}

function blendPixel(
  data: Uint8ClampedArray, size: number,
  x: number, y: number,
  color: [number, number, number], alpha: number,
): void {
  const pi = (Math.round(y) * size + Math.round(x)) * 4;
  if (pi < 0 || pi >= data.length - 3) return;

  const a = alpha;
  const existingA = data[pi + 3] / 255;
  const newA = a + existingA * (1 - a);
  if (newA > 0) {
    data[pi] = Math.round((color[0] * a + data[pi] * existingA * (1 - a)) / newA);
    data[pi + 1] = Math.round((color[1] * a + data[pi + 1] * existingA * (1 - a)) / newA);
    data[pi + 2] = Math.round((color[2] * a + data[pi + 2] * existingA * (1 - a)) / newA);
    data[pi + 3] = Math.round(newA * 255);
  }
}

// Bold bitmap font for score numbers - each glyph is defined on a 6x7 grid with 2px strokes
const FONT_GLYPHS: Record<string, number[]> = {
  '0': [
    0,1,1,1,1,0,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,0,
  ],
  '1': [
    0,0,1,1,0,0,
    0,1,1,1,0,0,
    1,1,1,1,0,0,
    0,0,1,1,0,0,
    0,0,1,1,0,0,
    0,0,1,1,0,0,
    1,1,1,1,1,1,
  ],
  '2': [
    0,1,1,1,1,0,
    1,1,0,0,1,1,
    0,0,0,0,1,1,
    0,0,0,1,1,0,
    0,0,1,1,0,0,
    0,1,1,0,0,0,
    1,1,1,1,1,1,
  ],
  '3': [
    0,1,1,1,1,0,
    1,1,0,0,1,1,
    0,0,0,0,1,1,
    0,0,1,1,1,0,
    0,0,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,0,
  ],
  '4': [
    0,0,0,1,1,0,
    0,0,1,1,1,0,
    0,1,1,0,1,0,
    1,1,0,0,1,0,
    1,1,1,1,1,1,
    0,0,0,0,1,0,
    0,0,0,0,1,0,
  ],
  '5': [
    1,1,1,1,1,1,
    1,1,0,0,0,0,
    1,1,1,1,1,0,
    0,0,0,0,1,1,
    0,0,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,0,
  ],
  '6': [
    0,1,1,1,1,0,
    1,1,0,0,0,0,
    1,1,0,0,0,0,
    1,1,1,1,1,0,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,0,
  ],
  '7': [
    1,1,1,1,1,1,
    0,0,0,0,1,1,
    0,0,0,1,1,0,
    0,0,0,1,1,0,
    0,0,1,1,0,0,
    0,0,1,1,0,0,
    0,0,1,1,0,0,
  ],
  '8': [
    0,1,1,1,1,0,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,0,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,0,
  ],
  '9': [
    0,1,1,1,1,0,
    1,1,0,0,1,1,
    1,1,0,0,1,1,
    0,1,1,1,1,1,
    0,0,0,0,1,1,
    0,0,0,0,1,1,
    0,1,1,1,1,0,
  ],
};

const GLYPH_W = 6;
const GLYPH_H = 7;

function drawTextMaxSize(
  data: Uint8ClampedArray, size: number,
  text: string, cx: number, cy: number,
  color: [number, number, number],
): void {
  const digits = text.split('');
  const gap = 1;
  const rawWidth = digits.length * GLYPH_W + (digits.length - 1) * gap;
  const rawHeight = GLYPH_H;

  // Scale to fill ~92% of icon in both dimensions, pick the smaller
  const scaleX = (size * 0.92) / rawWidth;
  const scaleY = (size * 0.92) / rawHeight;
  const pixelScale = Math.max(1, Math.floor(Math.min(scaleX, scaleY)));

  const totalW = rawWidth * pixelScale;
  const totalH = rawHeight * pixelScale;
  const startX = Math.round(cx - totalW / 2);
  const startY = Math.round(cy - totalH / 2);

  let offsetX = 0;
  for (const digit of digits) {
    const glyph = FONT_GLYPHS[digit];
    if (!glyph) continue;

    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (glyph[gy * GLYPH_W + gx]) {
          for (let sy = 0; sy < pixelScale; sy++) {
            for (let sx = 0; sx < pixelScale; sx++) {
              const px = startX + offsetX + gx * pixelScale + sx;
              const py = startY + gy * pixelScale + sy;
              if (px >= 0 && px < size && py >= 0 && py < size) {
                const pi = (py * size + px) * 4;
                data[pi] = color[0];
                data[pi + 1] = color[1];
                data[pi + 2] = color[2];
                data[pi + 3] = 255;
              }
            }
          }
        }
      }
    }
    offsetX += (GLYPH_W + gap) * pixelScale;
  }
}

function generateGreenTickIcon(size: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const color: [number, number, number] = BADGE_COLORS.green;
  const white: [number, number, number] = [255, 255, 255];

  // Filled green circle
  drawFilledCircle(data, size, cx, cy, r, color, 255);

  // White checkmark
  const s = size / 24;
  const thickness = Math.max(2, 2.5 * s);
  // Short stroke: from bottom-left to bottom-center
  drawLineSegment(data, size, 7 * s, 12.5 * s, 10.5 * s, 16 * s, thickness, white, 255);
  // Long stroke: from bottom-center to top-right
  drawLineSegment(data, size, 10.5 * s, 16 * s, 17.5 * s, 8.5 * s, thickness, white, 255);

  return new ImageData(data, size, size);
}

function generateYellowWarningIcon(size: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const color: [number, number, number] = BADGE_COLORS.yellow;
  const black: [number, number, number] = [0, 0, 0];
  const s = size / 24;

  // Filled yellow triangle
  const topX = 12 * s;
  const topY = 2.5 * s;
  const blX = 1.5 * s;
  const blY = 21.5 * s;
  const brX = 22.5 * s;
  const brY = 21.5 * s;
  drawFilledTriangle(data, size, topX, topY, blX, blY, brX, brY, color, 255);

  // Black exclamation mark - vertical bar
  const exThickness = Math.max(2, 2.2 * s);
  drawLineSegment(data, size, 12 * s, 8.5 * s, 12 * s, 15.5 * s, exThickness, black, 255);
  // Black exclamation mark - dot
  drawFilledCircle(data, size, 12 * s, 18.5 * s, Math.max(1.2, 1.4 * s), black, 255);

  return new ImageData(data, size, size);
}

function generateRedStopIcon(size: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const color: [number, number, number] = BADGE_COLORS.red;
  const white: [number, number, number] = [255, 255, 255];
  const s = size / 24;

  // Filled red octagon
  const cx = 12 * s;
  const cy = 12 * s;
  const r = 10.5 * s;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      const dy = Math.abs(y + 0.5 - cy);
      // Octagon: max(dx, dy, (dx+dy)/sqrt(2)) <= r
      const octDist = Math.max(dx, dy, (dx + dy) * 0.7071);
      if (octDist <= r) {
        const edge = r - octDist;
        const a = edge < 1 ? edge : 1;
        blendPixel(data, size, x, y, color, a);
      }
    }
  }

  // White horizontal bar
  const barThickness = Math.max(2, 2.5 * s);
  drawLineSegment(data, size, 7 * s, 12 * s, 17 * s, 12 * s, barThickness, white, 255);

  return new ImageData(data, size, size);
}

function drawFilledTriangle(
  data: Uint8ClampedArray, size: number,
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  color: [number, number, number], alpha: number,
): void {
  // Bounding box
  const minX = Math.max(0, Math.floor(Math.min(x1, x2, x3)));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2, x3)));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2, y3)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Barycentric coordinates
      const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
      const a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / d;
      const b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / d;
      const c = 1 - a - b;
      if (a >= -0.01 && b >= -0.01 && c >= -0.01) {
        blendPixel(data, size, x, y, color, alpha / 255);
      }
    }
  }
}

function generateSymbolIcon(size: number, riskLevel: RiskLevel): ImageData {
  switch (riskLevel) {
    case 'green': return generateGreenTickIcon(size);
    case 'yellow': return generateYellowWarningIcon(size);
    case 'red': return generateRedStopIcon(size);
  }
}

const PRIMARY_COLOR: [number, number, number] = [99, 102, 241]; // --primary #6366f1

function generateSpinnerFrame(size: number, angle: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const thickness = Math.max(2, size * 0.14);

  // Draw a partial arc (~270 degrees) starting from `angle`
  const arcLength = Math.PI * 1.5;
  const steps = Math.ceil(r * arcLength * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = angle + t * arcLength;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    // Fade the tail end
    const alpha = t < 0.15 ? t / 0.15 : 1;
    drawFilledCircle(data, size, px, py, thickness / 2, PRIMARY_COLOR, Math.round(alpha * 255));
  }

  return new ImageData(data, size, size);
}

// Track animation intervals per tab so we can stop them
const loadingAnimations = new Map<number, ReturnType<typeof setInterval>>();

function stopLoadingAnimation(tabId: number): void {
  const existing = loadingAnimations.get(tabId);
  if (existing) {
    clearInterval(existing);
    loadingAnimations.delete(tabId);
  }
}

// Clean up animations when tabs are closed
browser.tabs.onRemoved.addListener((tabId) => {
  stopLoadingAnimation(tabId);
});

// Safe wrapper for browser.action calls — silently handles closed tabs
async function safeSetIcon(imageData: Record<string, ImageData>, tabId: number): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await browser.action.setIcon({ imageData: imageData as any, tabId });
    await browser.action.setBadgeText({ text: '', tabId });
    return true;
  } catch {
    return false;
  }
}

export async function setBadgeScore(tabId: number, score: number, riskLevel: RiskLevel, mode: IconDisplayMode = 'numbers'): Promise<void> {
  stopLoadingAnimation(tabId);
  const color = BADGE_COLORS[riskLevel];
  const imageData: Record<string, ImageData> = {};
  for (const size of [16, 32, 48]) {
    imageData[String(size)] = mode === 'symbols'
      ? generateSymbolIcon(size, riskLevel)
      : generateScoreIcon(size, score, color);
  }
  await safeSetIcon(imageData, tabId);
}

export async function setBadgeLoading(tabId: number): Promise<void> {
  stopLoadingAnimation(tabId);

  let frame = 0;
  const totalFrames = 12;

  async function renderFrame() {
    const angle = (frame / totalFrames) * Math.PI * 2 - Math.PI / 2;
    const imageData: Record<string, ImageData> = {};
    for (const size of [16, 32, 48]) {
      imageData[String(size)] = generateSpinnerFrame(size, angle);
    }
    const ok = await safeSetIcon(imageData, tabId);
    if (!ok) {
      stopLoadingAnimation(tabId);
      return;
    }
    frame = (frame + 1) % totalFrames;
  }

  // Show first frame immediately, then animate
  await renderFrame();
  const interval = setInterval(renderFrame, 120);
  loadingAnimations.set(tabId, interval);
}

export async function clearBadge(tabId: number): Promise<void> {
  stopLoadingAnimation(tabId);
  const imageData: Record<string, ImageData> = {};
  for (const size of [16, 32, 48]) {
    imageData[String(size)] = generateGrayIcon(size);
  }
  await safeSetIcon(imageData, tabId);
}

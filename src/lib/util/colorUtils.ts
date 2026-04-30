export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ContrastResult {
  ratio: number;
  level: 'AA' | 'AAA' | 'fail';
  isAccessible: boolean;
}

const hexToRgb = (hex: string): RGB | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!result) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
};

const rgbToHex = (rgb: RGB): string => {
  return '#' + [rgb.r, rgb.g, rgb.b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

const rgbToHsl = (rgb: RGB): HSL => {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

const hslToRgb = (hsl: HSL): RGB => {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

const getRelativeLuminance = (rgb: RGB): number => {
  const sRGB = {
    r: rgb.r / 255,
    g: rgb.g / 255,
    b: rgb.b / 255
  };

  const toLinear = (value: number) => {
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(sRGB.r) + 0.7152 * toLinear(sRGB.g) + 0.0722 * toLinear(sRGB.b);
};

const calculateContrastRatio = (color1: string, color2: string): number | null => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return null;

  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
};

const checkContrast = (foreground: string, background: string, size: 'normal' | 'large' = 'normal'): ContrastResult => {
  const ratio = calculateContrastRatio(foreground, background);
  if (ratio === null) {
    return { ratio: 0, level: 'fail', isAccessible: false };
  }

  const isAA = size === 'large' ? ratio >= 3 : ratio >= 4.5;
  const isAAA = size === 'large' ? ratio >= 4.5 : ratio >= 7;

  let level: 'AA' | 'AAA' | 'fail' = 'fail';
  if (isAAA) {
    level = 'AAA';
  } else if (isAA) {
    level = 'AA';
  }

  return {
    ratio: Math.round(ratio * 100) / 100,
    level,
    isAccessible: isAA
  };
};

const lightenColor = (hex: string, amount: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const hsl = rgbToHsl(rgb);
  hsl.l = Math.min(100, hsl.l + amount);

  return rgbToHex(hslToRgb(hsl));
};

const darkenColor = (hex: string, amount: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, hsl.l - amount);

  return rgbToHex(hslToRgb(hsl));
};

const saturateColor = (hex: string, amount: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const hsl = rgbToHsl(rgb);
  hsl.s = Math.min(100, Math.max(0, hsl.s + amount));

  return rgbToHex(hslToRgb(hsl));
};

const adjustContrast = (foreground: string, background: string, targetRatio: number = 4.5): string => {
  const rgbFg = hexToRgb(foreground);
  const rgbBg = hexToRgb(background);

  if (!rgbFg || !rgbBg) return foreground;

  const hsl = rgbToHsl(rgbFg);
  const bgLuminance = getRelativeLuminance(rgbBg);

  let step = bgLuminance > 0.5 ? -2 : 2;
  let currentColor = foreground;
  let bestColor = foreground;
  let bestRatio = calculateContrastRatio(currentColor, background) || 0;

  for (let i = 0; i < 50; i++) {
    const ratio = calculateContrastRatio(currentColor, background) || 0;

    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestColor = currentColor;
    }

    if (ratio >= targetRatio) {
      return currentColor;
    }

    hsl.l = Math.min(100, Math.max(0, hsl.l + step));
    currentColor = rgbToHex(hslToRgb(hsl));
  }

  return bestColor;
};

const KMEANS_SEED = 42;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const extractColorsFromImage = async (
  imageUrl: string,
  numColors: number = 5
): Promise<string[] | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(null);
        return;
      }

      const maxSize = 100;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels: RGB[] = [];

      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];

        if (a > 128) {
          pixels.push({ r, g, b });
        }
      }

      if (pixels.length === 0) {
        resolve(null);
        return;
      }

      const colors = kMeans(pixels, Math.min(numColors, pixels.length), KMEANS_SEED);
      resolve(colors.map((c) => rgbToHex(c)));
    };

    img.onerror = () => {
      resolve(null);
    };

    img.src = imageUrl;
  });
};

const kMeans = (pixels: RGB[], k: number, seed: number): RGB[] => {
  if (k <= 0 || pixels.length === 0) return [];
  if (k >= pixels.length) return pixels;

  const random = seededRandom(seed);

  const uniquePixels = new Map<string, RGB>();
  for (const p of pixels) {
    const key = `${p.r},${p.g},${p.b}`;
    uniquePixels.set(key, p);
  }
  const uniqueArray = Array.from(uniquePixels.values());

  let centroids: RGB[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < Math.min(k, uniqueArray.length); i++) {
    let idx: number;
    do {
      idx = Math.floor(random() * uniqueArray.length);
    } while (usedIndices.has(idx) && usedIndices.size < uniqueArray.length);
    usedIndices.add(idx);
    centroids.push({ ...uniqueArray[idx] });
  }

  for (let iteration = 0; iteration < 20; iteration++) {
    const clusters: RGB[][] = Array.from({ length: k }, () => []);

    for (const pixel of uniqueArray) {
      let minDist = Infinity;
      let clusterIdx = 0;

      for (let i = 0; i < centroids.length; i++) {
        const dist = colorDistance(pixel, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          clusterIdx = i;
        }
      }

      clusters[clusterIdx].push(pixel);
    }

    const newCentroids: RGB[] = [];
    let converged = true;

    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) {
        newCentroids.push(centroids[i]);
        continue;
      }

      const sum = { r: 0, g: 0, b: 0 };
      for (const p of clusters[i]) {
        sum.r += p.r;
        sum.g += p.g;
        sum.b += p.b;
      }

      const newCentroid: RGB = {
        r: Math.round(sum.r / clusters[i].length),
        g: Math.round(sum.g / clusters[i].length),
        b: Math.round(sum.b / clusters[i].length)
      };

      newCentroids.push(newCentroid);

      if (
        newCentroid.r !== centroids[i].r ||
        newCentroid.g !== centroids[i].g ||
        newCentroid.b !== centroids[i].b
      ) {
        converged = false;
      }
    }

    centroids = newCentroids;

    if (converged) break;
  }

  return centroids.filter((c) => c.r >= 0 && c.g >= 0 && c.b >= 0);
};

const colorDistance = (c1: RGB, c2: RGB): number => {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const isValidHex = (hex: string): boolean => {
  return /^#?([a-f\d]{6}|[a-f\d]{3})$/i.test(hex.trim());
};

const normalizeHex = (hex: string): string => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  return '#' + h.toLowerCase();
};

const generateComplementaryPalette = (baseColor: string): string[] => {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return [baseColor];

  const hsl = rgbToHsl(rgb);
  const palette: string[] = [baseColor];

  palette.push(rgbToHex(hslToRgb({ h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l })));
  palette.push(rgbToHex(hslToRgb({ h: (hsl.h + 30) % 360, s: hsl.s, l: Math.min(95, hsl.l + 20) })));
  palette.push(rgbToHex(hslToRgb({ h: (hsl.h + 120) % 360, s: Math.max(20, hsl.s - 20), l: hsl.l })));
  palette.push(rgbToHex(hslToRgb({ h: (hsl.h + 240) % 360, s: hsl.s, l: Math.max(10, hsl.l - 20) })));

  return palette;
};

export {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  getRelativeLuminance,
  calculateContrastRatio,
  checkContrast,
  lightenColor,
  darkenColor,
  saturateColor,
  adjustContrast,
  extractColorsFromImage,
  kMeans,
  isValidHex,
  normalizeHex,
  generateComplementaryPalette
};

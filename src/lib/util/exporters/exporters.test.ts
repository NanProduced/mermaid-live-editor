import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { State } from '$/types';
import type { ProgressCallback } from './types';
import { PNGExporter } from './exporters/png';
import { PNGWatermarkExporter } from './exporters/png-watermark';
import { PDFExporter } from './exporters/pdf';
import { calculateHash } from './utils';

const mockState: State = {
  code: `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]`,
  grid: true,
  mermaid: `{
    "theme": "default"
  }`,
  panZoom: true,
  rough: false,
  updateDiagram: true
};

const mockSVGElement = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect x="0" y="0" width="400" height="300" fill="white"/>
  <rect x="50" y="50" width="80" height="40" fill="#4F46E5" rx="5"/>
  <text x="90" y="75" text-anchor="middle" fill="white" font-size="12">Start</text>
</svg>`;

interface MockCanvas {
  toDataURL: () => string;
  toBlob: (callback: (blob: Blob | null) => void) => void;
  getContext: () => MockContext | null;
  width: number;
  height: number;
}

interface MockContext {
  fillStyle: string;
  drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  measureText: (text: string) => { width: number };
  save: () => void;
  restore: () => void;
  font: string;
  globalAlpha: number;
  fillText: (text: string, x: number, y: number) => void;
}

const createMockCanvas = (width: number, height: number): MockCanvas => {
  const calls: string[] = [];
  const context: MockContext = {
    drawImage: (img, x, y, w, h) => {
      calls.push(`drawImage(${x}, ${y}, ${w}, ${h})`);
    },
    fillRect: (x, y, w, h) => {
      calls.push(`fillRect(${x}, ${y}, ${w}, ${h})`);
    },
    fillStyle: 'white',
    fillText: (text, x, y) => {
      calls.push(`fillText("${text}", ${x}, ${y})`);
    },
    font: '16px Arial',
    globalAlpha: 1.0,
    measureText: (text) => ({ width: text.length * 10 }),
    restore: () => calls.push('restore()'),
    save: () => calls.push('save()')
  };

  return {
    getContext: () => context,
    height,
    toBlob: (callback) => {
      const data = `mock-png-blob-${width}-${height}`;
      callback(new Blob([data], { type: 'image/png' }));
    },
    toDataURL: () =>
      `data:image/png;base64,${btoa(`mock-png-${width}-${height}-${calls.join(';')}`)}`,
    width
  };
};

describe('Exporter Interface Tests', () => {
  let originalCreateElement: typeof document.createElement;
  let originalQuerySelector: typeof document.querySelector;
  let mockCanvas: MockCanvas;
  let mockSvgs: HTMLElement[] = [];

  beforeEach(() => {
    originalCreateElement = document.createElement;
    originalQuerySelector = document.querySelector;

    mockCanvas = createMockCanvas(400, 300);

    mockSvgs = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(mockSVGElement, 'image/svg+xml');
    mockSvgs.push(doc.documentElement as unknown as HTMLElement);

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return originalCreateElement.call(document, tagName);
    });

    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (selector === '#container svg' || selector.includes('svg')) {
        return mockSvgs[0] || null;
      }
      return originalQuerySelector.call(document, selector);
    });

    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          getPropertyValue: (prop: string) => {
            if (prop === '--background') return '#ffffff';
            return '';
          }
        }) as CSSStyleDeclaration
    );

    Object.defineProperty(window, 'Image', {
      value: class MockImage {
        src = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 0;
        height = 0;

        constructor() {
          setTimeout(() => {
            this.width = 400;
            this.height = 300;
            if (this.onload) this.onload();
          }, 0);
        }
      },
      writable: true
    });

    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: (blob: Blob) => `blob:mock-${blob.size}`,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
        revokeObjectURL: (_url: string) => {}
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Exporter Base Interface', () => {
    it('should have correct id and name properties', () => {
      const pngExporter = new PNGExporter();
      const pdfExporter = new PDFExporter();
      const watermarkExporter = new PNGWatermarkExporter();

      expect(pngExporter.id).toBe('png');
      expect(pngExporter.name).toBe('PNG');

      expect(pdfExporter.id).toBe('pdf');
      expect(pdfExporter.name).toBe('PDF');

      expect(watermarkExporter.id).toBe('png-watermark');
      expect(watermarkExporter.name).toBe('PNG with Watermark');
    });

    it('should support all states', () => {
      const exporters = [new PNGExporter(), new PDFExporter(), new PNGWatermarkExporter()];

      for (const exporter of exporters) {
        expect(exporter.supports(mockState)).toBe(true);
      }
    });

    it('should provide default options', () => {
      const pngExporter = new PNGExporter();
      const pdfExporter = new PDFExporter();
      const watermarkExporter = new PNGWatermarkExporter();

      const pngOptions = pngExporter.getDefaultOptions();
      const pdfOptions = pdfExporter.getDefaultOptions();
      const watermarkOptions = watermarkExporter.getDefaultOptions();

      expect(pngOptions.mode).toBe('auto');
      expect(pngOptions.scale).toBe(2);

      expect(pdfOptions.pageSize).toBe('a4');
      expect(pdfOptions.orientation).toBe('portrait');
      expect(pdfOptions.multiPage).toBe(false);

      expect(watermarkOptions.watermarkType).toBe('text');
      expect(watermarkOptions.text).toBe('Mermaid');
    });

    it('should provide JSON schema for options', () => {
      const pngExporter = new PNGExporter();
      const pdfExporter = new PDFExporter();
      const watermarkExporter = new PNGWatermarkExporter();

      const pngSchema = pngExporter.getOptionsSchema();
      const pdfSchema = pdfExporter.getOptionsSchema();
      const watermarkSchema = watermarkExporter.getOptionsSchema();

      expect(pngSchema.type).toBe('object');
      expect(pngSchema.properties?.mode).toBeDefined();

      expect(pdfSchema.type).toBe('object');
      expect(pdfSchema.properties?.pageSize).toBeDefined();

      expect(watermarkSchema.type).toBe('object');
      expect(watermarkSchema.properties?.watermarkType).toBeDefined();
    });
  });

  describe('PNG Exporter', () => {
    it('should report progress during export', async () => {
      const exporter = new PNGExporter();
      const progressValues: { progress: number; message?: string }[] = [];

      const onProgress: ProgressCallback = (progress, message) => {
        progressValues.push({ progress, message });
      };

      try {
        await exporter.run(mockState, undefined, onProgress);
      } catch {
        // Expected: export may fail in mock environment, but we still check progress was reported
      }

      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[0].progress).toBeGreaterThanOrEqual(0);
      expect(progressValues[progressValues.length - 1].progress).toBeLessThanOrEqual(1);
    });
  });

  describe('PDF Exporter', () => {
    it('should have correct options schema with enum values', () => {
      const exporter = new PDFExporter();
      const schema = exporter.getOptionsSchema();

      expect(schema.properties?.pageSize?.enum).toEqual(['a4', 'a3', 'letter', 'legal', 'tabloid']);
      expect(schema.properties?.orientation?.enum).toEqual(['portrait', 'landscape']);
    });

    it('should default to single page mode', () => {
      const exporter = new PDFExporter();
      const options = exporter.getDefaultOptions();
      expect(options.multiPage).toBe(false);
    });
  });

  describe('PNG Watermark Exporter', () => {
    it('should extend PNG options with watermark properties', () => {
      const exporter = new PNGWatermarkExporter();
      const schema = exporter.getOptionsSchema();

      expect(schema.properties?.watermarkType).toBeDefined();
      expect(schema.properties?.text).toBeDefined();
      expect(schema.properties?.imageUrl).toBeDefined();
    });

    it('should support multiple watermark types', () => {
      const exporter = new PNGWatermarkExporter();
      const schema = exporter.getOptionsSchema();

      expect(schema.properties?.watermarkType?.enum).toEqual(['text', 'image', 'both']);
    });

    it('should have reasonable watermark defaults', () => {
      const exporter = new PNGWatermarkExporter();
      const options = exporter.getDefaultOptions();

      expect(options.textOpacity).toBeGreaterThan(0);
      expect(options.textOpacity).toBeLessThanOrEqual(1);
      expect(options.textPosition).toBe('bottom-right');
    });
  });

  describe('Hash Stability', () => {
    it('should generate consistent hash from calculateHash', async () => {
      const testData = 'test data for hashing';
      const hash1 = await calculateHash(testData);
      const hash2 = await calculateHash(testData);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('should generate different hashes for different data', async () => {
      const data1 = 'first data';
      const data2 = 'second data';

      const hash1 = await calculateHash(data1);
      const hash2 = await calculateHash(data2);

      expect(hash1).not.toBe(hash2);
    });
  });
});

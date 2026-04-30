import type { State } from '$/types';
import type {
  Exporter,
  GIFExporterOptions,
  ProgressCallback,
  ExporterResult,
  JSONSchema
} from '../types';
import { getBase64SVG, getFileName } from '../utils';
import { waitForRender } from '$lib/util/autoSync';
import { inputStateStore } from '$lib/util/state';
import { get } from 'svelte/store';
import GIF from 'gif.js';

export class GIFExporter implements Exporter<GIFExporterOptions> {
  id = 'gif';
  name = 'GIF';
  icon = 'animation';
  description = 'Export diagrams as animated GIF';

  supports(): boolean {
    return true;
  }

  getDefaultOptions(): GIFExporterOptions {
    return {
      mode: 'auto',
      scale: 2,
      width: 1080,
      height: undefined,
      frameDelay: 1000,
      maxFrames: 30,
      loop: true,
      quality: 10
    };
  }

  getOptionsSchema(): JSONSchema {
    return {
      type: 'object',
      title: 'GIF Export Options',
      properties: {
        mode: {
          type: 'string',
          title: 'Size Mode',
          enum: ['auto', 'width', 'height'],
          default: 'auto'
        },
        width: {
          default: 1080,
          maximum: 10000,
          minimum: 3,
          title: 'Width',
          type: 'number'
        },
        height: {
          default: 1080,
          maximum: 10000,
          minimum: 3,
          title: 'Height',
          type: 'number'
        },
        scale: {
          default: 2,
          maximum: 5,
          minimum: 1,
          title: 'Scale',
          type: 'number'
        },
        frameDelay: {
          default: 1000,
          maximum: 10000,
          minimum: 100,
          title: 'Frame Delay (ms)',
          description: 'Delay between frames in milliseconds',
          type: 'number'
        },
        maxFrames: {
          default: 30,
          maximum: 100,
          minimum: 1,
          title: 'Maximum Frames',
          description: 'Maximum number of frames to include in GIF',
          type: 'number'
        },
        loop: {
          type: 'boolean',
          title: 'Loop Animation',
          description: 'Make the GIF loop continuously',
          default: true
        },
        quality: {
          default: 10,
          maximum: 20,
          minimum: 1,
          title: 'Quality',
          description: 'Lower values = better quality but larger file',
          type: 'number'
        }
      },
      required: ['mode', 'scale', 'frameDelay', 'maxFrames', 'loop', 'quality']
    };
  }

  private getSvgDimensions(svg: HTMLElement): { width: number; height: number } {
    const svgEl = svg as unknown as SVGSVGElement;
    const viewBox = svgEl.viewBox?.baseVal;

    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
      return { width: viewBox.width, height: viewBox.height };
    }

    const widthAttr = svg.getAttribute('width');
    const heightAttr = svg.getAttribute('height');

    if (widthAttr && heightAttr) {
      const width = parseFloat(widthAttr.replace('px', ''));
      const height = parseFloat(heightAttr.replace('px', ''));
      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
        return { width, height };
      }
    }

    const box = svg.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      return { width: box.width, height: box.height };
    }

    return { width: 800, height: 600 };
  }

  private calculateCanvasDimensions(
    svgDimensions: { width: number; height: number },
    options: GIFExporterOptions
  ): { width: number; height: number } {
    const opt = options;
    const { width: contentWidth, height: contentHeight } = svgDimensions;

    let canvasWidth: number;
    let canvasHeight: number;

    if (opt.mode === 'width' && opt.width) {
      const ratio = contentHeight / contentWidth;
      canvasWidth = opt.width;
      canvasHeight = opt.width * ratio;
    } else if (opt.mode === 'height' && opt.height) {
      const ratio = contentWidth / contentHeight;
      canvasWidth = opt.height * ratio;
      canvasHeight = opt.height;
    } else {
      canvasWidth = contentWidth * opt.scale;
      canvasHeight = contentHeight * opt.scale;
    }

    return { width: Math.floor(Math.max(1, canvasWidth)), height: Math.floor(Math.max(1, canvasHeight)) };
  }

  private async renderSVGToCanvas(
    svg: HTMLElement,
    canvasWidth: number,
    canvasHeight: number,
    backgroundColor: string,
    rough: boolean
  ): Promise<HTMLCanvasElement> {
    if (canvasWidth <= 0 || canvasHeight <= 0) {
      throw new Error(`Invalid canvas dimensions: ${canvasWidth}x${canvasHeight}`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const base64Svg = getBase64SVG(svg, {
      width: canvasWidth,
      height: canvasHeight,
      rough,
      backgroundColor
    });

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      img.onerror = () => {
        reject(new Error('Failed to load SVG image'));
      };
      img.src = `data:image/svg+xml;base64,${base64Svg}`;
    });
  }

  async run(
    state: State,
    options?: GIFExporterOptions,
    onProgress?: ProgressCallback
  ): Promise<ExporterResult> {
    onProgress?.(0.1, 'Preparing export...');

    const opt = { ...this.getDefaultOptions(), ...options };

    const storeValue = get(inputStateStore);
    const originalPanZoom = storeValue.panZoom;
    const originalState = { ...storeValue };
    inputStateStore.update((s) => ({ ...s, panZoom: false }));

    try {
      onProgress?.(0.2, 'Waiting for render...');
      await new Promise((resolve) => setTimeout(resolve, 100));
      await waitForRender();

      const canvases: HTMLCanvasElement[] = [];
      let canvasDimensions: { width: number; height: number } | undefined;

      const backgroundColor = window
        .getComputedStyle(document.body)
        .getPropertyValue('--background');

      const entries: Array<{ state: State; rough: boolean }> = [];

      onProgress?.(0.3, 'Loading history entries...');

      try {
        const historyModule = await import('$lib/components/History/history');
        const historyEntries = get(historyModule.historyStore);

        if (historyEntries.length > 0) {
          const entriesToProcess = historyEntries.slice(0, opt.maxFrames);

          for (let i = 0; i < entriesToProcess.length; i++) {
            const entry = entriesToProcess[i];
            entries.push({
              state: entry.state,
              rough: entry.state.rough
            });
          }
        }
      } catch (error) {
        console.warn('Could not access history:', error);
      }

      if (entries.length === 0) {
        entries.push({
          state: state,
          rough: state.rough
        });
      }

      onProgress?.(0.4, `Rendering ${entries.length} frames...`);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const progress = 0.4 + (i / entries.length) * 0.4;
        onProgress?.(progress, `Rendering frame ${i + 1} of ${entries.length}...`);

        try {
          inputStateStore.set(entry.state);
          await waitForRender();
          await new Promise((resolve) => setTimeout(resolve, 100));

          const svg = document.querySelector<HTMLElement>('#container svg');
          if (!svg) {
            console.warn(`SVG not found for frame ${i}`);
            continue;
          }

          const svgDimensions = this.getSvgDimensions(svg);

          if (!canvasDimensions) {
            canvasDimensions = this.calculateCanvasDimensions(svgDimensions, opt);
          }

          const canvas = await this.renderSVGToCanvas(
            svg,
            canvasDimensions.width,
            canvasDimensions.height,
            backgroundColor,
            entry.rough
          );
          canvases.push(canvas);
        } catch (error) {
          console.warn(`Failed to render frame ${i}:`, error);
        }
      }

      inputStateStore.set(originalState);
      await waitForRender();

      if (canvases.length === 0) {
        throw new Error('No frames to export');
      }

      if (!canvasDimensions) {
        throw new Error('Could not determine canvas dimensions');
      }

      onProgress?.(0.85, 'Creating animated GIF...');

      const gif = new GIF({
        workers: 2,
        quality: opt.quality,
        width: canvasDimensions.width,
        height: canvasDimensions.height,
        repeat: opt.loop ? 0 : -1
      });

      for (let i = 0; i < canvases.length; i++) {
        const progress = 0.85 + (i / canvases.length) * 0.1;
        onProgress?.(progress, `Adding frame ${i + 1} of ${canvases.length}...`);

        gif.addFrame(canvases[i], {
          delay: opt.frameDelay,
          copy: true
        });
      }

      gif.on('progress', (progressValue: number) => {
        onProgress?.(0.95 + progressValue * 0.04, `Encoding GIF... ${Math.round(progressValue * 100)}%`);
      });

      return new Promise((resolve, reject) => {
        gif.on('finished', (blob: Blob) => {
          onProgress?.(1.0, 'Export complete!');
          resolve({
            blob,
            filename: getFileName('gif'),
            mimeType: 'image/gif'
          });
        });

        gif.on('error', (error: Error) => {
          reject(error);
        });

        gif.render();
      });
    } finally {
      inputStateStore.update((s) => ({ ...s, panZoom: originalPanZoom }));
    }
  }
}

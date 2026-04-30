import type { State } from '$/types';
import type {
  Exporter,
  PNGExporterOptions,
  ProgressCallback,
  ExporterResult,
  JSONSchema
} from '../types';
import { getBase64SVG, getFileName, dataUrlToBlob } from '../utils';
import { waitForRender } from '$lib/util/autoSync';
import { inputStateStore } from '$lib/util/state';
import { get } from 'svelte/store';

export class PNGExporter implements Exporter<PNGExporterOptions> {
  id = 'png';
  name = 'PNG';
  icon = 'image';
  description = 'Export diagram as PNG image';

  supports(): boolean {
    return true;
  }

  getDefaultOptions(): PNGExporterOptions {
    return {
      mode: 'auto',
      scale: 2,
      width: 1080,
      height: undefined
    };
  }

  getOptionsSchema(): JSONSchema {
    return {
      type: 'object',
      title: 'PNG Export Options',
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
        }
      },
      required: ['mode', 'scale']
    };
  }

  async run(
    state: State,
    options?: PNGExporterOptions,
    onProgress?: ProgressCallback
  ): Promise<ExporterResult> {
    onProgress?.(0.1, 'Preparing export...');

    const opt = { ...this.getDefaultOptions(), ...options };

    const storeValue = get(inputStateStore);
    const originalPanZoom = storeValue.panZoom;
    inputStateStore.update((s) => ({ ...s, panZoom: false }));

    try {
      onProgress?.(0.2, 'Waiting for render...');
      await new Promise((resolve) => setTimeout(resolve, 100));
      await waitForRender();

      onProgress?.(0.4, 'Getting SVG element...');
      const svg = document.querySelector<HTMLElement>('#container svg');
      if (!svg) {
        throw new Error('SVG element not found');
      }

      const box = svg.getBoundingClientRect();
      const svgEl = svg as unknown as SVGSVGElement;
      const viewBox = svgEl.viewBox?.baseVal;
      const contentWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
      const contentHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;

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

      onProgress?.(0.6, 'Creating canvas...');
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context not available');
      }

      const backgroundColor = window
        .getComputedStyle(document.body)
        .getPropertyValue('--background');
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);

      onProgress?.(0.8, 'Rendering SVG to canvas...');
      const base64Svg = getBase64SVG(svg, {
        width: canvasWidth,
        height: canvasHeight,
        rough: state.rough,
        backgroundColor
      });

      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          const blob = dataUrlToBlob(dataUrl);

          onProgress?.(1.0, 'Export complete!');

          resolve({
            blob,
            filename: getFileName('png'),
            mimeType: 'image/png'
          });
        };
        image.onerror = () => {
          reject(new Error('Failed to load SVG image'));
        };
        image.src = `data:image/svg+xml;base64,${base64Svg}`;
      });
    } finally {
      inputStateStore.update((s) => ({ ...s, panZoom: originalPanZoom }));
    }
  }
}

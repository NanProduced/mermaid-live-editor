import type { State } from '$/types';
import type {
  Exporter,
  PDFExporterOptions,
  ProgressCallback,
  ExporterResult,
  JSONSchema,
  PageSize
} from '../types';
import { getBase64SVG, getFileName } from '../utils';
import { waitForRender } from '$lib/util/autoSync';
import { inputStateStore } from '$lib/util/state';
import { get } from 'svelte/store';
import { jsPDF } from 'jspdf';
import { getPageSizeInPixels } from '../types';

export class PDFExporter implements Exporter<PDFExporterOptions> {
  id = 'pdf';
  name = 'PDF';
  icon = 'picture-as-pdf';
  description = 'Export diagram as PDF document';

  supports(): boolean {
    return true;
  }

  getDefaultOptions(): PDFExporterOptions {
    return {
      pageSize: 'a4',
      orientation: 'portrait',
      multiPage: false,
      scale: 1.0
    };
  }

  getOptionsSchema(): JSONSchema {
    return {
      type: 'object',
      title: 'PDF Export Options',
      properties: {
        pageSize: {
          type: 'string',
          title: 'Page Size',
          enum: ['a4', 'a3', 'letter', 'legal', 'tabloid'],
          default: 'a4'
        },
        orientation: {
          type: 'string',
          title: 'Orientation',
          enum: ['portrait', 'landscape'],
          default: 'portrait'
        },
        multiPage: {
          type: 'boolean',
          title: 'Multi-Page',
          description: 'Export multiple diagrams from history as separate pages',
          default: false
        },
        scale: {
          default: 1.0,
          maximum: 3.0,
          minimum: 0.5,
          title: 'Scale',
          type: 'number'
        }
      },
      required: ['pageSize', 'orientation', 'multiPage', 'scale']
    };
  }

  private async renderSVGToCanvas(
    svg: HTMLElement,
    width: number,
    height: number,
    options: { scale?: number; backgroundColor?: string } = {}
  ): Promise<HTMLCanvasElement> {
    const { scale = 1, backgroundColor } = options;

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const base64Svg = getBase64SVG(svg, {
      width: width * scale,
      height: height * scale,
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

  private async addSVGPageToPDF(
    doc: jsPDF,
    svg: HTMLElement,
    options: PDFExporterOptions
  ): Promise<void> {
    const { pageSize, orientation, scale } = options;

    const pagePixels = getPageSizeInPixels(pageSize as PageSize, orientation, 72);

    const svgBox = svg.getBoundingClientRect();
    const svgEl = svg as unknown as SVGSVGElement;
    const viewBox = svgEl.viewBox?.baseVal;
    const svgWidth = viewBox && viewBox.width > 0 ? viewBox.width : svgBox.width;
    const svgHeight = viewBox && viewBox.height > 0 ? viewBox.height : svgBox.height;

    const svgAspectRatio = svgWidth / svgHeight;
    const pageAspectRatio = pagePixels.width / pagePixels.height;

    let renderWidth: number;
    let renderHeight: number;

    if (svgAspectRatio > pageAspectRatio) {
      renderWidth = pagePixels.width * 0.9 * scale;
      renderHeight = renderWidth / svgAspectRatio;
    } else {
      renderHeight = pagePixels.height * 0.9 * scale;
      renderWidth = renderHeight * svgAspectRatio;
    }

    const x = (pagePixels.width - renderWidth) / 2;
    const y = (pagePixels.height - renderHeight) / 2;

    const backgroundColor = window.getComputedStyle(document.body).getPropertyValue('--background');

    const canvas = await this.renderSVGToCanvas(svg, svgWidth, svgHeight, {
      scale: 2,
      backgroundColor
    });

    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight);
  }

  private async renderStateToSVG(state: State): Promise<HTMLElement> {
    inputStateStore.set(state);
    await waitForRender();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const svg = document.querySelector<HTMLElement>('#container svg');
    if (!svg) {
      throw new Error('SVG not found after rendering state');
    }

    return svg.cloneNode(true) as HTMLElement;
  }

  async run(
    state: State,
    options?: PDFExporterOptions,
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

      const pageSizeInPt = getPageSizeInPixels(opt.pageSize as PageSize, opt.orientation, 72);

      onProgress?.(0.3, 'Creating PDF document...');
      const doc = new jsPDF({
        orientation: opt.orientation,
        unit: 'pt',
        format: [pageSizeInPt.width, pageSizeInPt.height]
      });

      const svgs: HTMLElement[] = [];

      if (opt.multiPage) {
        onProgress?.(0.4, 'Loading history entries...');

        try {
          const historyModule = await import('$lib/components/History/history');
          const historyEntries = get(historyModule.historyStore);

          if (historyEntries.length > 0) {
            onProgress?.(0.5, `Rendering ${historyEntries.length} history diagrams...`);

            for (let i = 0; i < historyEntries.length; i++) {
              const entry = historyEntries[i];
              const progress = 0.5 + (i / historyEntries.length) * 0.3;
              onProgress?.(progress, `Rendering diagram ${i + 1} of ${historyEntries.length}...`);

              try {
                const svg = await this.renderStateToSVG(entry.state);
                svgs.push(svg);
              } catch (error) {
                console.warn(`Failed to render history entry ${i}:`, error);
              }
            }
          }
        } catch (error) {
          console.warn('Could not access history:', error);
        }

        if (svgs.length === 0) {
          const currentSvg = document.querySelector<HTMLElement>('#container svg');
          if (currentSvg) {
            svgs.push(currentSvg.cloneNode(true) as HTMLElement);
          }
        }
      } else {
        const currentSvg = document.querySelector<HTMLElement>('#container svg');
        if (currentSvg) {
          svgs.push(currentSvg);
        }
      }

      inputStateStore.set(originalState);
      await waitForRender();

      if (svgs.length === 0) {
        throw new Error('No SVG found to export');
      }

      for (let i = 0; i < svgs.length; i++) {
        const progress = 0.8 + (i / svgs.length) * 0.15;
        onProgress?.(progress, `Processing page ${i + 1} of ${svgs.length}...`);

        if (i > 0) {
          doc.addPage();
        }

        await this.addSVGPageToPDF(doc, svgs[i], opt);
      }

      onProgress?.(0.95, 'Finalizing PDF...');
      const pdfOutput = doc.output('arraybuffer');
      const blob = new Blob([pdfOutput], { type: 'application/pdf' });

      onProgress?.(1.0, 'Export complete!');

      return {
        blob,
        filename: getFileName('pdf'),
        mimeType: 'application/pdf'
      };
    } finally {
      inputStateStore.update((s) => ({ ...s, panZoom: originalPanZoom }));
    }
  }
}

import type { State } from '$/types';
import type {
  Exporter,
  PPTXExporterOptions,
  ProgressCallback,
  ExporterResult,
  JSONSchema,
  PageSize
} from '../types';
import { getBase64SVG, getFileName } from '../utils';
import { waitForRender } from '$lib/util/autoSync';
import { inputStateStore } from '$lib/util/state';
import { get } from 'svelte/store';
import PptxGenJS from 'pptxgenjs';
import { getPageSizeInPixels } from '../types';

export class PPTXExporter implements Exporter<PPTXExporterOptions> {
  id = 'pptx';
  name = 'PPTX';
  icon = 'slideshow';
  description = 'Export diagrams as PowerPoint presentation';

  supports(): boolean {
    return true;
  }

  getDefaultOptions(): PPTXExporterOptions {
    return {
      pageSize: 'a4',
      orientation: 'landscape',
      scale: 1.0,
      includeTitle: true,
      includeNotes: true
    };
  }

  getOptionsSchema(): JSONSchema {
    return {
      type: 'object',
      title: 'PPTX Export Options',
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
          default: 'landscape'
        },
        scale: {
          default: 1.0,
          maximum: 3.0,
          minimum: 0.5,
          title: 'Scale',
          type: 'number'
        },
        includeTitle: {
          type: 'boolean',
          title: 'Include Title',
          description: 'Include diagram name as slide title',
          default: true
        },
        includeNotes: {
          type: 'boolean',
          title: 'Include Notes',
          description: 'Include diagram code as slide notes',
          default: true
        }
      },
      required: ['pageSize', 'orientation', 'scale', 'includeTitle', 'includeNotes']
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

  private getPageSizeInInches(
    size: PageSize,
    orientation: 'portrait' | 'landscape'
  ): { width: number; height: number } {
    const mmToIn = (mm: number) => mm / 25.4;
    const page = {
      a3: { width: 297, height: 420 },
      a4: { width: 210, height: 297 },
      legal: { width: 215.9, height: 355.6 },
      letter: { width: 215.9, height: 279.4 },
      tabloid: { width: 279.4, height: 431.8 }
    }[size];

    if (orientation === 'landscape') {
      return {
        width: mmToIn(page.height),
        height: mmToIn(page.width)
      };
    }

    return {
      width: mmToIn(page.width),
      height: mmToIn(page.height)
    };
  }

  private async addSlideWithDiagram(
    pres: PptxGenJS,
    svg: HTMLElement,
    options: PPTXExporterOptions,
    title?: string,
    notes?: string
  ): Promise<void> {
    const { pageSize, orientation, scale, includeTitle, includeNotes } = options;

    const pageInInches = this.getPageSizeInInches(pageSize as PageSize, orientation);
    const pagePixels = getPageSizeInPixels(pageSize as PageSize, orientation, 72);

    const svgBox = svg.getBoundingClientRect();
    const svgEl = svg as unknown as SVGSVGElement;
    const viewBox = svgEl.viewBox?.baseVal;
    const svgWidth = viewBox && viewBox.width > 0 ? viewBox.width : svgBox.width;
    const svgHeight = viewBox && viewBox.height > 0 ? viewBox.height : svgBox.height;

    const svgAspectRatio = svgWidth / svgHeight;
    const pageAspectRatio = pagePixels.width / pagePixels.height;

    let diagramWidth: number;
    let diagramHeight: number;

    const titleHeight = includeTitle ? 0.8 : 0;
    const availableHeight = pageInInches.height - titleHeight - 0.5;
    const availableWidth = pageInInches.width - 0.5;

    if (svgAspectRatio > pageAspectRatio) {
      diagramWidth = availableWidth * scale;
      diagramHeight = diagramWidth / svgAspectRatio;
    } else {
      diagramHeight = availableHeight * scale;
      diagramWidth = diagramHeight * svgAspectRatio;
    }

    const x = (pageInInches.width - diagramWidth) / 2;
    const y = titleHeight + (availableHeight - diagramHeight) / 2;

    const backgroundColor = window.getComputedStyle(document.body).getPropertyValue('--background');

    const canvas = await this.renderSVGToCanvas(svg, svgWidth, svgHeight, {
      scale: 2,
      backgroundColor
    });

    const imgData = canvas.toDataURL('image/png');

    const slide = pres.addSlide();

    if (includeTitle && title) {
      slide.addText(title, {
        x: 0.5,
        y: 0.2,
        w: pageInInches.width - 1,
        h: 0.5,
        fontSize: 24,
        bold: true,
        align: 'center',
        valign: 'middle',
        color: '333333'
      });
    }

    slide.addImage({
      data: imgData,
      x,
      y,
      w: diagramWidth,
      h: diagramHeight
    });

    if (includeNotes && notes) {
      slide.addNotes(notes);
    }
  }

  async run(
    state: State,
    options?: PPTXExporterOptions,
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

      const pageInInches = this.getPageSizeInInches(opt.pageSize as PageSize, opt.orientation);

      onProgress?.(0.3, 'Creating PowerPoint presentation...');
      const pres = new PptxGenJS();
      pres.layout = {
        width: pageInInches.width,
        height: pageInInches.height
      };

      const entries: Array<{ svg: HTMLElement; title?: string; notes?: string }> = [];

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
              entries.push({
                svg,
                title: entry.name || `Diagram ${i + 1}`,
                notes: entry.state.code
              });
            } catch (error) {
              console.warn(`Failed to render history entry ${i}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn('Could not access history:', error);
      }

      if (entries.length === 0) {
        const currentSvg = document.querySelector<HTMLElement>('#container svg');
        if (currentSvg) {
          entries.push({
            svg: currentSvg.cloneNode(true) as HTMLElement,
            title: 'Current Diagram',
            notes: state.code
          });
        }
      }

      inputStateStore.set(originalState);
      await waitForRender();

      if (entries.length === 0) {
        throw new Error('No SVG found to export');
      }

      for (let i = 0; i < entries.length; i++) {
        const progress = 0.8 + (i / entries.length) * 0.15;
        onProgress?.(progress, `Processing slide ${i + 1} of ${entries.length}...`);

        const entry = entries[i];
        await this.addSlideWithDiagram(
          pres,
          entry.svg,
          opt,
          entry.title,
          entry.notes
        );
      }

      onProgress?.(0.95, 'Finalizing PowerPoint...');

      const blob = await pres.write({ outputType: 'blob' });

      onProgress?.(1.0, 'Export complete!');

      return {
        blob,
        filename: getFileName('pptx'),
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      };
    } finally {
      inputStateStore.update((s) => ({ ...s, panZoom: originalPanZoom }));
    }
  }
}

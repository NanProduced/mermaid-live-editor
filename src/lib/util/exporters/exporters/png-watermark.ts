import type { State } from '$/types';
import type {
  Exporter,
  PNGWatermarkExporterOptions,
  ProgressCallback,
  ExporterResult,
  JSONSchema
} from '../types';
import { getFileName, dataUrlToBlob, getWatermarkPosition } from '../utils';
import { PNGExporter } from './png';

export class PNGWatermarkExporter implements Exporter<PNGWatermarkExporterOptions> {
  id = 'png-watermark';
  name = 'PNG with Watermark';
  icon = 'watermark';
  description = 'Export diagram as PNG with custom watermark';

  private pngExporter = new PNGExporter();

  supports(): boolean {
    return true;
  }

  getDefaultOptions(): PNGWatermarkExporterOptions {
    return {
      ...this.pngExporter.getDefaultOptions(),
      imageOpacity: 0.3,
      imagePosition: 'bottom-right',
      imageScale: 0.5,
      imageUrl: '',
      text: 'Mermaid',
      textColor: '#000000',
      textOpacity: 0.3,
      textPosition: 'bottom-right',
      textSize: 48,
      watermarkType: 'text'
    };
  }

  getOptionsSchema(): JSONSchema {
    const baseSchema = this.pngExporter.getOptionsSchema();
    return {
      type: 'object',
      title: 'PNG Watermark Export Options',
      properties: {
        ...baseSchema.properties,
        imageOpacity: {
          default: 0.3,
          maximum: 1.0,
          minimum: 0.1,
          title: 'Image Opacity',
          type: 'number'
        },
        imagePosition: {
          type: 'string',
          title: 'Image Position',
          enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
          default: 'bottom-right'
        },
        imageScale: {
          default: 0.5,
          maximum: 2.0,
          minimum: 0.1,
          title: 'Image Scale',
          type: 'number'
        },
        imageUrl: {
          type: 'string',
          title: 'Watermark Image URL',
          format: 'uri',
          default: ''
        },
        text: {
          default: 'Mermaid',
          maxLength: 100,
          minLength: 1,
          title: 'Watermark Text',
          type: 'string'
        },
        textColor: {
          type: 'string',
          title: 'Text Color',
          format: 'color',
          default: '#000000'
        },
        textOpacity: {
          default: 0.3,
          maximum: 1.0,
          minimum: 0.1,
          title: 'Text Opacity',
          type: 'number'
        },
        textPosition: {
          type: 'string',
          title: 'Text Position',
          enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
          default: 'bottom-right'
        },
        textSize: {
          default: 48,
          maximum: 200,
          minimum: 10,
          title: 'Text Size',
          type: 'number'
        },
        watermarkType: {
          type: 'string',
          title: 'Watermark Type',
          enum: ['text', 'image', 'both'],
          default: 'text'
        }
      },
      required: ['watermarkType', ...(baseSchema.required || [])]
    };
  }

  private async addTextWatermark(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    options: PNGWatermarkExporterOptions
  ): Promise<void> {
    const { text, textColor, textSize, textOpacity, textPosition } = options;

    if (!text) return;

    ctx.save();
    ctx.globalAlpha = textOpacity || 0.3;
    ctx.font = `bold ${textSize}px Arial, sans-serif`;
    ctx.fillStyle = textColor || '#000000';

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = textSize || 48;

    const pos = getWatermarkPosition(
      textPosition || 'bottom-right',
      canvasWidth,
      canvasHeight,
      textWidth,
      textHeight
    );

    ctx.fillText(text, pos.x, pos.y + textHeight);
    ctx.restore();
  }

  private async addImageWatermark(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    options: PNGWatermarkExporterOptions
  ): Promise<void> {
    const { imageUrl, imageOpacity, imagePosition, imageScale } = options;

    if (!imageUrl) return;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        ctx.save();
        ctx.globalAlpha = imageOpacity || 0.3;

        const scale = imageScale || 0.5;
        const imgWidth = img.width * scale;
        const imgHeight = img.height * scale;

        const pos = getWatermarkPosition(
          imagePosition || 'bottom-right',
          canvasWidth,
          canvasHeight,
          imgWidth,
          imgHeight
        );

        ctx.drawImage(img, pos.x, pos.y, imgWidth, imgHeight);
        ctx.restore();
        resolve();
      };

      img.onerror = () => {
        reject(new Error('Failed to load watermark image'));
      };

      img.src = imageUrl;
    });
  }

  async run(
    state: State,
    options?: PNGWatermarkExporterOptions,
    onProgress?: ProgressCallback
  ): Promise<ExporterResult> {
    onProgress?.(0.1, 'Preparing export...');

    const opt = { ...this.getDefaultOptions(), ...options };

    onProgress?.(0.3, 'Generating base PNG...');
    const baseResult = await this.pngExporter.run(state, opt, (p) => {
      onProgress?.(0.3 + p * 0.3);
    });

    onProgress?.(0.6, 'Creating canvas for watermark...');
    const canvas = document.createElement('canvas');
    const offscreenCtx = canvas.getContext('2d');
    if (!offscreenCtx) {
      throw new Error('Canvas context not available');
    }

    const baseImage = await this.blobToImage(baseResult.blob);
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;

    offscreenCtx.drawImage(baseImage, 0, 0);

    onProgress?.(0.7, 'Applying watermark...');

    if (opt.watermarkType === 'text' || opt.watermarkType === 'both') {
      await this.addTextWatermark(offscreenCtx, canvas.width, canvas.height, opt);
    }

    if (opt.watermarkType === 'image' || opt.watermarkType === 'both') {
      try {
        await this.addImageWatermark(offscreenCtx, canvas.width, canvas.height, opt);
      } catch (error) {
        console.warn('Failed to add image watermark:', error);
      }
    }

    onProgress?.(0.9, 'Finalizing export...');
    const dataUrl = canvas.toDataURL('image/png');
    const blob = dataUrlToBlob(dataUrl);

    onProgress?.(1.0, 'Export complete!');

    return {
      blob,
      filename: getFileName('png'),
      mimeType: 'image/png'
    };
  }

  private async blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image from blob'));
      };

      img.src = url;
    });
  }
}

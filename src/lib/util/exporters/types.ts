import type { State } from '$/types';

export type ProgressCallback = (progress: number, message?: string) => void;

export interface ExporterResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export type ExporterOptions = Record<string, unknown>;

export interface Exporter<Options extends ExporterOptions = ExporterOptions> {
  id: string;
  name: string;
  icon?: string;
  description?: string;

  supports(state: State): boolean;
  getDefaultOptions?(): Options;
  getOptionsSchema?(): JSONSchema;
  run(state: State, options?: Options, onProgress?: ProgressCallback): Promise<ExporterResult>;
}

export interface JSONSchema {
  type: string;
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  enum?: string[] | number[];
  default?: unknown;
}

export interface JSONSchemaProperty extends JSONSchema {
  enum?: string[] | number[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

export interface PDFExporterOptions extends ExporterOptions {
  pageSize: 'a4' | 'a3' | 'letter' | 'legal' | 'tabloid';
  orientation: 'portrait' | 'landscape';
  multiPage: boolean;
  scale: number;
}

export interface PNGExporterOptions extends ExporterOptions {
  width?: number;
  height?: number;
  scale: number;
  mode: 'auto' | 'width' | 'height';
}

export interface PNGWatermarkExporterOptions extends PNGExporterOptions {
  watermarkType: 'text' | 'image' | 'both';
  text?: string;
  textColor?: string;
  textSize?: number;
  textOpacity?: number;
  textPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  imageUrl?: string;
  imageOpacity?: number;
  imagePosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  imageScale?: number;
}

export const PAGE_SIZES = {
  a3: { width: 297, height: 420 },
  a4: { width: 210, height: 297 },
  legal: { width: 215.9, height: 355.6 },
  letter: { width: 215.9, height: 279.4 },
  tabloid: { width: 279.4, height: 431.8 }
} as const;

export type PageSize = keyof typeof PAGE_SIZES;

export const getPageSizeInPixels = (
  size: PageSize,
  orientation: 'portrait' | 'landscape',
  dpi = 96
): { width: number; height: number } => {
  const mmToPx = (mm: number) => (mm / 25.4) * dpi;
  const page = PAGE_SIZES[size];

  if (orientation === 'landscape') {
    return {
      width: mmToPx(page.height),
      height: mmToPx(page.width)
    };
  }

  return {
    width: mmToPx(page.width),
    height: mmToPx(page.height)
  };
};

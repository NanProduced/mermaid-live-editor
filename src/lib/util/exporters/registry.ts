import type { State } from '$/types';
import type { Exporter, ExporterOptions, ProgressCallback, ExporterResult } from './types';
import { PNGExporter } from './exporters/png';
import { PNGWatermarkExporter } from './exporters/png-watermark';
import { PDFExporter } from './exporters/pdf';

export class ExporterRegistry {
  private exporters = new Map<string, Exporter>();

  register(exporter: Exporter): void {
    this.exporters.set(exporter.id, exporter);
  }

  unregister(id: string): boolean {
    return this.exporters.delete(id);
  }

  get(id: string): Exporter | undefined {
    return this.exporters.get(id);
  }

  getAll(): Exporter[] {
    return Array.from(this.exporters.values());
  }

  getSupported(state: State): Exporter[] {
    return this.getAll().filter((exporter) => exporter.supports(state));
  }

  async run(
    id: string,
    state: State,
    options?: ExporterOptions,
    onProgress?: ProgressCallback
  ): Promise<ExporterResult> {
    const exporter = this.get(id);
    if (!exporter) {
      throw new Error(`Exporter with id "${id}" not found`);
    }
    return exporter.run(state, options, onProgress);
  }
}

export const defaultRegistry = new ExporterRegistry();

defaultRegistry.register(new PNGExporter());
defaultRegistry.register(new PNGWatermarkExporter());
defaultRegistry.register(new PDFExporter());

export { defaultRegistry as registry };

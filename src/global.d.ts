/// <reference types="@sveltejs/kit" />

declare module 'gif.js' {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    repeat?: number;
    background?: string;
    transparent?: string | null;
    workerScript?: string;
  }

  interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }

  class GIF {
    constructor(options?: GIFOptions);
    addFrame(image: HTMLCanvasElement | CanvasRenderingContext2D | HTMLImageElement, options?: AddFrameOptions): void;
    render(): void;
    on(event: 'finished', callback: (blob: Blob) => void): void;
    on(event: 'progress', callback: (progress: number) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
  }

  export = GIF;
}

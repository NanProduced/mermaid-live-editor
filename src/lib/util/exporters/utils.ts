import { version as FAVersion } from '@fortawesome/fontawesome-free/package.json';
import dayjs from 'dayjs';
import { toBase64 } from 'js-base64';

const FONT_AWESOME_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FAVersion}/css/all.min.css`;

export const getFileName = (extension: string): string =>
  `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

export const fixForeignObjectClipping = (svg: HTMLElement): void => {
  const foreignObjects = svg.querySelectorAll('foreignObject');
  foreignObjects.forEach((foreignObj) => {
    const currentHeight = parseFloat(foreignObj.getAttribute('height') || '0');
    if (currentHeight <= 0) return;

    const currentY = parseFloat(foreignObj.getAttribute('y') || '0');
    const newHeight = currentHeight * 1.5;
    const heightDiff = newHeight - currentHeight;

    foreignObj.setAttribute('height', newHeight.toString());
    foreignObj.setAttribute('y', (currentY - heightDiff / 2).toString());

    const htmlElements = foreignObj.querySelectorAll('div, span, p');
    htmlElements.forEach((htmlEl) => {
      const el = htmlEl as HTMLElement;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.height = '100%';
    });
  });
};

export const getSvgElement = (selector = '#container svg'): HTMLElement => {
  const svgElement = document.querySelector(selector)?.cloneNode(true) as HTMLElement;
  if (!svgElement) {
    throw new Error('SVG element not found');
  }
  svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return svgElement;
};

export const getBase64SVG = (
  svg?: HTMLElement,
  options?: {
    width?: number;
    height?: number;
    rough?: boolean;
    backgroundColor?: string;
  }
): string => {
  const { width, height, rough = false, backgroundColor } = options || {};

  if (svg) {
    svg = svg.cloneNode(true) as HTMLElement;
  }

  if (!svg) {
    svg = getSvgElement();
  }

  if (height) {
    svg.setAttribute('height', `${height}px`);
  }
  if (width) {
    svg.setAttribute('width', `${width}px`);
  }

  if (rough) {
    fixForeignObjectClipping(svg);
  }

  const bgColor =
    backgroundColor || window.getComputedStyle(document.body).getPropertyValue('--background');
  svg.style.backgroundColor = bgColor;

  const svgString = svg.outerHTML
    .replaceAll('<br>', '<br/>')
    .replaceAll(/<img([^>]*)>/g, (m, g: string) => `<img ${g} />`);

  return toBase64(`<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="${FONT_AWESOME_URL}" type="text/css"?>
${svgString}`);
};

export const simulateDownload = (download: string, href: string): void => {
  const a = document.createElement('a');
  a.download = download;
  a.href = href;
  a.click();
  a.remove();
};

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1] || base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const calculateHash = async (data: ArrayBuffer | string): Promise<string> => {
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    const encoder = new TextEncoder();
    buffer = encoder.encode(data);
  } else {
    buffer = data;
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const getWatermarkPosition = (
  position: string,
  canvasWidth: number,
  canvasHeight: number,
  elementWidth: number,
  elementHeight: number
): { x: number; y: number } => {
  const margin = 20;
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin };
    case 'top-right':
      return { x: canvasWidth - elementWidth - margin, y: margin };
    case 'bottom-left':
      return { x: margin, y: canvasHeight - elementHeight - margin };
    case 'bottom-right':
      return { x: canvasWidth - elementWidth - margin, y: canvasHeight - elementHeight - margin };
    case 'center':
      return { x: (canvasWidth - elementWidth) / 2, y: (canvasHeight - elementHeight) / 2 };
    default:
      return { x: margin, y: margin };
  }
};

<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import CopyButton from '$/components/CopyButton.svelte';
  import CopyInput from '$/components/CopyInput.svelte';
  import ExternalLinkWrapper from '$/components/ExternalLinkWrapper.svelte';
  import { Button } from '$/components/ui/button';
  import * as Dialog from '$/components/ui/dialog';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import { Switch } from '$/components/ui/switch';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { TID } from '$/constants';
  import { getDomain } from '$/util/util';
  import { browser } from '$app/environment';
  import { waitForRender } from '$lib/util/autoSync';
  import {
    exportWorkspaceAsMarkdown,
    importWorkspaceFromMarkdown,
    inputStateStore,
    stateStore,
    urlsStore,
    workspaceStore
  } from '$lib/util/state';
  import { logEvent } from '$lib/util/stats';
  import { version as FAVersion } from '@fortawesome/fontawesome-free/package.json';
  import dayjs from 'dayjs';
  import { toBase64 } from 'js-base64';
  import DownloadIcon from '~icons/material-symbols/download';
  import UploadIcon from '~icons/material-symbols/upload-rounded';
  import ExternalLinkIcon from '~icons/material-symbols/open-in-new-rounded';
  import WidthIcon from '~icons/material-symbols/width-rounded';
  import CloseIcon from '~icons/material-symbols/close-rounded';

  const FONT_AWESOME_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FAVersion}/css/all.min.css`;

  type Exporter = (context: CanvasRenderingContext2D, image: HTMLImageElement) => () => void;

  const getFileName = (extension: string) =>
    `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

  /**
   * Fix text clipping in exported SVG for hand-drawn (rough) mode.
   * svg2roughjs copies foreignObject elements but their height is often insufficient,
   * causing text bottom edges to be cut off regardless of language.
   */
  const fixForeignObjectClipping = (svg: HTMLElement) => {
    const foreignObjects = svg.querySelectorAll('foreignObject');
    foreignObjects.forEach((foreignObj) => {
      const currentHeight = parseFloat(foreignObj.getAttribute('height') || '0');
      if (currentHeight <= 0) return;

      const currentY = parseFloat(foreignObj.getAttribute('y') || '0');
      const newHeight = currentHeight * 1.5;
      const heightDiff = newHeight - currentHeight;

      foreignObj.setAttribute('height', newHeight.toString());
      foreignObj.setAttribute('y', (currentY - heightDiff / 2).toString());

      // Ensure inner HTML elements are vertically centered within the expanded area
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

  const getSvgElement = () => {
    const svgElement = document.querySelector('#container svg')?.cloneNode(true) as HTMLElement;
    svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    return svgElement;
  };

  const getBase64SVG = (svg?: HTMLElement, width?: number, height?: number): string => {
    if (svg) {
      // Prevents the SVG size of the interface from being changed
      svg = svg.cloneNode(true) as HTMLElement;
    }
    if (height) {
      svg?.setAttribute('height', `${height}px`);
    }
    if (width) {
      svg?.setAttribute('width', `${width}px`);
    }
    // Workaround https://stackoverflow.com/questions/28690643/firefox-error-rendering-an-svg-image-to-html5-canvas-with-drawimage

    if (!svg) {
      svg = getSvgElement();
    }

    if ($stateStore.rough) {
      fixForeignObjectClipping(svg);
    }

    svg.style.backgroundColor = window
      .getComputedStyle(document.body)
      .getPropertyValue('--background');

    const svgString = svg.outerHTML
      .replaceAll('<br>', '<br/>')
      .replaceAll(/<img([^>]*)>/g, (m, g: string) => `<img ${g} />`);

    return toBase64(`<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="${FONT_AWESOME_URL}" type="text/css"?>
${svgString}`);
  };

  const simulateDownload = (download: string, href: string): void => {
    const a = document.createElement('a');
    a.download = download;
    a.href = href;
    a.click();
    a.remove();
  };

  const exportImage = async (event: Event, exporter: Exporter) => {
    $inputStateStore.panZoom = false;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await waitForRender();
    const canvas = document.createElement('canvas');
    const svg = document.querySelector<HTMLElement>('#container svg');
    if (!svg) {
      throw new Error('svg not found');
    }

    const box = svg.getBoundingClientRect();

    // In rough mode, SVG has width/height="100%" so getBoundingClientRect returns
    // the container size, not the actual diagram size. Use viewBox dimensions instead.
    const svgEl = svg as unknown as SVGSVGElement;
    const viewBox = svgEl.viewBox?.baseVal;
    const contentWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
    const contentHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;

    if (imageSizeMode === 'width') {
      const ratio = contentHeight / contentWidth;
      canvas.width = imageSize;
      canvas.height = imageSize * ratio;
    } else if (imageSizeMode === 'height') {
      const ratio = contentWidth / contentHeight;
      canvas.width = imageSize * ratio;
      canvas.height = imageSize;
    } else {
      const multiplier = 2;
      canvas.width = contentWidth * multiplier;
      canvas.height = contentHeight * multiplier;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('context not found');
    }

    context.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
    context.fillRect(0, 0, canvas.width, canvas.height);

    const image = new Image();
    image.addEventListener('load', () => {
      exporter(context, image)();
      $inputStateStore.panZoom = true;
    });
    image.src = `data:image/svg+xml;base64,${getBase64SVG(svg, canvas.width, canvas.height)}`;
    // Fallback to set panZoom to true after 2 seconds
    // This is a workaround for the case when the image is not loaded
    setTimeout(() => {
      if (!$inputStateStore.panZoom) {
        $inputStateStore.panZoom = true;
      }
    }, 2000);
    event.stopPropagation();
    event.preventDefault();
  };

  const downloadImage: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      simulateDownload(
        getFileName('png'),
        canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream')
      );
    };
  };

  const isClipboardAvailable = (): boolean => {
    return Object.prototype.hasOwnProperty.call(window, 'ClipboardItem');
  };

  const clipboardCopy: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        try {
          if (!blob) {
            throw new Error('blob is empty');
          }
          void navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
        } catch (error) {
          console.error(error);
        }
      });
    };
  };

  const onCopyClipboard = async (event: Event) => {
    await exportImage(event, clipboardCopy);
    logEvent('copyClipboard');
  };

  const onDownloadPNG = async (event: Event) => {
    await exportImage(event, downloadImage);
    logEvent('download', {
      type: 'png'
    });
  };

  const onDownloadSVG = () => {
    simulateDownload(getFileName('svg'), `data:image/svg+xml;base64,${getBase64SVG()}`);
    logEvent('download', {
      type: 'svg'
    });
  };

  let gistURL = $state('');
  stateStore.subscribe(({ loader }) => {
    if (loader?.type === 'gist') {
      gistURL = loader.config.url;
    }
  });

  const loadGist = () => {
    if (!gistURL) {
      return alert('Please enter a Gist URL first');
    }
    window.location.href = `${window.location.pathname}?gist=${gistURL}`;
    logEvent('loadGist');
  };

  let imageSizeMode: 'auto' | 'width' | 'height' = $state('auto');

  $effect(() => {
    if (!imageSizeMode) {
      imageSizeMode = 'auto';
    }
  });

  let imageSize = $state(1080);

  const isNetlify = browser && window.location.host.includes('netlify');

  let showImportDialog = $state(false);
  let importMarkdown = $state('');
  let importReplaceExisting = $state(false);

  const onExportWorkspace = () => {
    const markdown = exportWorkspaceAsMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    simulateDownload(`mermaid-workspace-${dayjs().format('YYYY-MM-DD-HHmmss')}.md`, url);
    URL.revokeObjectURL(url);
    logEvent('exportWorkspace');
  };

  const onImportWorkspace = () => {
    showImportDialog = true;
    importMarkdown = '';
    importReplaceExisting = false;
  };

  const handleImport = () => {
    if (!importMarkdown.trim()) {
      alert('Please paste your markdown content first');
      return;
    }
    const docs = importWorkspaceFromMarkdown(importMarkdown, importReplaceExisting);
    if (docs.length === 0) {
      alert('No mermaid diagrams found in the provided markdown');
      return;
    }
    showImportDialog = false;
    logEvent('importWorkspace', { count: docs.length });
  };

  const handleFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      importMarkdown = content;
    };
    reader.readAsText(file);
  };
</script>

{#snippet dualActionButton(text: string, download: (event: Event) => unknown, url?: string)}
  <div class="flex flex-grow gap-0.5">
    <Button
      class={['flex-grow', url && 'rounded-r-none']}
      onclick={download}
      data-testid="download-{text}">
      <DownloadIcon />
      {text}
    </Button>
    <ExternalLinkWrapper domain={getDomain(url)} isVisible={!!url}>
      <Button class="rounded-l-none" href={url} target="_blank" rel="noreferrer noopener">
        <ExternalLinkIcon />
      </Button>
    </ExternalLinkWrapper>
  </div>
{/snippet}

<Card title="Actions" isStackable icon={{ component: DownloadIcon, class: 'rotate-180' }}>
  <div class="flex min-w-fit flex-col gap-2 p-2">
    <div class="flex w-full items-center gap-2 py-2 whitespace-nowrap">
      PNG size
      <ToggleGroup.Root type="single" variant="outline" bind:value={imageSizeMode}>
        <ToggleGroup.Item value="auto">Auto</ToggleGroup.Item>
        <ToggleGroup.Item value="width">Width</ToggleGroup.Item>
        <ToggleGroup.Item value="height">Height</ToggleGroup.Item>
      </ToggleGroup.Root>
      {#if imageSizeMode !== 'auto'}
        <WidthIcon
          class={['size-6 shrink-0 transition-all', imageSizeMode === 'width' && 'rotate-90']} />
      {/if}
      <Input
        type="number"
        min="3"
        max="10000"
        disabled={imageSizeMode === 'auto'}
        bind:value={imageSize} />
    </div>
    <div class="flex gap-2">
      {@render dualActionButton('PNG', onDownloadPNG, $urlsStore.png)}
      {@render dualActionButton('SVG', onDownloadSVG, $urlsStore.svg)}
      <ExternalLinkWrapper domain={getDomain($urlsStore.kroki)} isVisible={!!$urlsStore.kroki}>
        <a target="_blank" rel="noreferrer" class="flex-grow" href={$urlsStore.kroki}>
          <Button class="action-btn flex w-full items-center gap-2">
            <ExternalLinkIcon /> Kroki
          </Button>
        </a>
      </ExternalLinkWrapper>
    </div>
    <Separator />
    {#if $workspaceStore && Object.keys($workspaceStore.docs).length > 1}
      <div class="flex gap-2">
        <Button variant="outline" onclick={onExportWorkspace} class="flex-1">
          <DownloadIcon class="h-4 w-4" />
          Export Workspace
        </Button>
        <Button variant="outline" onclick={onImportWorkspace} class="flex-1">
          <UploadIcon class="h-4 w-4" />
          Import Workspace
        </Button>
      </div>
      <Separator />
    {/if}
    {#if isClipboardAvailable()}
      <CopyButton onclick={onCopyClipboard} label="Copy Image" />
    {/if}
    <ExternalLinkWrapper
      labelPrefix="Thumbnail generated by"
      domain={getDomain($urlsStore.png)}
      isVisible={!!$urlsStore.mdCode}>
      <CopyInput value={$urlsStore.mdCode} label="Copy Markdown" testID={TID.copyMarkdown} />
    </ExternalLinkWrapper>
    <div class="flex w-full items-center gap-2">
      <Input type="url" bind:value={gistURL} placeholder="Enter Gist URL" />
      <Button onclick={loadGist}>Load Gist</Button>
    </div>
    {#if isNetlify}
      <div class="flex w-full items-center justify-center">
        <a class="link text-sm text-gray-500 underline" href="https://netlify.com">
          This site is powered by Netlify
        </a>
      </div>
    {/if}
  </div>
</Card>

<Dialog.Root bind:open={showImportDialog}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg">
      <Dialog.Header>
        <Dialog.Title class="flex items-center justify-between text-xl">
          <span>Import Workspace</span>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" class="h-8 w-8">
              <CloseIcon class="h-4 w-4" />
            </Button>
          </Dialog.Close>
        </Dialog.Title>
        <Dialog.Description>
          Paste markdown content containing mermaid code blocks, or select a .md file to import.
        </Dialog.Description>
      </Dialog.Header>

      <div class="mt-4 flex flex-col gap-4">
        <div class="flex gap-2">
          <Button
            variant="outline"
            class="flex-1"
            onclick={() => document.getElementById('workspace-file-input')?.click()}>
            <UploadIcon class="mr-2 h-4 w-4" />
            Select File
          </Button>
          <input
            id="workspace-file-input"
            type="file"
            accept=".md,.markdown"
            class="hidden"
            onchange={handleFileSelect} />
        </div>

        <div class="relative">
          <textarea
            bind:value={importMarkdown}
            placeholder="Paste your markdown content here...

Example:
# My Diagram
\`\`\`mermaid
flowchart TD
    A --> B
\`\`\`

# Another Diagram
\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
\`\`\`"
            class="h-64 w-full rounded-md border border-input bg-background p-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none" />
        </div>

        <div class="flex items-center gap-3">
          <Switch id="replace-existing" bind:checked={importReplaceExisting} />
          <label for="replace-existing" class="text-sm">
            Replace existing diagrams (unchecked = append)
          </label>
        </div>
      </div>

      <Dialog.Footer class="mt-6 flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button variant="outline">Cancel</Button>
        </Dialog.Close>
        <Button onclick={handleImport}>Import</Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

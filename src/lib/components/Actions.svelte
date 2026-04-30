<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import CopyButton from '$/components/CopyButton.svelte';
  import CopyInput from '$/components/CopyInput.svelte';
  import ExternalLinkWrapper from '$/components/ExternalLinkWrapper.svelte';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import * as Dialog from '$/components/ui/dialog';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { TID } from '$/constants';
  import { getDomain } from '$/util/util';
  import { browser } from '$app/environment';
  import { waitForRender } from '$lib/util/autoSync';
  import { inputStateStore, stateStore, urlsStore } from '$lib/util/state';
  import { logEvent } from '$lib/util/stats';
  import dayjs from 'dayjs';
  import DownloadIcon from '~icons/material-symbols/download';
  import ExternalLinkIcon from '~icons/material-symbols/open-in-new-rounded';
  import WidthIcon from '~icons/material-symbols/width-rounded';
  import SettingsIcon from '~icons/material-symbols/settings';

  import {
    registry,
    type Exporter,
    type ExporterOptions,
    type ProgressCallback,
    simulateDownload,
    getBase64SVG
  } from '$lib/util/exporters';
  import JsonSchemaForm from '$/components/JsonSchemaForm/JsonSchemaForm.svelte';
  import { Progress } from '$/components/ui/progress';
  import { get } from 'svelte/store';

  const getFileName = (extension: string) =>
    `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

  let imageSizeMode: 'auto' | 'width' | 'height' = $state('auto');
  let imageSize = $state(1080);

  const isNetlify = browser && window.location.host.includes('netlify');

  let exporters = $derived(registry.getAll());
  let selectedExporter = $state<Exporter | null>(null);
  let exporterOptions = $state<ExporterOptions>({});
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let exportProgressMessage = $state('');
  let showOptionsDialog = $state(false);

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

  const openExport = async (exporter: Exporter) => {
    if (exporter.getOptionsSchema && exporter.getDefaultOptions) {
      selectedExporter = exporter;
      exporterOptions = exporter.getDefaultOptions();
      showOptionsDialog = true;
    } else {
      await runExport(exporter);
    }
  };

  const runExport = async (exporter: Exporter, options?: ExporterOptions) => {
    isExporting = true;
    exportProgress = 0;
    exportProgressMessage = 'Starting export...';

    try {
      const currentState = get(inputStateStore);

      const onProgress: ProgressCallback = (progress, message) => {
        exportProgress = progress;
        if (message) {
          exportProgressMessage = message;
        }
      };

      const result = await exporter.run(currentState, options, onProgress);

      const url = URL.createObjectURL(result.blob);
      simulateDownload(result.filename, url);
      URL.revokeObjectURL(url);

      logEvent('download', {
        type: exporter.id
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error as Error).message);
    } finally {
      isExporting = false;
      showOptionsDialog = false;
    }
  };

  const confirmExport = () => {
    if (selectedExporter) {
      runExport(selectedExporter, exporterOptions);
    }
  };

  const isClipboardAvailable = (): boolean => {
    return Object.prototype.hasOwnProperty.call(window, 'ClipboardItem');
  };

  type ExporterLegacy = (context: CanvasRenderingContext2D, image: HTMLImageElement) => () => void;

  const exportImage = async (event: Event, exporter: ExporterLegacy) => {
    $inputStateStore.panZoom = false;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await waitForRender();
    const canvas = document.createElement('canvas');
    const svg = document.querySelector<HTMLElement>('#container svg');
    if (!svg) {
      throw new Error('svg not found');
    }

    const box = svg.getBoundingClientRect();

    const svgEl = svg as unknown as SVGSVGElement;
    const viewBox = svgEl.viewBox?.baseVal;
    const contentWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
    const contentHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;

    let canvasWidth: number;
    let canvasHeight: number;

    if (imageSizeMode === 'width') {
      const ratio = contentHeight / contentWidth;
      canvasWidth = imageSize;
      canvasHeight = imageSize * ratio;
    } else if (imageSizeMode === 'height') {
      const ratio = contentWidth / contentHeight;
      canvasWidth = imageSize * ratio;
      canvasHeight = imageSize;
    } else {
      const multiplier = 2;
      canvasWidth = contentWidth * multiplier;
      canvasHeight = contentHeight * multiplier;
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
    const base64Svg = getBase64SVG(svg, {
      width: canvasWidth,
      height: canvasHeight,
      rough: $stateStore.rough
    });
    image.src = `data:image/svg+xml;base64,${base64Svg}`;
    setTimeout(() => {
      if (!$inputStateStore.panZoom) {
        $inputStateStore.panZoom = true;
      }
    }, 2000);
    event.stopPropagation();
    event.preventDefault();
  };

  const clipboardCopy: ExporterLegacy = (context, image) => {
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

  const onDownloadSVG = () => {
    const svg = document.querySelector<HTMLElement>('#container svg');
    if (svg) {
      const base64Svg = getBase64SVG(svg, {
        rough: $stateStore.rough
      });
      simulateDownload(getFileName('svg'), `data:image/svg+xml;base64,${base64Svg}`);
    } else {
      simulateDownload(getFileName('svg'), `data:image/svg+xml;base64,${getBase64SVG()}`);
    }
    logEvent('download', {
      type: 'svg'
    });
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

    <div class="flex flex-wrap gap-2">
      {#each exporters as exporter (exporter.id)}
        <div class="flex gap-0.5">
          <Button
            class="flex-grow"
            onclick={() => openExport(exporter)}
            data-testid="export-{exporter.id}"
            disabled={isExporting}>
            <DownloadIcon />
            {exporter.name}
          </Button>
          {#if exporter.getOptionsSchema}
            <Button
              size="icon"
              variant="ghost"
              onclick={() => {
                selectedExporter = exporter;
                if (exporter.getDefaultOptions) {
                  exporterOptions = exporter.getDefaultOptions();
                }
                showOptionsDialog = true;
              }}
              disabled={isExporting}>
              <SettingsIcon class="size-4" />
            </Button>
          {/if}
        </div>
      {/each}

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

<Dialog.Root bind:open={showOptionsDialog}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-2xl">
      <Dialog.Header>
        <Dialog.Title>
          {selectedExporter?.name || 'Export'} Options
        </Dialog.Title>
      </Dialog.Header>

      <div class="py-4">
        {#if selectedExporter?.getOptionsSchema}
          <JsonSchemaForm
            schema={selectedExporter.getOptionsSchema()}
            bind:value={exporterOptions} />
        {/if}

        {#if isExporting}
          <div class="mt-4 space-y-2">
            <Progress value={exportProgress} max={1} showLabel label={exportProgressMessage} />
          </div>
        {/if}
      </div>

      <Dialog.Footer class="gap-2">
        <Dialog.Close asChild>
          <Button variant="outline" disabled={isExporting}>Cancel</Button>
        </Dialog.Close>
        <Button onclick={confirmExport} disabled={isExporting}>
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

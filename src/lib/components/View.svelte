<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { render as renderDiagram } from '$/util/mermaid';
  import {
    activePreviewNode,
    nodeMap,
    previewHoverNodeId,
    selectedNodeId,
    showContextMenu
  } from '$/util/nodeLinker';
  import { findSvgNodeElement } from '$/util/nodeParser';
  import { PanZoomState } from '$/util/panZoom';
  import { inputStateStore, stateStore, updateCodeStore } from '$/util/state';
  import { saveStatistics } from '$/util/stats';
  import FontAwesome, { mayContainFontAwesome } from '$lib/components/FontAwesome.svelte';
  import NodeContextMenu from '$lib/components/NodeContextMenu.svelte';
  import uniqueID from 'lodash-es/uniqueId';
  import type { MermaidConfig } from 'mermaid';
  import { mode } from 'mode-watcher';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import { Svg2Roughjs } from 'svg2roughjs';

  let {
    panZoomState = new PanZoomState(),
    shouldShowGrid = true
  }: { panZoomState?: PanZoomState; shouldShowGrid?: boolean } = $props();
  let code = '';
  let config = '';
  let container: HTMLDivElement | undefined = $state();
  let rough: boolean;
  let view: HTMLDivElement | undefined = $state();
  let error = $state(false);
  let panZoom = true;
  let manualUpdate = true;
  let waitForFontAwesomeToLoad: FontAwesome['waitForFontAwesomeToLoad'] | undefined = $state();

  // Set up panZoom state observer to update the store when pan/zoom changes
  const setupPanZoomObserver = () => {
    panZoomState.onPanZoomChange = (pan, zoom) => {
      updateCodeStore({ pan, zoom });
    };
  };

  const handlePanZoom = (state: State, graphDiv: SVGSVGElement) => {
    try {
      panZoomState.updateElement(graphDiv, state);
    } catch (error) {
      console.error('PanZoom error:', error);
    }
  };

  // ─── Node Linker: bidirectional preview ↔ editor linking ───

  let viewID = '';
  let currentlyHighlightedElement: SVGElement | null = null;

  /**
   * Attach hover, click, and context menu listeners to all rendered SVG node groups.
   * Called after each SVG re-render.
   */
  const attachNodeListeners = () => {
    if (!container) return;

    const nodeGroups = container.querySelectorAll<SVGGElement>('g[id]');
    for (const g of nodeGroups) {
      // Skip edge groups (Mermaid edge IDs start with `L-`)
      if (g.id.startsWith('L-') || g.id.startsWith('edge-')) continue;

      // Skip groups without visible shapes (not a node)
      if (!g.querySelector('rect, circle, polygon, ellipse, foreignObject')) continue;

      // Derive the user-facing node ID from the SVG group's id
      const nodeId = extractNodeIdFromSvgId(g.id);
      if (!nodeId) continue;

      // Verify this node ID exists in our parsed node map
      const nodes = get(nodeMap);
      if (!nodes.has(nodeId)) continue;

      g.style.cursor = 'pointer';

      g.addEventListener('mouseenter', () => {
        previewHoverNodeId.set(nodeId);
      });

      g.addEventListener('mouseleave', () => {
        previewHoverNodeId.set(null);
      });

      g.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedNodeId.update((prev) => (prev === nodeId ? null : nodeId));
      });

      g.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedNodeId.set(nodeId);
        showContextMenu(nodeId, e.clientX, e.clientY);
      });
    }
  };

  /**
   * Extract the user-defined node ID from an SVG element's generated ID.
   * Mermaid v11 prefixes IDs with the viewID (e.g. `graph-1-flowchart-A-0`).
   * Falls back to patterns without prefix for robustness.
   */
  const extractNodeIdFromSvgId = (svgId: string): string | null => {
    // Strip the current viewID prefix if present (Mermaid v11: `{viewID}-flowchart-{nodeId}-{n}`)
    const effectiveId = svgId.startsWith(viewID + '-')
      ? svgId.slice(viewID.length + 1)
      : svgId;
    // Also try generic prefix stripping (e.g. `graph-1-flowchart-A-0` → `flowchart-A-0`)
    const generic = effectiveId.replace(/^[^-]+-\d+-/, '');

    for (const id of [effectiveId, generic]) {
      // Pattern: flowchart-{nodeId}-{number}
      let match = /^flowchart-(.+)-\d+$/.exec(id);
      if (match) return match[1];

      // Pattern: D-{nodeId}-{number}
      match = /^D-(.+)-\d+$/.exec(id);
      if (match) return match[1];
    }

    // Pattern: plain nodeId (no prefix, no suffix)
    const plainMatch = /^[A-Za-z_][\w-]*$/.exec(svgId);
    if (plainMatch) return plainMatch[0];

    return null;
  };

  /**
   * Update the visual highlight on the SVG node that corresponds to the active node.
   */
  const updatePreviewHighlight = () => {
    if (!container) return;

    // Remove highlight from previously highlighted element
    if (currentlyHighlightedElement) {
      currentlyHighlightedElement.classList.remove('mermaid-node-active');
      currentlyHighlightedElement = null;
    }

    const activeId = get(activePreviewNode);
    if (!activeId) return;

    const element = findSvgNodeElement(container, activeId);
    if (element) {
      element.classList.add('mermaid-node-active');
      currentlyHighlightedElement = element;
    }
  };

  const handleStateChange = async (state: ValidatedState) => {
    const startTime = Date.now();
    if (state.error !== undefined) {
      error = true;
      return;
    }
    error = false;
    let diagramType: string | undefined;
    try {
      if (container) {
        manualUpdate = true;
        // Do not render if there is no change in Code/Config/PanZoom
        if (
          code === state.code &&
          config === state.mermaid &&
          rough === state.rough &&
          panZoom === state.panZoom
        ) {
          return;
        }

        if (!shouldRefreshView()) {
          return;
        }

        code = state.code;
        config = state.mermaid;
        rough = state.rough;
        panZoom = state.panZoom ?? true;

        if (mayContainFontAwesome(code)) {
          await waitForFontAwesomeToLoad?.();
        }

        const scroll = view?.parentElement?.scrollTop;
        delete container.dataset.processed;
        viewID = uniqueID('graph-');
        const {
          svg,
          bindFunctions,
          diagramType: detectedDiagramType
        } = await renderDiagram(JSON.parse(state.mermaid) as MermaidConfig, code, viewID);
        diagramType = detectedDiagramType;
        if (svg.length > 0) {
          // eslint-disable-next-line svelte/no-dom-manipulating
          container.innerHTML = svg;
          let graphDiv = document.querySelector<SVGSVGElement>(`#${viewID}`);
          if (!graphDiv) {
            throw new Error('graph-div not found');
          }
          if (state.rough) {
            const svg2roughjs = new Svg2Roughjs('#container');
            svg2roughjs.svg = graphDiv;
            await svg2roughjs.sketch();
            graphDiv.remove();
            const sketch = document.querySelector<SVGSVGElement>('#container > svg');
            if (!sketch) {
              throw new Error('sketch not found');
            }
            const height = sketch.getAttribute('height');
            const width = sketch.getAttribute('width');
            sketch.setAttribute('id', 'graph-div');
            sketch.setAttribute('height', '100%');
            sketch.setAttribute('width', '100%');
            sketch.setAttribute('viewBox', `0 0 ${width} ${height}`);
            sketch.style.maxWidth = '100%';
            graphDiv = sketch;
          } else {
            graphDiv.setAttribute('height', '100%');
            graphDiv.style.maxWidth = '100%';
            if (bindFunctions) {
              bindFunctions(graphDiv);
            }
          }
          if (state.panZoom) {
            handlePanZoom(state, graphDiv);
          }

          // Attach node interaction listeners after SVG render
          attachNodeListeners();
          // Update highlight for any active node from editor
          updatePreviewHighlight();
        }
        if (view?.parentElement && scroll) {
          view.parentElement.scrollTop = scroll;
        }
        error = false;
      } else if (manualUpdate) {
        manualUpdate = false;
      }
    } catch (error_) {
      console.error('view fail', error_);
      error = true;
    }
    const renderTime = Date.now() - startTime;
    saveStatistics({ code, diagramType, isRough: state.rough, renderTime });
    recordRenderTime(renderTime, () => {
      $inputStateStore.updateDiagram = true;
    });
  };

  onMount(() => {
    setupPanZoomObserver();
    // Queue state changes to avoid race condition
    let pendingStateChange = Promise.resolve();
    const unsubscribeState = stateStore.subscribe((state) => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      pendingStateChange = pendingStateChange.then(() => handleStateChange(state).catch(() => {}));
    });

    // React to active node changes from editor (cursor movement / preview click)
    const unsubscribeActiveNode = activePreviewNode.subscribe(() => {
      updatePreviewHighlight();
    });

    return () => {
      unsubscribeState();
      unsubscribeActiveNode();
    };
  });

  // Click on empty space in preview to deselect
  const handleViewClick = () => {
    selectedNodeId.set(null);
  };
</script>

<FontAwesome bind:waitForFontAwesomeToLoad />

<div
  id="view"
  bind:this={view}
  role="application"
  aria-label="Mermaid diagram preview"
  onclick={handleViewClick}
  onkeydown={(e) => {
    if (e.key === 'Escape') selectedNodeId.set(null);
  }}
  tabindex={-1}
  class={['h-full w-full', shouldShowGrid && `grid-bg-${$mode}`, error && 'opacity-50']}>
  <div id="container" bind:this={container} class="h-full overflow-auto"></div>
</div>

<NodeContextMenu />

<style>
  .grid-bg-light {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #e4e4e48c 2px, #0000 2px);
  }

  .grid-bg-dark {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #46464646 2px, #0000 2px);
  }

  /* Highlight for SVG nodes linked to editor cursor or selection */
  :global(.mermaid-node-active) rect,
  :global(.mermaid-node-active) circle,
  :global(.mermaid-node-active) polygon,
  :global(.mermaid-node-active) ellipse {
    stroke: #2563eb !important;
    stroke-width: 4px !important;
    filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.7)) !important;
    animation: mermaid-node-pulse 1.2s ease-in-out infinite;
  }

  :global(.dark .mermaid-node-active) rect,
  :global(.dark .mermaid-node-active) circle,
  :global(.dark .mermaid-node-active) polygon,
  :global(.dark .mermaid-node-active) ellipse {
    stroke: #93c5fd !important;
    stroke-width: 4px !important;
    filter: drop-shadow(0 0 10px rgba(147, 197, 253, 0.8)) !important;
  }

  @keyframes mermaid-node-pulse {
    0%, 100% { stroke-opacity: 1; }
    50% { stroke-opacity: 0.5; }
  }
</style>

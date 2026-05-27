<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { render as renderDiagram } from '$/util/mermaid';
  import { matchSvgToNodeId, parseNodes } from '$/util/nodeParser';
  import {
    contextMenuRequest,
    cursorNodeId,
    hoveredNodeId,
    navigationRequest
  } from '$/util/nodeSyncStore';
  import { PanZoomState } from '$/util/panZoom';
  import { inputStateStore, stateStore, updateCodeStore } from '$/util/state';
  import { saveStatistics } from '$/util/stats';
  import FontAwesome, { mayContainFontAwesome } from '$lib/components/FontAwesome.svelte';
  import NodeContextMenu from '$lib/components/NodeContextMenu.svelte';
  import uniqueID from 'lodash-es/uniqueId';
  import type { MermaidConfig } from 'mermaid';
  import { mode } from 'mode-watcher';
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

  // Node linking state
  let svgNodeMap = new Map<string, SVGElement>(); // nodeId -> SVG element
  let knownNodeIds: string[] = [];
  let highlightedSvgNodeId: string | null = null;

  /**
   * Walk the rendered SVG to build the nodeId → SVG element map.
   * Event handlers are attached to the container (event delegation) rather
   * than individual elements, making them robust against Mermaid DOM changes.
   */
  const setupNodeInteractions = () => {
    if (!container) return;

    const nodes = parseNodes(code);
    knownNodeIds = nodes.map((n) => n.id);
    svgNodeMap.clear();

    const nodeElements = container.querySelectorAll<SVGGElement>('g.node');
    for (const el of nodeElements) {
      const svgId = el.id;
      const nodeId = matchSvgToNodeId(svgId, knownNodeIds);
      if (nodeId) {
        svgNodeMap.set(nodeId, el as unknown as SVGElement);
        (el as unknown as SVGElement).style.cursor = 'pointer';
      }
    }
  };

  /**
   * Walk up from an event target to find the enclosing g.node, then resolve
   * its SVG element ID to a source-code node ID.
   */
  const getNodeIdFromElement = (target: EventTarget | null): string | null => {
    if (!target || !(target instanceof Element)) return null;
    const nodeGroup = target.closest('g.node');
    if (!nodeGroup?.id) return null;
    return matchSvgToNodeId(nodeGroup.id, knownNodeIds);
  };

  /** Event-delegation handler for mouseover/mouseout on the container */
  const handleContainerHover = (e: MouseEvent) => {
    if (!container) return;
    const nodeId = getNodeIdFromElement(e.target);

    if (e.type === 'mouseover') {
      if (nodeId) hoveredNodeId.set(nodeId);
    } else {
      // mouseout: only clear if the new target is outside the current node group
      const relatedTarget = e.relatedTarget as Element | null;
      const currentNodeGroup = relatedTarget?.closest('g.node');
      const currentNodeId = currentNodeGroup?.id
        ? matchSvgToNodeId(currentNodeGroup.id, knownNodeIds)
        : null;
      if (currentNodeId !== nodeId) {
        hoveredNodeId.set(null);
      }
    }
  };

  /** Event-delegation handler for click on the container */
  const handleContainerClick = (e: MouseEvent) => {
    const nodeId = getNodeIdFromElement(e.target);
    if (!nodeId) return;

    e.preventDefault();
    e.stopPropagation();

    const nodes = parseNodes(code);
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      navigationRequest.set({ line: node.line, column: node.column, nodeId });
    }
  };

  /** Event-delegation handler for contextmenu on the container */
  const handleContainerContextMenu = (e: MouseEvent) => {
    const nodeId = getNodeIdFromElement(e.target);
    if (!nodeId) return;

    e.preventDefault();
    e.stopPropagation();
    contextMenuRequest.set({
      nodeId,
      x: e.clientX,
      y: e.clientY
    });
  };

  /** Highlight a node in the preview based on cursorNodeId */
  const updatePreviewHighlight = (nodeId: string | null) => {
    // Remove old highlight
    if (highlightedSvgNodeId) {
      const oldEl = svgNodeMap.get(highlightedSvgNodeId);
      if (oldEl) {
        oldEl.classList.remove('node-linked-highlight');
      }
    }

    highlightedSvgNodeId = nodeId;

    // Add new highlight
    if (nodeId) {
      const el = svgNodeMap.get(nodeId);
      if (el) {
        el.classList.add('node-linked-highlight');
      }
    }
  };

  // Subscribe to cursorNodeId to update preview highlight
  $effect(() => {
    const unsub = cursorNodeId.subscribe((nodeId) => {
      updatePreviewHighlight(nodeId);
    });
    return unsub;
  });

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
        const viewID = uniqueID('graph-');
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
          // Setup node interaction handlers after rendering
          setupNodeInteractions();
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
    stateStore.subscribe((state) => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      pendingStateChange = pendingStateChange.then(() => handleStateChange(state).catch(() => {}));
    });
  });
</script>

<FontAwesome bind:waitForFontAwesomeToLoad />
<NodeContextMenu />

<div
  id="view"
  bind:this={view}
  class={['h-full w-full', shouldShowGrid && `grid-bg-${$mode}`, error && 'opacity-50']}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_mouse_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    id="container"
    bind:this={container}
    class="h-full overflow-auto"
    role="application"
    aria-label="Mermaid diagram preview"
    onmouseovercapture={handleContainerHover}
    onmouseoutcapture={handleContainerHover}
    onclickcapture={handleContainerClick}
    oncontextmenucapture={handleContainerContextMenu}></div>
</div>

<style>
  .grid-bg-light {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #e4e4e48c 2px, #0000 2px);
  }

  .grid-bg-dark {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #46464646 2px, #0000 2px);
  }

  /* Highlight for nodes linked from the editor cursor position */
  :global(.node-linked-highlight) {
    filter: drop-shadow(0 0 6px hsl(340 100% 44% / 0.7))
      drop-shadow(0 0 12px hsl(340 100% 44% / 0.4));
  }

  :global(.node-linked-highlight rect),
  :global(.node-linked-highlight circle),
  :global(.node-linked-highlight ellipse),
  :global(.node-linked-highlight polygon),
  :global(.node-linked-highlight path.node-shape) {
    stroke: hsl(340 100% 44%) !important;
    stroke-width: 2.5px !important;
  }
</style>

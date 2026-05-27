<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { render as renderDiagram } from '$/util/mermaid';
  import { getNodeIdFromSvgElement } from '$/util/mermaid';
  import { PanZoomState } from '$/util/panZoom';
  import { inputStateStore, stateStore, updateCodeStore } from '$/util/state';
  import { saveStatistics } from '$/util/stats';
  import { coordinationStore, cursorNodeId } from '$/util/coordinationStore';
  import FontAwesome, { mayContainFontAwesome } from '$lib/components/FontAwesome.svelte';
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

  let lastHighlightedNode: Element | null = null;

  const findNodeAncestor = (el: Element, root: Element): Element | null => {
    let current: Element | null = el;
    while (current && current !== root) {
      if (current.tagName === 'g' && current.classList?.contains('node')) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  const handleContainerMouseMove = (e: MouseEvent) => {
    if (!container) return;
    const nodeG = findNodeAncestor(e.target as Element, container);
    if (nodeG) {
      const nodeId = getNodeIdFromSvgElement(nodeG);
      coordinationStore.update((c) => ({ ...c, hoveredNodeId: nodeId }));
    } else {
      coordinationStore.update((c) => ({ ...c, hoveredNodeId: null }));
    }
  };

  const handleContainerMouseLeave = () => {
    coordinationStore.update((c) => ({ ...c, hoveredNodeId: null }));
  };

  const handleContainerClick = (e: MouseEvent) => {
    if (!container) return;
    const nodeG = findNodeAncestor(e.target as Element, container);
    if (nodeG) {
      const nodeId = getNodeIdFromSvgElement(nodeG);
      coordinationStore.update((c) => ({ ...c, selectedNodeId: nodeId }));
    }
  };

  const handleContainerContextMenu = (e: MouseEvent) => {
    if (!container) return;
    const nodeG = findNodeAncestor(e.target as Element, container);
    if (nodeG) {
      e.preventDefault();
      const nodeId = getNodeIdFromSvgElement(nodeG);
      coordinationStore.update((c) => ({
        ...c,
        contextMenu: { visible: true, nodeId, x: e.clientX, y: e.clientY }
      }));
    }
  };

  const clearNodeHighlight = () => {
    if (lastHighlightedNode) {
      lastHighlightedNode.classList.remove('mermaid-node-highlight');
      lastHighlightedNode = null;
    }
  };

  const applyNodeHighlight = (nodeId: string | null) => {
    clearNodeHighlight();
    if (nodeId && container) {
      const nodeEl =
        container.querySelector(`[id*="flowchart-${nodeId}-"]`) ??
        container.querySelector(`[id*="-${nodeId}-"]`);
      if (nodeEl) {
        nodeEl.classList.add('mermaid-node-highlight');
        lastHighlightedNode = nodeEl;
      }
    }
  };

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

        // Clear highlight state before re-render
        clearNodeHighlight();

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

    // Set up event delegation on container for node interactions
    if (container) {
      container.addEventListener('mousemove', handleContainerMouseMove);
      container.addEventListener('mouseleave', handleContainerMouseLeave);
      container.addEventListener('click', handleContainerClick, true);
      container.addEventListener('contextmenu', handleContainerContextMenu);
    }

    // Subscribe to cursorNodeId for preview highlighting
    const unsubscribeCursorNode = cursorNodeId.subscribe((nodeId) => {
      applyNodeHighlight(nodeId);
    });

    return () => {
      unsubscribeCursorNode();
      if (container) {
        container.removeEventListener('mousemove', handleContainerMouseMove);
        container.removeEventListener('mouseleave', handleContainerMouseLeave);
        container.removeEventListener('click', handleContainerClick, true);
        container.removeEventListener('contextmenu', handleContainerContextMenu);
      }
    };
  });
</script>

<FontAwesome bind:waitForFontAwesomeToLoad />

<div
  id="view"
  bind:this={view}
  class={['h-full w-full', shouldShowGrid && `grid-bg-${$mode}`, error && 'opacity-50']}>
  <div id="container" bind:this={container} class="h-full overflow-auto"></div>
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
</style>

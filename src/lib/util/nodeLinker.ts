/**
 * NodeLinker: shared state store that bridges the Monaco editor and the Mermaid preview.
 * Tracks which nodes are hovered/active in each pane and maintains the parsed node map.
 */

import { derived, writable } from 'svelte/store';
import { parseNodes, type NodeInfo } from './nodeParser';

/** Current map of parsed nodes from the source code */
export const nodeMap = writable<Map<string, NodeInfo>>(new Map());

/** Node ID currently hovered or cursor-positioned in the editor */
export const editorActiveNodeId = writable<string | null>(null);

/** Node ID currently hovered in the preview */
export const previewHoverNodeId = writable<string | null>(null);

/** Node ID selected (clicked) in the preview — persists until dismissed */
export const selectedNodeId = writable<string | null>(null);

/** The node that should be highlighted in the preview (derived from editor cursor) */
export const activePreviewNode = derived(
  [editorActiveNodeId, selectedNodeId],
  ([$editorActive, $selected]) => $selected ?? $editorActive
);

/** Context menu state for right-click on nodes */
export interface ContextMenuState {
  visible: boolean;
  nodeId: string | null;
  x: number;
  y: number;
}

export const contextMenuState = writable<ContextMenuState>({
  visible: false,
  nodeId: null,
  x: 0,
  y: 0
});

/**
 * Update the nodeMap store from the current source code.
 * Should be called whenever the editor content changes.
 */
export function updateNodeMapFromCode(code: string): void {
  nodeMap.set(parseNodes(code));
}

/**
 * Find which node corresponds to a given cursor line number.
 * Returns the node ID if the cursor is on a node definition line.
 */
export function findNodeAtLine(code: string, lineNumber: number): string | null {
  const nodes = parseNodes(code);
  for (const [id, info] of nodes) {
    if (info.line === lineNumber) {
      return id;
    }
  }
  return null;
}

/**
 * Show the context menu at the given position for the given node.
 */
export function showContextMenu(nodeId: string, x: number, y: number): void {
  contextMenuState.set({ visible: true, nodeId, x, y });
}

/**
 * Hide the context menu.
 */
export function hideContextMenu(): void {
  contextMenuState.set({ visible: false, nodeId: null, x: 0, y: 0 });
}
